/* ==========================================================================
   Saúde+ — Regras de agendamento validadas NO SERVIDOR
   (TAREFAS V3, itens 4.5 e 6.2)

   - Janela de data: nada no passado, nada além de 1 ano.
   - Unidade precisa existir e estar ativa.
   - Serviço cadastrado na unidade exige profissional vinculado.
   - Profissional precisa estar ativo, vinculado à unidade e habilitado
     para aquele serviço, atender no dia/horário e não ter conflito.
   ========================================================================== */

const KINDS = ['consulta', 'exame'];
const MAX_DAYS_AHEAD = 366;

function parseDateTime(value) {
  if (!value || typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const d = new Date(value.trim().replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMinutes(hhmm) {
  // '08:00:00' ou '08:00' -> 480
  const parts = String(hhmm || '').split(':');
  if (parts.length < 2) return null;
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// Erro (string) ou null quando a data está dentro da janela permitida.
function validateScheduleWindow(value) {
  const d = parseDateTime(value);
  if (!d) return 'Informe uma data e horário válidos.';
  const now = Date.now();
  if (d.getTime() <= now) return 'Não é permitido agendar em data passada.';
  if (d.getTime() > now + MAX_DAYS_AHEAD * 24 * 3600 * 1000) {
    return 'Não é permitido agendar com mais de 1 ano de antecedência.';
  }
  return null;
}

async function fetchBusyIntervals(pool, professionalId, fromStr, toStr, excludeId) {
  const intervals = [];
  for (const table of ['appointments', 'exams']) {
    const [rows] = await pool.query(
      `SELECT id, scheduled_at FROM ${table}
       WHERE professional_id = ? AND status IN ('pendente', 'confirmado')
         AND scheduled_at BETWEEN ? AND ?`,
      [professionalId, `${fromStr} 00:00:00`, `${toStr} 23:59:59`]
    );
    for (const row of rows) {
      if (excludeId && row.id === excludeId) continue;
      const start = parseDateTime(row.scheduled_at);
      if (start) intervals.push({ start: start.getTime(), end: start.getTime() + 30 * 60000 });
    }
  }
  const [blocks] = await pool.query(
    `SELECT starts_at, ends_at FROM schedule_blocks
     WHERE professional_id = ? AND starts_at <= ? AND ends_at >= ?`,
    [professionalId, `${toStr} 23:59:59`, `${fromStr} 00:00:00`]
  );
  for (const row of blocks) {
    const start = parseDateTime(row.starts_at);
    const end = parseDateTime(row.ends_at);
    if (start && end) intervals.push({ start: start.getTime(), end: end.getTime() });
  }
  return intervals;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/*
 * Valida uma criação/edição de agendamento.
 * Retorna string de erro ou null quando liberado.
 *
 * opts = {
 *   kind: 'consulta' | 'exame',
 *   unitId, professionalId (pode ser null p/ serviço "Outro"),
 *   serviceName, scheduledAt, excludeId (registro em edição)
 * }
 */
async function validateBooking(pool, opts) {
  const { kind, unitId, professionalId, serviceName, scheduledAt, excludeId } = opts;
  if (!KINDS.includes(kind)) return 'Tipo de atendimento inválido.';

  const windowError = validateScheduleWindow(scheduledAt);
  if (windowError) return windowError;

  if (!unitId) return 'Selecione a unidade de saúde.';
  const [[unit]] = await pool.query('SELECT id, active FROM health_units WHERE id = ?', [unitId]);
  if (!unit) return 'Unidade de saúde não encontrada.';
  if (!Number(unit.active)) return 'Esta unidade de saúde está inativada.';

  // Serviço já cadastrado pela unidade?
  const [offers] = await pool.query(
    'SELECT id FROM unit_offers WHERE unit_id = ? AND kind = ? AND name = ? AND active = 1',
    [unitId, kind, serviceName || '']
  );
  const isRegisteredOffer = offers.length > 0;

  if (!professionalId) {
    // Serviço "Outro"/personalizado: a unidade aloca o atendimento depois.
    if (isRegisteredOffer) return 'Selecione um profissional para este atendimento.';
    return null;
  }

  const [[prof]] = await pool.query('SELECT id, active FROM professionals WHERE id = ?', [professionalId]);
  if (!prof) return 'Profissional não encontrado.';
  if (!Number(prof.active)) return 'Este profissional está inativo.';
  if (!isRegisteredOffer) {
    return 'Este serviço não está vinculado à unidade escolhida.';
  }

  const [links] = await pool.query(
    'SELECT id FROM professional_offers WHERE professional_id = ? AND unit_id = ? AND kind = ? AND name = ?',
    [professionalId, unitId, kind, serviceName]
  );
  if (!links.length) return 'Este profissional não atende este serviço nesta unidade.';

  const when = parseDateTime(scheduledAt);
  const weekday = when.getDay();
  const minutesOfDay = when.getHours() * 60 + when.getMinutes();

  const [schedules] = await pool.query(
    `SELECT start_time, end_time, slot_minutes FROM work_schedules
     WHERE professional_id = ? AND unit_id = ? AND weekday = ? AND active = 1`,
    [professionalId, unitId, weekday]
  );

  let slot = 30;
  let insideSchedule = false;
  for (const s of schedules) {
    const start = toMinutes(s.start_time);
    const end = toMinutes(s.end_time);
    const slotMin = Number(s.slot_minutes) || 30;
    if (start === null || end === null) continue;
    if (minutesOfDay >= start && minutesOfDay + slotMin <= end && (minutesOfDay - start) % slotMin === 0) {
      insideSchedule = true;
      slot = slotMin;
      break;
    }
  }
  if (!insideSchedule) return 'O profissional não atende neste dia e horário.';

  const dateStr = toDateStr(when);
  const intervals = await fetchBusyIntervals(pool, professionalId, dateStr, dateStr, excludeId);
  const startMs = when.getTime();
  const endMs = startMs + slot * 60000;
  for (const iv of intervals) {
    if (overlaps(startMs, endMs, iv.start, iv.end)) {
      return 'Este horário já está ocupado para este profissional.';
    }
  }
  return null;
}

/*
 * Disponibilidade em um intervalo de dias (usado pelo painel do paciente).
 * Retorna { days: [{ date, slots: ['08:00', ...] }], reason }
 * days cobre apenas dias com pelo menos 1 horário livre.
 */
async function getAvailability(pool, opts) {
  const { unitId, professionalId, kind, serviceName, fromDate, days = 30, excludeId } = opts;
  const empty = { days: [], reason: 'Nenhum horário disponível no momento.' };

  if (!unitId || !professionalId || !KINDS.includes(kind)) return empty;

  const [[unit]] = await pool.query('SELECT active FROM health_units WHERE id = ?', [unitId]);
  if (!unit || !Number(unit.active)) {
    return { days: [], reason: 'A unidade escolhida está inativada.' };
  }

  const [[prof]] = await pool.query('SELECT active FROM professionals WHERE id = ?', [professionalId]);
  if (!prof || !Number(prof.active)) {
    return { days: [], reason: 'O profissional escolhido está inativo.' };
  }

  const [links] = await pool.query(
    'SELECT id FROM professional_offers WHERE professional_id = ? AND unit_id = ? AND kind = ? AND name = ?',
    [professionalId, unitId, kind, serviceName || '']
  );
  if (!links.length) {
    return { days: [], reason: 'Este profissional não atende este serviço nesta unidade.' };
  }

  const [schedules] = await pool.query(
    `SELECT weekday, start_time, end_time, slot_minutes FROM work_schedules
     WHERE professional_id = ? AND unit_id = ? AND active = 1`,
    [professionalId, unitId]
  );
  if (!schedules.length) {
    return { days: [], reason: 'Este profissional ainda não tem horários cadastrados nesta unidade.' };
  }

  const start = new Date(fromDate + 'T00:00:00');
  if (isNaN(start.getTime())) return empty;
  const rangeEnd = new Date(start.getTime() + (days - 1) * 24 * 3600 * 1000);
  const intervals = await fetchBusyIntervals(
    pool, professionalId, toDateStr(start), toDateStr(rangeEnd), excludeId
  );

  const nowMs = Date.now();
  const byWeekday = {};
  for (const s of schedules) {
    const st = toMinutes(s.start_time);
    const en = toMinutes(s.end_time);
    if (st === null || en === null || st >= en) continue;
    (byWeekday[s.weekday] = byWeekday[s.weekday] || []).push({
      start: st, end: en, slot: Number(s.slot_minutes) || 30,
    });
  }

  const result = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * 24 * 3600 * 1000);
    const rules = byWeekday[day.getDay()];
    if (!rules) continue;

    const dateStr = toDateStr(day);
    const isToday = dateStr === toDateStr(new Date());
    const slots = new Set();
    for (const rule of rules) {
      for (let m = rule.start; m + rule.slot <= rule.end; m += rule.slot) {
        const slotDate = new Date(
          day.getFullYear(), day.getMonth(), day.getDate(),
          Math.floor(m / 60), m % 60, 0, 0
        );
        if (slotDate.getTime() <= nowMs) continue;
        if (isToday && slotDate.getTime() < nowMs + 30 * 60000) continue;
        const slotEnd = slotDate.getTime() + rule.slot * 60000;
        const busy = intervals.some(iv => overlaps(slotDate.getTime(), slotEnd, iv.start, iv.end));
        if (!busy) slots.add(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
      }
    }
    if (slots.size) result.push({ date: dateStr, slots: Array.from(slots).sort() });
  }

  if (!result.length) {
    return {
      days: [],
      reason: days
        ? 'Nenhum horário livre nos próximos dias. Tente outra unidade ou profissional.'
        : 'Nenhum horário livre.',
    };
  }
  return { days: result, reason: null };
}

module.exports = {
  KINDS,
  parseDateTime,
  toDateStr,
  validateScheduleWindow,
  validateBooking,
  getAvailability,
};
