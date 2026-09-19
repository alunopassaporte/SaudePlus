const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

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
    const { exam_type, location, scheduled_at, notes } = req.body || {};
    if (!exam_type || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Tipo de exame, local e data/hora são obrigatórios.' });
    }
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO exams (id, user_id, exam_type, location, scheduled_at, notes) VALUES (?,?,?,?,?,?)',
      [id, req.user.id, exam_type, location, scheduled_at, notes || null]
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
    const { exam_type, location, scheduled_at, notes } = req.body || {};
    if (!exam_type || !location || !scheduled_at) {
      return res.status(400).json({ error: 'Tipo de exame, local e data/hora são obrigatórios.' });
    }
    const [[existing]] = await pool.query(
      'SELECT status FROM exams WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing) return res.status(404).json({ error: 'Exame não encontrado.' });
    if (existing.status === 'concluido' || existing.status === 'cancelado') {
      return res.status(409).json({ error: 'Não é possível editar um exame já concluído ou cancelado.' });
    }
    await pool.query(
      'UPDATE exams SET exam_type=?, location=?, scheduled_at=?, notes=? WHERE id=? AND user_id=?',
      [exam_type, location, scheduled_at, notes || null, req.params.id, req.user.id]
    );
    res.json({ id: req.params.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
