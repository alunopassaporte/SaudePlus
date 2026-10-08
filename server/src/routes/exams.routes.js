const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { validateBooking, validateScheduleWindow } = require('../utils/booking');

const router = express.Router();
router.use(verifyToken);

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM exams WHERE user_id = ? ORDER BY scheduled_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { exam_type, location, scheduled_at, notes, unit_id, professional_id } = req.body || {};
    if (!exam_type || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Tipo de exame, local e data/hora são obrigatórios.' });
    }
    if (!unit_id) {
      return res.status(400).json({ error: 'Selecione a unidade de saúde.' });
    }

    const bookingError = await validateBooking(pool, {
      kind: 'exame',
      unitId: unit_id,
      professionalId: professional_id || null,
      serviceName: exam_type,
      scheduledAt: scheduled_at,
    });
    if (bookingError) return res.status(409).json({ error: bookingError });

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO exams
        (id, user_id, exam_type, location, unit_id, professional_id, scheduled_at, notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, req.user.id, exam_type, location, unit_id, professional_id || null, scheduled_at, notes || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT status FROM exams WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Exame não encontrado.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Este exame já está concluído ou cancelado.' });
    }
    await pool.query(
      'UPDATE exams SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelado', req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { exam_type, location, scheduled_at, notes, unit_id, professional_id } = req.body || {};
    if (!exam_type || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Tipo de exame, local e data/hora são obrigatórios.' });
    }
    const [[existing]] = await pool.query(
      'SELECT status, unit_id FROM exams WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Exame não encontrado.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Não é possível editar um exame já concluído ou cancelado.' });
    }

    const effectiveUnitId = unit_id || existing.unit_id || null;
    if (!effectiveUnitId) {
      const windowError = validateScheduleWindow(scheduled_at);
      if (windowError) return res.status(400).json({ error: windowError });
    } else {
      const bookingError = await validateBooking(pool, {
        kind: 'exame',
        unitId: effectiveUnitId,
        professionalId: professional_id || null,
        serviceName: exam_type,
        scheduledAt: scheduled_at,
        excludeId: req.params.id,
      });
      if (bookingError) return res.status(409).json({ error: bookingError });
    }

    await pool.query(
      `UPDATE exams SET exam_type=?, location=?, unit_id=?, professional_id=?,
                        scheduled_at=?, notes=? WHERE id=? AND user_id=?`,
      [exam_type, location, effectiveUnitId, professional_id || null, scheduled_at, notes || null, req.params.id, req.user.id]
    );
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
