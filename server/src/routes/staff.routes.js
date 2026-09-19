const express = require('express');
const pool = require('../db');
const { verifyToken, requireStaff } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();
router.use(verifyToken, requireStaff);

const VALID_STATUS = ['pendente', 'confirmado', 'cancelado', 'concluido'];
const ENTITY_MAP = {
  appointments: { table: 'appointments', entityType: 'appointment' },
  exams:        { table: 'exams',        entityType: 'exam'        },
};

router.get('/appointments', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const [rows] = await pool.query(
      `SELECT a.*, u.full_name AS user_name, u.email AS user_email
       FROM appointments a JOIN users u ON u.id = a.user_id
       ORDER BY a.scheduled_at DESC LIMIT ?`, [limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/exams', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const [rows] = await pool.query(
      `SELECT e.*, u.full_name AS user_name, u.email AS user_email
       FROM exams e JOIN users u ON u.id = e.user_id
       ORDER BY e.scheduled_at DESC LIMIT ?`, [limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Busca pacientes por nome ou e-mail (sem CPF/RG)
router.get('/patients', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, mobile, birth_date, gender, blood_type
       FROM users WHERE role = 'paciente' AND account_status = 'ativo'
       AND (full_name LIKE ? OR email LIKE ?)
       ORDER BY full_name LIMIT 20`,
      ['%' + q + '%', '%' + q + '%']
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Histórico completo de um paciente (sem CPF/RG)
router.get('/patients/:id/history', async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      `SELECT id, full_name, email, phone, mobile, birth_date, gender, blood_type
       FROM users WHERE id = ? AND role = 'paciente'`, [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Paciente não encontrado.' });

    const [appointments] = await pool.query(
      'SELECT * FROM appointments WHERE user_id = ? ORDER BY scheduled_at DESC', [req.params.id]
    );
    const [exams] = await pool.query(
      'SELECT * FROM exams WHERE user_id = ? ORDER BY scheduled_at DESC', [req.params.id]
    );
    res.json({ user, appointments, exams });
  } catch (err) { next(err); }
});

// PATCH /:kind/:id — mesma lógica de confirmação/cancelamento/reagendamento do admin
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
      updates.push('status=?'); params.push(status); logParts.push(`status -> ${status}`);
    }
    if (scheduled_at) {
      updates.push('scheduled_at=?'); params.push(scheduled_at);
      logParts.push(`reagendado para ${scheduled_at}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });

    params.push(req.params.id);
    const [result] = await pool.query(
      `UPDATE ${entity.table} SET ${updates.join(', ')} WHERE id=?`, params
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Registro não encontrado.' });

    await logAction(req.user.id, 'staff_update', entity.entityType, req.params.id, logParts.join('; '));
    res.json({ id: req.params.id });
  } catch (err) { next(err); }
});

module.exports = router;
