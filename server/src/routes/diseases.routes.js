const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// GET /diseases?active=true — qualquer usuário logado pode ver os alertas
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const activeOnly = req.query.active === 'true';
    const sql = activeOnly
      ? 'SELECT * FROM diseases WHERE active = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM diseases ORDER BY created_at DESC';
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
