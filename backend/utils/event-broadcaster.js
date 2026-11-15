import db from '../config/database.js';
import { sendEmail } from '../utils/mailer.js';

// Sends event broadcast emails for events that started and haven't been broadcasted yet.
export async function runEventBroadcastOnce() {
    return new Promise((resolve) => {
        const nowIso = new Date().toISOString();
        db.all(
            `SELECT * FROM custom_ranks WHERE isSpecial = 1 AND COALESCE(generatedFromTemplate, 0) = 0 AND emailSubject IS NOT NULL AND emailSubject <> '' AND eventStartDate IS NOT NULL AND DATE(eventStartDate) = DATE(?) AND emailBroadcastSent = 0`,
            [nowIso],
            async (err, rows) => {
                if (err) {
                    console.error('[EVENT BROADCAST] query error', err);
                    return resolve({ sent: 0, error: err });
                }

                let totalSent = 0;
                for (const ev of rows || []) {
                    try {
                        // get users with email
                        const users = await new Promise((res) => {
                            db.all(`SELECT id, email FROM users WHERE TRIM(email) <> ''`, [], (e, us) => {
                                if (e) {
                                    console.error('[EVENT BROADCAST] fetch users error', e);
                                    return res([]);
                                }
                                res(us || []);
                            });
                        });

                        const html = `<!doctype html><html><body><div style="max-width:680px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;">${escapeHtml(ev.emailBody || `O evento ${ev.name} começou!`)}</div></body></html>`;

                        for (const u of users) {
                            try {
                                await sendEmail(String(u.email || '').trim(), ev.emailSubject, html);
                                totalSent += 1;
                            } catch (se) {
                                console.error('[EVENT BROADCAST] send to', u.email, se.message || se);
                            }
                        }

                        // marcar como enviado
                        await new Promise((res) => {
                            db.run(`UPDATE custom_ranks SET emailBroadcastSent = 1 WHERE id = ?`, [ev.id], () => res());
                        });

                    } catch (e) {
                        console.error('[EVENT BROADCAST] error processing event', ev.id, e);
                    }
                }

                resolve({ sent: totalSent, events: rows?.length || 0 });
            }
        );
    });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\r?\n/g, '<br>');
}

export function startEventBroadcaster(intervalMs = 10 * 60 * 1000) {
    // run immediately, then every interval
    (async () => {
        try {
            const res = await runEventBroadcastOnce();
            console.log('[EVENT BROADCAST] initial run result:', res);
        } catch (e) {
            console.error('[EVENT BROADCAST] initial error', e);
        }
    })();

    const id = setInterval(async () => {
        try {
            const res = await runEventBroadcastOnce();
            if (res && res.sent) console.log('[EVENT BROADCAST] sent', res.sent, 'emails');
        } catch (e) {
            console.error('[EVENT BROADCAST] scheduled error', e);
        }
    }, intervalMs);

    return () => clearInterval(id);
}
