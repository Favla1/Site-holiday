import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditLogPath = path.join(__dirname, '../logs/admin-audit.log');

export async function writeAdminAuditLog(entry, message) {
    const record = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry
        : { actorUserId: entry, message: String(message || '') };

    await mkdir(path.dirname(auditLogPath), { recursive: true });
    await appendFile(
        auditLogPath,
        `${JSON.stringify({ timestamp: new Date().toISOString(), ...record })}\n`,
        'utf8'
    );
}
