const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

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
    const { specialty, doctor, location, scheduled_at, notes } = req.body || {};
    if (!specialty || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Especialidade, local e data/hora são obrigatórios.' });
    }
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO appointments (id, user_id, specialty, doctor, location, scheduled_at, notes) VALUES (?,?,?,?,?,?,?)',
      [id, req.user.id, specialty, doctor || null, location, scheduled_at, notes || null]
    );
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

// DELETE só funciona se a consulta pertencer ao usuário logado (defesa em profundidade)
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
    const { specialty, doctor, location, scheduled_at, notes } = req.body || {};
    if (!specialty || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Especialidade, local e data/hora são obrigatórios.' });
    }
    const [[existing]] = await pool.query(
      'SELECT status FROM appointments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Consulta não encontrada.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Não é possível editar uma consulta já concluída ou cancelada.' });
    }
    await pool.query(
      'UPDATE appointments SET specialty=?, doctor=?, location=?, scheduled_at=?, notes=? WHERE id=? AND user_id=?',
      [specialty, doctor || null, location, scheduled_at, notes || null, req.params.id, req.user.id]
    );
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
