/* ==========================================================================
   Saúde+ — Migração V3 (idempotente)
   Roda: npm run migrate:v3   (ou node scripts/migrate-v3.js)

   1. Campos oficiais de saúde em `users` (nome social, CNS, prioridade,
      responsável por menor, cor/raça) — TAREFAS V3, itens 1.2 a 1.6.
   2. Colunas unit_id / professional_id em appointments e exams.
   3. Tabelas da agenda inteligente (profissionais, ofertas por unidade,
      horários de atendimento e bloqueios) — itens 2.7, 4.4, 4.5 e 4.6.

   Seguro para rodar mais de uma vez: checa information_schema / usa
   CREATE TABLE IF NOT EXISTS antes de alterar.
   ========================================================================== */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

async function addColumn(pool, table, column, definition) {
  if (await columnExists(pool, table, column)) {
    console.log(`  - ${table}.${column} já existe`);
    return;
  }
  await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`  + ${table}.${column} adicionada`);
}

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'saude',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    console.log('1) Campos oficiais de saúde em users...');
    await addColumn(pool, 'users', 'social_name', 'VARCHAR(150) NULL AFTER full_name');
    await addColumn(pool, 'users', 'cns', 'VARCHAR(15) NULL AFTER rg');
    await addColumn(pool, 'users', 'priority', "ENUM('nenhuma','idoso','gestante','pcd','lactante') NULL AFTER gender");
    await addColumn(pool, 'users', 'guardian_name', 'VARCHAR(150) NULL AFTER father_name');
    await addColumn(pool, 'users', 'race', "ENUM('branca','preta','parda','amarela','indigena','nao_informar') NULL AFTER priority");

    console.log('2) Vínculos de agendamento em appointments/exams...');
    await addColumn(pool, 'appointments', 'unit_id', 'CHAR(36) NULL AFTER location');
    await addColumn(pool, 'appointments', 'professional_id', 'CHAR(36) NULL AFTER unit_id');
    await addColumn(pool, 'exams', 'unit_id', 'CHAR(36) NULL AFTER location');
    await addColumn(pool, 'exams', 'professional_id', 'CHAR(36) NULL AFTER unit_id');

    console.log('3) Tabelas da agenda inteligente...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professionals (
        id CHAR(36) NOT NULL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        job_title VARCHAR(100) NULL,
        registry VARCHAR(40) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS unit_offers (
        id CHAR(36) NOT NULL PRIMARY KEY,
        unit_id CHAR(36) NOT NULL,
        kind ENUM('consulta','exame') NOT NULL,
        name VARCHAR(120) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_unit_offers_unit FOREIGN KEY (unit_id) REFERENCES health_units (id) ON DELETE CASCADE,
        UNIQUE KEY uq_unit_offer (unit_id, kind, name)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_offers (
        id CHAR(36) NOT NULL PRIMARY KEY,
        professional_id CHAR(36) NOT NULL,
        unit_id CHAR(36) NOT NULL,
        kind ENUM('consulta','exame') NOT NULL,
        name VARCHAR(120) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_prof_offers_prof FOREIGN KEY (professional_id) REFERENCES professionals (id) ON DELETE CASCADE,
        CONSTRAINT fk_prof_offers_unit FOREIGN KEY (unit_id) REFERENCES health_units (id) ON DELETE CASCADE,
        UNIQUE KEY uq_prof_offer (professional_id, unit_id, kind, name)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_schedules (
        id CHAR(36) NOT NULL PRIMARY KEY,
        professional_id CHAR(36) NOT NULL,
        unit_id CHAR(36) NOT NULL,
        weekday TINYINT NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        slot_minutes INT NOT NULL DEFAULT 30,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_sched_prof FOREIGN KEY (professional_id) REFERENCES professionals (id) ON DELETE CASCADE,
        CONSTRAINT fk_sched_unit FOREIGN KEY (unit_id) REFERENCES health_units (id) ON DELETE CASCADE,
        UNIQUE KEY uq_sched (professional_id, unit_id, weekday, start_time)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_blocks (
        id CHAR(36) NOT NULL PRIMARY KEY,
        professional_id CHAR(36) NOT NULL,
        unit_id CHAR(36) NOT NULL,
        starts_at DATETIME NOT NULL,
        ends_at DATETIME NOT NULL,
        reason VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_block_prof FOREIGN KEY (professional_id) REFERENCES professionals (id) ON DELETE CASCADE,
        CONSTRAINT fk_block_unit FOREIGN KEY (unit_id) REFERENCES health_units (id) ON DELETE CASCADE,
        INDEX idx_block_prof (professional_id, starts_at, ends_at)
      ) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci`);

    console.log('Migração V3 concluída.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Falha na migração V3:', err.message);
  process.exit(1);
});
