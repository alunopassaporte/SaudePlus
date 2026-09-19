const crypto = require('crypto');
const pool = require('../db');

const DAY_MS = 24 * 60 * 60 * 1000;

function toSqlDate(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function nextDayWindow(now = new Date()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
}

async function createReminderFor(row, kind, start) {
    const title = `Lembrete: ${kind === 'appointment' ? 'consulta' : 'exame'} amanhã`;
    const subject = kind === 'appointment' ? row.specialty : row.exam_type;
    const message = `${subject} em ${row.location}, às ${new Date(row.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    const remindAt = new Date(row.scheduled_at);
    remindAt.setDate(remindAt.getDate() - 1);

    const [existing] = await pool.query(
        'SELECT id FROM reminders WHERE user_id = ? AND title = ? AND remind_at = ? LIMIT 1',
        [row.user_id, title, toSqlDate(remindAt)]
    );
    if (existing.length) return false;

    await pool.query(
        'INSERT INTO reminders (id, user_id, title, message, remind_at) VALUES (?,?,?,?,?)',
        [crypto.randomUUID(), row.user_id, title, message, toSqlDate(remindAt)]
    );
    return true;
}

async function runReminderJob(now = new Date()) {
    const { start, end } = nextDayWindow(now);
    const startSql = toSqlDate(start);
    const endSql = toSqlDate(end);
    let created = 0;

    const [appointments] = await pool.query(
        `SELECT user_id, specialty, location, scheduled_at
     FROM appointments
     WHERE status IN ('pendente', 'confirmado')
       AND scheduled_at >= ? AND scheduled_at < ?`,
        [startSql, endSql]
    );
    for (const appointment of appointments) {
        if (await createReminderFor(appointment, 'appointment', start)) created += 1;
    }

    const [exams] = await pool.query(
        `SELECT user_id, exam_type, location, scheduled_at
     FROM exams
     WHERE status IN ('pendente', 'confirmado')
       AND scheduled_at >= ? AND scheduled_at < ?`,
        [startSql, endSql]
    );
    for (const exam of exams) {
        if (await createReminderFor(exam, 'exam', start)) created += 1;
    }

    return { created, appointments: appointments.length, exams: exams.length };
}

function startReminderJob() {
    const execute = () => runReminderJob()
        .then((result) => console.log(`Job de lembretes: ${result.created} criado(s).`))
        .catch((err) => console.error('Falha no job de lembretes:', err));

    execute();
    return setInterval(execute, DAY_MS);
}

module.exports = { nextDayWindow, runReminderJob, startReminderJob };
