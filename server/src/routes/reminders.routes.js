const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);

// GET /me/reminders — lembretes do usuário logado.
// Nota: por enquanto os lembretes só são lidos. Criar lembretes automáticos
// (ex: "sua consulta é amanhã") é um próximo passo natural — daria pra rodar
// como um job agendado no backend que olha appointments e exams futuros.
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM reminders WHERE user_id = ? ORDER BY remind_at ASC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
