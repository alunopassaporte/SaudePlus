const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const VALID_ROLES = ['paciente', 'atendente'];

router.post('/signup', async (req, res, next) => {
  try {
    const {
      email, password, full_name, role,
      phone, mobile, birth_date, gender, blood_type,
      mother_name, father_name, cpf, rg,
      cep, street, address_number, neighborhood, city, state,
      zone, reference_point,
      job_role,
    } = req.body || {};

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    }

    const assignedRole = VALID_ROLES.includes(role) ? role : 'paciente';
    // Atendente nasce pendente — precisa de ativação pelo admin antes de acessar dados de pacientes
    const initialStatus = assignedRole === 'atendente' ? 'pendente' : 'ativo';
    const normalizedEmail = String(email).toLowerCase().trim();

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing.length) {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO users
        (id, full_name, email, password_hash, role, account_status,
         phone, mobile, birth_date, gender, blood_type,
         mother_name, father_name, cpf, rg,
         cep, street, address_number, neighborhood, city, state, zone, reference_point,
         job_role)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, full_name, normalizedEmail, passwordHash, assignedRole, initialStatus,
        phone || null, mobile || null,
        birth_date || null, gender || null, blood_type || null,
        mother_name || null, father_name || null,
        cpf || null, rg || null,
        cep || null, street || null, address_number || null,
        neighborhood || null, city || null, state || null,
        zone || null, reference_point || null,
        assignedRole === 'atendente' ? (job_role || null) : null,
      ]
    );

    const msg = assignedRole === 'atendente'
      ? 'Conta criada! Aguarde a ativação pelo administrador antes de fazer login.'
      : null;
    res.status(201).json({ id, message: msg });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const user = rows[0];

    if (user.account_status !== 'ativo') {
      return res.status(403).json({
        error: user.account_status === 'pendente'
          ? 'Conta aguardando ativação. Entre em contato com a administração.'
          : 'Conta desativada. Entre em contato com a administração.'
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas.' });

    const payload = {
      id: user.id, email: user.email,
      role: user.role, admin_level: user.admin_level || null, full_name: user.full_name,
    };
    try {
      await pool.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    } catch (updateError) {
      if (updateError.code !== 'ER_BAD_FIELD_ERROR') throw updateError;
      console.warn('Coluna last_login_at ausente; execute server/migration_001.sql para habilitar o registro de acesso.');
    }
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ token, user: payload });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — perfil completo do próprio usuário (sem CPF/RG — esses ficam só no admin)
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, email, role, account_status,
              phone, mobile, birth_date, gender, blood_type,
              mother_name, father_name,
              cep, street, address_number, neighborhood, city, state, zone, reference_point,
              job_role, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /auth/me — atualiza perfil próprio (não pode mudar role nem status)
router.put('/me', verifyToken, async (req, res, next) => {
  try {
    const {
      full_name, phone, mobile, birth_date, gender, blood_type,
      mother_name, father_name, cep, street, address_number,
      neighborhood, city, state, zone, reference_point, job_role,
    } = req.body || {};

    await pool.query(
      `UPDATE users SET
        full_name=?, phone=?, mobile=?, birth_date=?, gender=?, blood_type=?,
        mother_name=?, father_name=?,
        cep=?, street=?, address_number=?, neighborhood=?, city=?, state=?,
        zone=?, reference_point=?, job_role=?
       WHERE id=?`,
      [
        full_name || req.user.full_name,
        phone || null, mobile || null,
        birth_date || null, gender || null, blood_type || null,
        mother_name || null, father_name || null,
        cep || null, street || null, address_number || null,
        neighborhood || null, city || null, state || null,
        zone || null, reference_point || null,
        job_role || null,
        req.user.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
