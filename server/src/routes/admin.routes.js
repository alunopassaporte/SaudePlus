const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireAdmin, requireCapability } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
// Toda rota abaixo exige login E papel de admin — é a fronteira de
// privilégio mais sensível do app, então fica isolada num único arquivo.
router.use(verifyToken, requireAdmin);


const VALID_STATUS = ['pendente', 'confirmado', 'cancelado', 'concluido'];
// kind (rota/JSON) -> { table, entityType (p/ log) }
const ENTITY_MAP = {
  appointments: { table: 'appointments', entityType: 'appointment' },
  exams: { table: 'exams', entityType: 'exam' },
};

function validFutureDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(value)) return false;
  return new Date(String(value).replace(' ', 'T')).getTime() > Date.now();
}

router.get('/stats', async (req, res, next) => {
  try {
    const [[users]] = await pool.query("SELECT COUNT(*) AS total, SUM(account_status = 'pendente') AS pending, SUM(account_status = 'inativo') AS inactive FROM users");
    const [[units]] = await pool.query('SELECT COUNT(*) AS total, SUM(active = 1) AS active FROM health_units');
    const [[diseases]] = await pool.query('SELECT COUNT(*) AS total, SUM(active = 1) AS active FROM diseases');
    res.json({ users, units, diseases });
  } catch (err) { next(err); }
});

router.get('/export/summary.csv', async (req, res, next) => {
  try {
    const [[users]] = await pool.query(`SELECT
      COUNT(*) AS total,
      SUM(account_status = 'ativo') AS active,
      SUM(account_status = 'pendente') AS pending,
      SUM(account_status = 'inativo') AS inactive
      FROM users`);
    const [[appointments]] = await pool.query(`SELECT
      COUNT(*) AS total,
      SUM(status = 'pendente') AS pending,
      SUM(status = 'confirmado') AS confirmed,
      SUM(status = 'cancelado') AS cancelled,
      SUM(status = 'concluido') AS completed
      FROM appointments`);
    const [[exams]] = await pool.query(`SELECT
      COUNT(*) AS total,
      SUM(status = 'pendente') AS pending,
      SUM(status = 'confirmado') AS confirmed,
      SUM(status = 'cancelado') AS cancelled,
      SUM(status = 'concluido') AS completed
      FROM exams`);
    const [[units]] = await pool.query('SELECT COUNT(*) AS total, SUM(active = 1) AS active, SUM(active = 0) AS inactive FROM health_units');
    const [[diseases]] = await pool.query('SELECT COUNT(*) AS total, SUM(active = 1) AS active, SUM(active = 0) AS inactive FROM diseases');

    const rows = [
      ['Indicador', 'Total', 'Ativos/Pendentes', 'Inativos/Confirmados', 'Cancelados/Concluidos'],
      ['Usuários', users.total, users.active, users.pending, users.inactive],
      ['Consultas', appointments.total, appointments.pending, appointments.confirmed, `${appointments.cancelled}/${appointments.completed}`],
      ['Exames', exams.total, exams.pending, exams.confirmed, `${exams.cancelled}/${exams.completed}`],
      ['Unidades de saúde', units.total, units.active, units.inactive, ''],
      ['Alertas epidemiológicos', diseases.total, diseases.active, diseases.inactive, ''],
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="saude-plus-resumo-administrativo.csv"');
    res.send('\ufeff' + csv);
  } catch (err) {
    next(err);
  }
});

router.get('/appointments', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [rows] = await pool.query(
      'SELECT a.*, u.full_name AS user_name, u.email AS user_email FROM appointments a JOIN users u ON u.id = a.user_id ORDER BY a.scheduled_at DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/exams', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const [rows] = await pool.query(
      'SELECT e.*, u.full_name AS user_name, u.email AS user_email FROM exams e JOIN users u ON u.id = e.user_id ORDER BY e.scheduled_at DESC LIMIT ?',
      [limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/:kind/:id — confirmar, cancelar e/ou reagendar (admin pode agir
// sobre o agendamento de QUALQUER usuário; diferente das rotas /me/*, que só
// deixam cada usuário mexer no próprio registro).
router.patch('/:kind/:id', async (req, res, next) => {
  try {
    const entity = ENTITY_MAP[req.params.kind];
    if (!entity) return res.status(404).json({ error: 'Tipo inválido.' });

    const { status, scheduled_at } = req.body || {};
    const updates = [];
    const params = [];
    const logParts = [];

    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({ error: 'Status inválido.' });
      }
      updates.push('status=?');
      params.push(status);
      logParts.push(`status -> ${status}`);
    }
    if (scheduled_at) {
      if (!validFutureDate(scheduled_at)) return res.status(400).json({ error: 'Informe uma data futura válida.' });
      updates.push('scheduled_at=?');
      params.push(scheduled_at);
      logParts.push(`reagendado para ${scheduled_at}`);
    }
    if (!updates.length) {
      return res.status(400).json({ error: 'Nada para atualizar.' });
    }

    params.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE ${entity.table} SET ${updates.join(', ')} WHERE id=?`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Registro não encontrado.' });
    }

    await logAction(req.user.id, 'admin_update', entity.entityType, req.params.id, logParts.join('; '));
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});

// Busca por e-mail (parcial) para localizar o histórico de um usuário
router.get('/users', async (req, res, next) => {
  try {
    const email = String(req.query.email || '').toLowerCase().trim();
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone FROM users WHERE email LIKE ? ORDER BY full_name LIMIT 20',
      ['%' + email + '%']
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/history', async (req, res, next) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório.' });

    const [[user]] = await pool.query(
      'SELECT id, full_name, email, phone FROM users WHERE id = ?',
      [userId]
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const [appointments] = await pool.query(
      'SELECT * FROM appointments WHERE user_id = ? ORDER BY scheduled_at DESC',
      [userId]
    );
    const [exams] = await pool.query(
      'SELECT * FROM exams WHERE user_id = ? ORDER BY scheduled_at DESC',
      [userId]
    );

    res.json({ user, appointments, exams });
  } catch (err) {
    next(err);
  }
});

router.get('/diseases', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM diseases ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.patch('/diseases/:id', async (req, res, next) => {
  try {
    const { name, region, alert_level, description, active } = req.body || {};
    const updates = [];
    const params = [];
    const details = [];
    if (name !== undefined) { if (!String(name).trim()) return res.status(400).json({ error: 'Nome é obrigatório.' }); updates.push('name=?'); params.push(String(name).trim()); details.push(`nome -> ${name}`); }
    if (region !== undefined) { updates.push('region=?'); params.push(region || null); details.push(`região -> ${region || 'não informada'}`); }
    if (alert_level !== undefined) { if (!['baixo', 'medio', 'alto'].includes(alert_level)) return res.status(400).json({ error: 'Nível inválido.' }); updates.push('alert_level=?'); params.push(alert_level); details.push(`nível -> ${alert_level}`); }
    if (description !== undefined) { updates.push('description=?'); params.push(description || null); }
    if (active !== undefined) { updates.push('active=?'); params.push(Number(active) ? 1 : 0); details.push(Number(active) ? 'alerta ativado' : 'alerta desativado'); }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const [result] = await pool.query(`UPDATE diseases SET ${updates.join(', ')} WHERE id=?`, params);
    if (!result.affectedRows) return res.status(404).json({ error: 'Alerta não encontrado.' });
    await logAction(req.user.id, 'admin_update_disease', 'disease', req.params.id, details.join('; '));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/diseases', async (req, res, next) => {
  try {
    const { name, region, alert_level, description } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });

    const validLevels = ['baixo', 'medio', 'alto'];
    const level = validLevels.includes(alert_level) ? alert_level : 'baixo';

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO diseases (id, name, region, alert_level, description) VALUES (?,?,?,?,?)',
      [id, name, region || null, level, description || null]
    );
    await logAction(req.user.id, 'create', 'disease', id, `"${name}" (${level})`);
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.delete('/diseases/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM diseases WHERE id = ?', [req.params.id]);
    await logAction(req.user.id, 'delete', 'disease', req.params.id, null);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /admin/audit-log — histórico de ações administrativas
router.get('/audit-log', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const entityType = String(req.query.entityType || '').trim();
    const action = String(req.query.action || '').trim();
    const actorId = String(req.query.actorId || '').trim();
    const filters = [];
    const params = [];
    if (entityType) { filters.push('al.entity_type = ?'); params.push(entityType); }
    if (action) { filters.push('al.action = ?'); params.push(action); }
    if (actorId) { filters.push('al.actor_id = ?'); params.push(actorId); }
    const [rows] = await pool.query(
      `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
       FROM audit_log al JOIN users u ON u.id = al.actor_id
       ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
       ORDER BY al.created_at DESC LIMIT ?`,
      [...params, limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
