const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { validateBooking, validateScheduleWindow } = require('../utils/booking');

const router = express.Router();
router.use(verifyToken);

// GET /me/appointments — somente as consultas do usuário logado
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM appointments WHERE user_id = ? ORDER BY scheduled_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { specialty, doctor, location, scheduled_at, notes, unit_id, professional_id } = req.body || {};
    if (!specialty || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Especialidade, local e data/hora são obrigatórios.' });
    }
    if (!unit_id) {
      return res.status(400).json({ error: 'Selecione a unidade de saúde.' });
    }

    // Regras de disponibilidade validadas no servidor (item 4.5)
    const bookingError = await validateBooking(pool, {
      kind: 'consulta',
      unitId: unit_id,
      professionalId: professional_id || null,
      serviceName: specialty,
      scheduledAt: scheduled_at,
    });
    if (bookingError) return res.status(409).json({ error: bookingError });

    let doctorName = doctor || null;
    if (professional_id) {
      const [[prof]] = await pool.query('SELECT name FROM professionals WHERE id = ?', [professional_id]);
      if (prof) doctorName = prof.name;
    }

    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO appointments
        (id, user_id, specialty, doctor, location, unit_id, professional_id, scheduled_at, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, specialty, doctorName, location, unit_id, professional_id || null, scheduled_at, notes || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

// PATCH /:id/cancel — soft-cancel: marca como cancelado, NÃO apaga do banco
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      'SELECT status FROM appointments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Consulta não encontrada.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Esta consulta já está concluída ou cancelada.' });
    }
    await pool.query(
      'UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?',
      ['cancelado', req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { specialty, doctor, location, scheduled_at, notes, unit_id, professional_id } = req.body || {};
    if (!specialty || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Especialidade, local e data/hora são obrigatórios.' });
    }
    const [[existing]] = await pool.query(
      'SELECT status, unit_id FROM appointments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Consulta não encontrada.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Não é possível editar uma consulta já concluída ou cancelada.' });
    }

    // Agendamentos novos sempre têm unidade; registros antigos (sem unit_id)
    // continuam editáveis preservando o vínculo original.
    const effectiveUnitId = unit_id || existing.unit_id || null;
    if (!effectiveUnitId) {
      const windowError = validateScheduleWindow(scheduled_at);
      if (windowError) return res.status(400).json({ error: windowError });
    } else {
      const bookingError = await validateBooking(pool, {
        kind: 'consulta',
        unitId: effectiveUnitId,
        professionalId: professional_id || null,
        serviceName: specialty,
        scheduledAt: scheduled_at,
        excludeId: req.params.id,
      });
      if (bookingError) return res.status(409).json({ error: bookingError });
    }

    let doctorName = doctor || null;
    if (professional_id) {
      const [[prof]] = await pool.query('SELECT name FROM professionals WHERE id = ?', [professional_id]);
      if (prof) doctorName = prof.name;
    }

    await pool.query(
      `UPDATE appointments SET specialty=?, doctor=?, location=?, unit_id=?, professional_id=?,
                               scheduled_at=?, notes=? WHERE id=? AND user_id=?`,
      [specialty, doctorName, location, effectiveUnitId, professional_id || null, scheduled_at, notes || null, req.params.id, req.user.id]
    );
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
