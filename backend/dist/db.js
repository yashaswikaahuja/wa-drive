import pg from 'pg';
import { DATABASE_URL } from './config.js';
const { Pool } = pg;
export const pool = new Pool({ connectionString: DATABASE_URL });
export async function query(text, params) {
    return pool.query(text, params);
}
export async function auditLog(workspaceId, userId, eventType, entityType, entityId, metadata) {
    try {
        await pool.query('INSERT INTO audit_events (workspace_id, user_id, event_type, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)', [workspaceId, userId, eventType, entityType, entityId, metadata ? JSON.stringify(metadata) : null]);
    }
    catch { }
}
//# sourceMappingURL=db.js.map