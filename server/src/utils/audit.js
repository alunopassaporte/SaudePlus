const crypto = require('crypto');
const pool = require('../db');

/**
 * Registra uma ação administrativa para fins de rastreabilidade.
 * Nunca lança erro para não derrubar a operação principal por causa do log.
 */
async function logAction(actorId, action, entityType, entityId, details) {
  try {
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?)',
      [id, actorId, action, entityType, entityId, details || null]
    );
  } catch (err) {
    console.error('Falha ao registrar log de auditoria:', err);
  }
}

module.exports = { logAction };
