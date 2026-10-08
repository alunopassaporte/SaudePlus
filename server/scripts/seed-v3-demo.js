/* Popula dados de demonstração da "agenda inteligente" (TAREFAS V3, Etapa 5):
   serviços da unidade, profissionais, vínculos e horários de atendimento.
   Idempotente: vínculos repetidos são ignorados (INSERT IGNORE no servidor). */
require('dotenv').config();
const pool = require('../src/db');

const UNIT_NAME = 'Posto de Saúde da Família Boa Esperança';

const UNIT_OFFERS = [
  { kind: 'consulta', name: 'Clínica Geral' },
  { kind: 'consulta', name: 'Cardiologia' },
  { kind: 'exame', name: 'Hemograma' },
];

const PROFESSIONALS = [
  {
    name: 'Dra. Maria da Silva', job_title: 'Médica', registry: 'CRM 12345-PE',
    services: [{ kind: 'consulta', name: 'Clínica Geral' }, { kind: 'consulta', name: 'Cardiologia' }],
    schedules: [
      { weekday: 1, start: '08:00', end: '12:00', slot: 30 },
      { weekday: 3, start: '08:00', end: '12:00', slot: 30 },
      { weekday: 5, start: '13:00', end: '17:00', slot: 30 },
    ],
  },
  {
    name: 'Téc. João Souza', job_title: 'Técnico de Enfermagem', registry: 'COREN 67890',
    services: [{ kind: 'exame', name: 'Hemograma' }],
    schedules: [
      { weekday: 2, start: '07:00', end: '11:00', slot: 20 },
      { weekday: 4, start: '07:00', end: '11:00', slot: 20 },
    ],
  },
];

async function main() {
  const [[unit]] = await pool.query('SELECT id FROM health_units WHERE name = ?', [UNIT_NAME]);
  if (!unit) { console.error(`Unidade não encontrada: ${UNIT_NAME}`); process.exit(1); }

  for (const offer of UNIT_OFFERS) {
    await pool.query(
      'INSERT IGNORE INTO unit_offers (id, unit_id, kind, name) VALUES (UUID(), ?, ?, ?)',
      [unit.id, offer.kind, offer.name]
    );
  }
  console.log(`Serviços da unidade: ${UNIT_OFFERS.length} verificados.`);

  for (const p of PROFESSIONALS) {
    let [[prof]] = await pool.query('SELECT id FROM professionals WHERE name = ?', [p.name]);
    if (!prof) {
      const id = require('crypto').randomUUID();
      await pool.query(
        'INSERT INTO professionals (id, name, job_title, registry) VALUES (?,?,?,?)',
        [id, p.name, p.job_title, p.registry]
      );
      prof = { id };
      console.log(`Profissional criado: ${p.name}`);
    }
    for (const s of p.services) {
      await pool.query(
        'INSERT IGNORE INTO professional_offers (id, professional_id, unit_id, kind, name) VALUES (UUID(), ?, ?, ?, ?)',
        [prof.id, unit.id, s.kind, s.name]
      );
    }
    for (const s of p.schedules) {
      await pool.query(
        `INSERT IGNORE INTO work_schedules (id, professional_id, unit_id, weekday, start_time, end_time, slot_minutes)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [prof.id, unit.id, s.weekday, s.start + ':00', s.end + ':00', s.slot]
      );
    }
    console.log(`Vínculos e horários de ${p.name} verificados.`);
  }

  await pool.end();
  console.log('Seed concluído.');
}

main().catch(err => { console.error(err); process.exit(1); });
