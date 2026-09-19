/**
 * Diagnóstico de conexão com o MySQL.
 * Não altera nada no banco — só mostra o que o Node está enxergando e tenta
 * conectar de duas formas diferentes, pra isolar onde está o problema real.
 *
 * Uso: node scripts/diagnose-db.js   (rode de dentro da pasta server/)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

function mask(v) {
  if (v === undefined) return '(undefined — variável não existe no .env)';
  if (v === '') return '(string vazia)';
  if (v.length <= 2) return '*'.repeat(v.length) + ` (tamanho: ${v.length})`;
  return v[0] + '*'.repeat(v.length - 2) + v[v.length - 1] + ` (tamanho: ${v.length})`;
}

console.log('--- valores que o Node leu do .env ---');
console.log('DB_HOST     :', JSON.stringify(process.env.DB_HOST));
console.log('DB_PORT     :', JSON.stringify(process.env.DB_PORT));
console.log('DB_USER     :', JSON.stringify(process.env.DB_USER));
console.log('DB_PASSWORD :', mask(process.env.DB_PASSWORD));
console.log('DB_NAME     :', JSON.stringify(process.env.DB_NAME));
console.log('');

async function tryConnect(label, host) {
  try {
    const conn = await mysql.createConnection({
      host,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
    });
    await conn.query('SELECT 1');
    console.log(`✅ ${label} (host="${host}") — conectou com sucesso`);
    await conn.end();
  } catch (err) {
    console.log(`❌ ${label} (host="${host}") — falhou: ${err.code} | ${err.sqlMessage || err.message}`);
  }
}

(async () => {
  await tryConnect('Tentativa 1', 'localhost');
  await tryConnect('Tentativa 2', '127.0.0.1');
  console.log('');
  console.log('Se a Tentativa 2 funcionou e a 1 falhou: existe uma conta');
  console.log("'root'@'localhost' diferente de 'root'@'127.0.0.1' no MySQL,");
  console.log('com senha diferente — é um problema bem comum no Windows.');
})();
