/**
 * Migração opcional de usuários do Supabase para o MySQL local.
 *
 * Requer: npm install @supabase/supabase-js  (não vem instalado por padrão —
 * é uma dependência extra só para quem realmente precisar migrar dados).
 *
 * Este script assume uma tabela "profiles" no Supabase com as colunas
 * full_name, email, phone, role. Ajuste a query conforme o schema real
 * do seu projeto Supabase antes de rodar.
 *
 * As senhas do Supabase NÃO podem ser migradas (o hash usado pelo Supabase
 * Auth não é compatível). Todos os usuários migrados recebem a mesma senha
 * temporária definida em DEFAULT_PASSWORD — avise os usuários para trocá-la
 * no primeiro acesso.
 *
 * Uso: npm run migrate:supabase
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../src/db');

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, DEFAULT_PASSWORD } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DEFAULT_PASSWORD) {
    console.error('Configure SUPABASE_URL, SUPABASE_SERVICE_KEY e DEFAULT_PASSWORD no .env.');
    process.exit(1);
  }

  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch (e) {
    console.error('Pacote @supabase/supabase-js não encontrado. Rode: npm install @supabase/supabase-js');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const { data: profiles, error } = await supabase.from('profiles').select('*');
  if (error) throw error;

  let migrated = 0;
  for (const p of profiles || []) {
    const email = String(p.email || '').toLowerCase().trim();
    if (!email) continue;

    const id = crypto.randomUUID();
    const [result] = await pool.query(
      'INSERT IGNORE INTO users (id, full_name, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)',
      [id, p.full_name || '', email, p.phone || null, defaultHash, p.role === 'admin' ? 'admin' : 'user']
    );
    if (result.affectedRows > 0) migrated += 1;
  }

  console.log(`Migrados ${migrated} de ${(profiles || []).length} usuários encontrados no Supabase.`);
  console.log(`Senha padrão definida para todos os usuários migrados: ${DEFAULT_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
