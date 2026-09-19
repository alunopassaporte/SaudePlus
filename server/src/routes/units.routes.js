const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { logAction } = require('../utils/audit');

const router = express.Router();

const VALID_TYPES = ['ubs', 'hospital', 'clinica', 'caps', 'outro'];

// GET /health-units — catálogo ativo para preencher seletores
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, type, neighborhood FROM health_units WHERE active = 1 ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /health-units/manage — catálogo completo para administradores
router.get('/manage', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, type, neighborhood, active, created_at FROM health_units ORDER BY active DESC, name'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { name, type, neighborhood } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nome da unidade é obrigatório.' });
    }
    const unitType = VALID_TYPES.includes(type) ? type : 'ubs';
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO health_units (id, name, type, neighborhood) VALUES (?,?,?,?)',
      [id, String(name).trim(), unitType, neighborhood || null]
    );
    await logAction(req.user.id, 'create', 'health_unit', id, `${String(name).trim()} (${unitType})`);
    res.status(201).json({ id });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', verifyToken, requireAdmin, async (req, res, next) => {
  try {
    const { name, type, neighborhood, active } = req.body || {};
    const updates = [];
    const params = [];
    const details = [];
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Nome da unidade é obrigatório.' });
      updates.push('name=?'); params.push(String(name).trim()); details.push(`nome -> ${String(name).trim()}`);
    }
    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de unidade inválido.' });
      updates.push('type=?'); params.push(type); details.push(`tipo -> ${type}`);
    }
    if (neighborhood !== undefined) {
      updates.push('neighborhood=?'); params.push(neighborhood || null); details.push(`bairro -> ${neighborhood || 'não informado'}`);
    }
    if (active !== undefined) {
      const activeValue = Number(active) ? 1 : 0;
      updates.push('active=?'); params.push(activeValue); details.push(activeValue ? 'unidade ativada' : 'unidade desativada');
    }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(req.params.id);
    const [result] = await pool.query(`UPDATE health_units SET ${updates.join(', ')} WHERE id=?`, params);
    if (!result.affectedRows) return res.status(404).json({ error: 'Unidade não encontrada.' });
    await logAction(req.user.id, 'admin_update_unit', 'health_unit', req.params.id, details.join('; '));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
