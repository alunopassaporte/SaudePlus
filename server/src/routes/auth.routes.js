const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const VALID_ROLES = ['paciente', 'atendente'];
const VALID_PRIORITIES = ['nenhuma', 'idoso', 'gestante', 'pcd', 'lactante'];
const VALID_RACES = ['branca', 'preta', 'parda', 'amarela', 'indigena', 'nao_informar'];

// --------------------------------------------------------------------------
// Validações de segurança e de dados essenciais (TAREFAS V3, item 6.2)
// --------------------------------------------------------------------------
function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCPF(value) {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

function ageInYears(birthDateStr) {
  const birth = new Date(birthDateStr + 'T00:00:00');
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

// --------------------------------------------------------------------------
// Proteção contra força bruta no login (TAREFAS V3, item 6.3):
// 5 tentativas erradas => bloqueio de 5 minutos para aquele IP.
// --------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map(); // ip -> { count, windowEndsAt, blockedUntil }

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'desconhecido';
}

function loginBlockInfo(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return null;
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil > now) return entry;
  if (entry.windowEndsAt && entry.windowEndsAt < now) loginAttempts.delete(ip);
  return null;
}

function registerLoginFailure(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, windowEndsAt: now + LOGIN_WINDOW_MS };
  if (entry.blockedUntil && entry.blockedUntil > now) return entry;
  if (entry.windowEndsAt < now) {
    entry.count = 0;
    entry.windowEndsAt = now + LOGIN_WINDOW_MS;
  }
  entry.count += 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.blockedUntil = now + LOGIN_WINDOW_MS;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
  return entry;
}

router.post('/signup', async (req, res, next) => {
  try {
    const {
      email, password, full_name, role,
      social_name: socialName, cns, priority, race, guardian_name: guardianName,
      phone, mobile, birth_date: birthDate, gender, blood_type,
      mother_name, father_name, cpf, rg,
      cep, street, address_number, neighborhood, city, state,
      zone, reference_point: referencePoint,
      job_role,
    } = req.body || {};

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    }
    // Dados essenciais de saúde: sem eles o cadastro não serve para o posto.
    if (!birthDate) {
      return res.status(400).json({ error: 'A data de nascimento é obrigatória.' });
    }
    const age = ageInYears(birthDate);
    if (age === null || age < 0 || age > 130) {
      return res.status(400).json({ error: 'Data de nascimento inválida.' });
    }
    if (!cpf || !isValidCPF(cpf)) {
      return res.status(400).json({ error: 'CPF inválido. Confira os números digitados.' });
    }
    if (cns && digitsOnly(cns).length !== 15) {
      return res.status(400).json({ error: 'O Cartão SUS (CNS) deve ter 15 números.' });
    }
    if (priority !== undefined && priority !== null && priority !== '' && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Prioridade de atendimento inválida.' });
    }
    if (race !== undefined && race !== null && race !== '' && !VALID_RACES.includes(race)) {
      return res.status(400).json({ error: 'Cor/raça inválida.' });
    }
    if (age < 18 && !guardianName) {
      return res.status(400).json({ error: 'Informe o nome do responsável legal para menores de 18 anos.' });
    }
    // Ponto de referência só é obrigatório na zona rural (item 1.7).
    if (zone === 'rural' && !referencePoint) {
      return res.status(400).json({ error: 'Na zona rural, o ponto de referência é obrigatório.' });
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
        (id, full_name, social_name, email, password_hash, role, account_status,
         cns, priority, race, guardian_name,
         phone, mobile, birth_date, gender, blood_type,
         mother_name, father_name, cpf, rg,
         cep, street, address_number, neighborhood, city, state, zone, reference_point,
         job_role)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, full_name, socialName || null, normalizedEmail, passwordHash, assignedRole, initialStatus,
        cns ? digitsOnly(cns) : null,
        priority && VALID_PRIORITIES.includes(priority) ? priority : null,
        race && VALID_RACES.includes(race) ? race : null,
        guardianName || null,
        phone || null, mobile || null,
        birthDate, gender || null, blood_type || null,
        mother_name || null, father_name || null,
        digitsOnly(cpf) ? String(cpf).trim() : null, rg || null,
        cep || null, street || null, address_number || null,
        neighborhood || null, city || null, state || null,
        zone || null, referencePoint || null,
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

    const ip = clientIp(req);
    const blocked = loginBlockInfo(ip);
    if (blocked) {
      const seconds = Math.ceil((blocked.blockedUntil - Date.now()) / 1000);
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return res.status(429).json({
        error: `Muitas tentativas de login. Tente novamente em ${minutes} minuto(s).`,
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    if (!rows.length) {
      registerLoginFailure(ip);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = rows[0];

    if (user.account_status !== 'ativo') {
      // Status da conta não é erro de senha — não conta como tentativa de força bruta.
      return res.status(403).json({
        error: user.account_status === 'pendente'
          ? 'Conta aguardando ativação. Entre em contato com a administração.'
          : 'Conta desativada. Entre em contato com a administração.'
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      registerLoginFailure(ip);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    loginAttempts.delete(ip);

    const payload = {
      id: user.id, email: user.email,
      role: user.role, admin_level: user.admin_level || null, full_name: user.full_name,
      job_role: user.job_role || null,
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
      `SELECT id, full_name, social_name, email, role, account_status,
              phone, mobile, birth_date, gender, priority, race, guardian_name, blood_type,
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
      full_name, social_name: socialName, phone, mobile, birth_date, gender,
      priority, race, guardian_name: guardianName, blood_type,
      mother_name, father_name, cep, street, address_number,
      neighborhood, city, state, zone, reference_point, job_role,
    } = req.body || {};

    await pool.query(
      `UPDATE users SET
        full_name=?, social_name=?, phone=?, mobile=?, birth_date=?, gender=?,
        priority=?, race=?, guardian_name=?, blood_type=?,
        mother_name=?, father_name=?,
        cep=?, street=?, address_number=?, neighborhood=?, city=?, state=?,
        zone=?, reference_point=?, job_role=?
       WHERE id=?`,
      [
        full_name || req.user.full_name,
        socialName || null,
        phone || null, mobile || null,
        birth_date || null, gender || null,
        priority && VALID_PRIORITIES.includes(priority) ? priority : null,
        race && VALID_RACES.includes(race) ? race : null,
        guardianName || null,
        blood_type || null,
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
