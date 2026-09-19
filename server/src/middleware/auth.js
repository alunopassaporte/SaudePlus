const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, email, role, full_name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador.' });
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.user || (req.user.role !== 'atendente' && req.user.role !== 'admin')) {
    return res.status(403).json({ error: 'Acesso restrito a atendentes e administradores.' });
  }
  next();
}

function requireCapability(capability) {
  return (req, res, next) => {
    const level = req.user && req.user.admin_level;
    const permissions = {
      superadmin: ['users', 'appointments', 'diseases', 'units', 'audit', 'reports'],
      gestor: ['users', 'appointments', 'diseases', 'units', 'audit', 'reports'],
      atendimento: ['appointments'],
      alertas: ['diseases'],
    };
    if (req.user && req.user.role === 'admin' && permissions[level || 'gestor']?.includes(capability)) return next();
    return res.status(403).json({ error: 'Seu nível administrativo não permite esta operação.' });
  };
}

module.exports = { verifyToken, requireAdmin, requireStaff, requireCapability };
