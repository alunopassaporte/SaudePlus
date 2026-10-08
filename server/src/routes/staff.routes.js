const express = require('express');
const pool = require('../db');
const { verifyToken, requireStaff } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { validateBooking, validateScheduleWindow } = require('../utils/booking');

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

// Busca pacientes por nome ou e-mail (sem CPF/RG).
// Devolve também contas inativas/pendentes — o painel do atendente exibe
// um aviso para evitar cadastro duplicado (TAREFAS V3, item 3.2).
router.get('/patients', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const [rows] = await pool.query(
      `SELECT id, full_name, email, phone, mobile, birth_date, gender, blood_type, account_status
       FROM users WHERE role = 'paciente'
       AND (full_name LIKE ? OR email LIKE ?)
       ORDER BY CASE account_status WHEN 'ativo' THEN 0 WHEN 'pendente' THEN 1 ELSE 2 END,
                full_name
       LIMIT 20`,
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
      const windowError = validateScheduleWindow(scheduled_at);
      if (windowError) return res.status(400).json({ error: windowError });
      updates.push('scheduled_at=?'); params.push(scheduled_at);
      logParts.push(`reagendado para ${scheduled_at}`);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });

    // Se o registro tem profissional vinculado, revalida disponibilidade
    // (dias/horários, conflito e bloqueios) — item 4.5.
    if (scheduled_at) {
      const serviceColumn = entity.entityType === 'appointment' ? 'specialty' : 'exam_type';
      const [[record]] = await pool.query(
        `SELECT professional_id, unit_id, ${serviceColumn} AS service_name FROM ${entity.table} WHERE id = ?`,
        [req.params.id]
      );
      if (record && record.professional_id && record.unit_id) {
        const bookingError = await validateBooking(pool, {
          kind: entity.entityType === 'appointment' ? 'consulta' : 'exame',
          unitId: record.unit_id,
          professionalId: record.professional_id,
          serviceName: record.service_name,
          scheduledAt: scheduled_at,
          excludeId: req.params.id,
        });
        if (bookingError) return res.status(409).json({ error: bookingError });
      }
    }

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
