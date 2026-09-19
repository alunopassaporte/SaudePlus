/**
 * Cria (ou promove) o usuário admin definido em ADMIN_EMAIL / ADMIN_PASSWORD no .env.
 * Uso: npm run seed:admin
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../src/db');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env antes de rodar este script.');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('ADMIN_PASSWORD precisa ter ao menos 6 caracteres.');
    process.exit(1);
  }

  const [existing] = await pool.query('SELECT id, role FROM users WHERE email = ?', [email]);

  if (existing.length) {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ?, role = ?, admin_level = ? WHERE email = ?', [passwordHash, 'admin', 'superadmin', email]);
    console.log(`Usuário ${email} já existia — senha e papel de admin atualizados para o que está no .env.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, full_name, email, password_hash, role, admin_level) VALUES (?,?,?,?,?,?)',
      [id, 'Administrador', email, passwordHash, 'admin', 'superadmin']
    );
    console.log(`Admin ${email} criado com sucesso.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Falha ao criar admin:', err);
  process.exit(1);
});
