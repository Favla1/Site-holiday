import db from '../config/database.js';

export class Notification {
    static createAdminTicket(userId, fromUserId, title, message, attachment = null, options = {}) {
        return new Promise((resolve, reject) => {
            const attachmentPath = attachment?.path || null;
            const attachmentOriginalName = attachment?.originalName || null;
            const attachmentMime = attachment?.mime || null;
            const attachmentSize = Number.isFinite(Number(attachment?.size)) ? Number(attachment.size) : null;
            const isBroadcast = options?.isBroadcast ? 1 : 0;
            db.run(
                `INSERT INTO admin_tickets (
                    userId,
                    fromUserId,
                    title,
                    message,
                    attachmentPath,
                    attachmentOriginalName,
                    attachmentMime,
                    attachmentSize,
                    isBroadcast
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    fromUserId || null,
                    title,
                    message,
                    attachmentPath,
                    attachmentOriginalName,
                    attachmentMime,
                    attachmentSize,
                    isBroadcast
                ],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({
                        id: `ticket:${this.lastID}`,
                        userId,
                        fromUserId: fromUserId || null,
                        title,
                        message,
                        attachmentPath,
                        attachmentOriginalName,
                        attachmentMime,
                        attachmentSize,
                        isBroadcast: Boolean(isBroadcast),
                        isRead: false,
                        createdAt: new Date()
                    });
                }
            );
        });
    }

    // Criar nova notificacao padrao (like/heart/comment)
    static createNotification(userId, fromUserId, downloadId, type, commentId = null) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO notifications (userId, fromUserId, downloadId, type, commentId) VALUES (?, ?, ?, ?, ?)`,
                [userId, fromUserId, downloadId, type, commentId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({
                        id: this.lastID,
                        userId,
                        fromUserId,
                        downloadId,
                        type,
                        isRead: false,
                        createdAt: new Date()
                    });
                }
            );
        });
    }

    // Criar ou reativar notificacao de reacao (like/heart)
    static createOrRefreshReactionNotification(userId, fromUserId, downloadId, type) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id
                 FROM notifications
                 WHERE userId = ? AND fromUserId = ? AND downloadId = ? AND type = ? AND commentId IS NULL
                 ORDER BY id DESC
                 LIMIT 1`,
                [userId, fromUserId, downloadId, type],
                (selectErr, row) => {
                    if (selectErr) {
                        reject(selectErr);
                        return;
                    }

                    if (row?.id) {
                        db.run(
                            `UPDATE notifications
                             SET isRead = 0, createdAt = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [row.id],
                            (updateErr) => {
                                if (updateErr) {
                                    reject(updateErr);
                                    return;
                                }
                                resolve({
                                    id: row.id,
                                    userId,
                                    fromUserId,
                                    downloadId,
                                    type,
                                    isRead: false,
                                    refreshed: true
                                });
                            }
                        );
                        return;
                    }

                    db.run(
                        `INSERT INTO notifications (userId, fromUserId, downloadId, type, commentId)
                         VALUES (?, ?, ?, ?, NULL)`,
                        [userId, fromUserId, downloadId, type],
                        function(insertErr) {
                            if (insertErr) {
                                reject(insertErr);
                                return;
                            }
                            resolve({
                                id: this.lastID,
                                userId,
                                fromUserId,
                                downloadId,
                                type,
                                isRead: false,
                                createdAt: new Date()
                            });
                        }
                    );
                }
            );
        });
    }

    // Obter notificacoes nao lidas de um usuario (padrao + conquistas)
    static getUnreadNotifications(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM (
                    SELECT
                        n.id,
                        n.userId,
                        n.fromUserId,
                        n.downloadId,
                        n.type,
                        n.commentId,
                        n.isRead,
                        n.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Usuario') AS nickname,
                        u.avatar,
                        COALESCE(d.name, 'Postagem') AS downloadName,
                        dc.content AS commentContent,
                        dc.attachmentPath AS commentAttachmentPath,
                        dc.attachmentOriginalName AS commentAttachmentOriginalName,
                        dc.attachmentMime AS commentAttachmentMime,
                        dc.attachmentSize AS commentAttachmentSize,
                        NULL AS ticketAttachmentPath,
                        NULL AS ticketAttachmentOriginalName,
                        NULL AS ticketAttachmentMime,
                        NULL AS ticketAttachmentSize,
                        0 AS ticketIsBroadcast,
                        NULL AS rankName,
                        NULL AS achievementMessage,
                        NULL AS ticketTitle,
                        NULL AS ticketMessage,
                        NULL AS ticketColor,
                        NULL AS fromUserHierarchyLevel,
                        NULL AS suspensionStatus,
                        NULL AS suspensionUserMessage
                    FROM notifications n
                    LEFT JOIN users u ON n.fromUserId = u.id
                    LEFT JOIN downloads d ON n.downloadId = d.id
                    LEFT JOIN download_comments dc ON n.commentId = dc.id
                    WHERE n.userId = ? AND n.isRead = 0

                    UNION ALL

                    SELECT
                        -an.id AS id,
                        an.userId,
                        an.awardedByUserId AS fromUserId,
                        an.relatedDownloadId AS downloadId,
                        'achievement' AS type,
                        NULL AS commentId,
                        an.isRead,
                        an.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Sistema') AS nickname,
                        u.avatar,
                        CASE
                            WHEN an.relatedDownloadId IS NOT NULL THEN COALESCE(d.name, 'Postagem')
                            ELSE NULL
                        END AS downloadName,
                        NULL AS commentContent,
                        NULL AS commentAttachmentPath,
                        NULL AS commentAttachmentOriginalName,
                        NULL AS commentAttachmentMime,
                        NULL AS commentAttachmentSize,
                        NULL AS ticketAttachmentPath,
                        NULL AS ticketAttachmentOriginalName,
                        NULL AS ticketAttachmentMime,
                        NULL AS ticketAttachmentSize,
                        0 AS ticketIsBroadcast,
                        an.rankName,
                        CASE
                            WHEN LOWER(TRIM(COALESCE(an.message, ''))) IN ('conquista automática de evento', 'conquista automática de evento.')
                                THEN 'Você recebeu a conquista especial "' || an.rankName || '".'
                            ELSE an.message
                        END AS achievementMessage,
                        NULL AS ticketTitle,
                        NULL AS ticketMessage,
                        NULL AS ticketColor,
                        NULL AS fromUserHierarchyLevel,
                        NULL AS suspensionStatus,
                        NULL AS suspensionUserMessage
                    FROM achievement_notifications an
                    LEFT JOIN users u ON an.awardedByUserId = u.id
                    LEFT JOIN downloads d ON an.relatedDownloadId = d.id
                    WHERE an.userId = ? AND an.isRead = 0

                    UNION ALL

                    SELECT
                        'ticket:' || at.id AS id,
                        at.userId,
                        at.fromUserId,
                        NULL AS downloadId,
                        'ticket' AS type,
                        NULL AS commentId,
                        at.isRead,
                        at.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Administração') AS nickname,
                        u.avatar,
                        NULL AS downloadName,
                        NULL AS commentContent,
                        NULL AS commentAttachmentPath,
                        NULL AS commentAttachmentOriginalName,
                        NULL AS commentAttachmentMime,
                        NULL AS commentAttachmentSize,
                        at.attachmentPath AS ticketAttachmentPath,
                        at.attachmentOriginalName AS ticketAttachmentOriginalName,
                        at.attachmentMime AS ticketAttachmentMime,
                        at.attachmentSize AS ticketAttachmentSize,
                        at.isBroadcast AS ticketIsBroadcast,
                        NULL AS rankName,
                        NULL AS achievementMessage,
                        at.title AS ticketTitle,
                        at.message AS ticketMessage,
                        at.ticketColor,
                        at.fromUserHierarchyLevel,
                        ds.status AS suspensionStatus,
                        ds.userMessage AS suspensionUserMessage
                    FROM admin_tickets at
                    LEFT JOIN users u ON at.fromUserId = u.id
                    LEFT JOIN download_suspensions ds ON at.id = ds.userTicketId OR at.id = ds.reviewTicketId
                    WHERE at.userId = ? AND at.isRead = 0
                ) AS combined
                ORDER BY datetime(combined.createdAt) DESC, combined.id DESC`,
                [userId, userId, userId],
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    // Remove frase do painel admin de tickets de troca de e-mail
                    for (const row of rows || []) {
                        if (row.type === 'ticket' && row.ticketTitle === 'Pedido de troca de e-mail' && typeof row.ticketMessage === 'string') {
                            row.ticketMessage = row.ticketMessage.replace(/\n?Aprovar ou cancelar esta solicitação no painel admin\.?/gi, '').trim();
                        }
                    }
                    resolve(rows || []);
                }
            );
        });
    }

    // Obter todas as notificacoes de um usuario (padrao + conquistas)
    static getAllNotifications(userId, limit = 50, offset = 0) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM (
                    SELECT
                        n.id,
                        n.userId,
                        n.fromUserId,
                        n.downloadId,
                        n.type,
                        n.commentId,
                        n.isRead,
                        n.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Usuario') AS nickname,
                        u.avatar,
                        COALESCE(u.avatarScale, 1) AS avatarScale,
                        COALESCE(u.avatarOffsetX, 50) AS avatarOffsetX,
                        COALESCE(u.avatarOffsetY, 50) AS avatarOffsetY,
                        COALESCE(d.name, 'Postagem') AS downloadName,
                        dc.content AS commentContent,
                        dc.attachmentPath AS commentAttachmentPath,
                        dc.attachmentOriginalName AS commentAttachmentOriginalName,
                        dc.attachmentMime AS commentAttachmentMime,
                        dc.attachmentSize AS commentAttachmentSize,
                        NULL AS ticketAttachmentPath,
                        NULL AS ticketAttachmentOriginalName,
                        NULL AS ticketAttachmentMime,
                        NULL AS ticketAttachmentSize,
                        0 AS ticketIsBroadcast,
                        NULL AS rankName,
                        NULL AS achievementMessage,
                        NULL AS ticketTitle,
                        NULL AS ticketMessage,
                        NULL AS ticketColor,
                        NULL AS fromUserHierarchyLevel,
                        NULL AS suspensionStatus,
                        NULL AS suspensionUserMessage
                    FROM notifications n
                    LEFT JOIN users u ON n.fromUserId = u.id
                    LEFT JOIN downloads d ON n.downloadId = d.id
                    LEFT JOIN download_comments dc ON n.commentId = dc.id
                    WHERE n.userId = ?

                    UNION ALL

                    SELECT
                        -an.id AS id,
                        an.userId,
                        an.awardedByUserId AS fromUserId,
                        an.relatedDownloadId AS downloadId,
                        'achievement' AS type,
                        NULL AS commentId,
                        an.isRead,
                        an.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Sistema') AS nickname,
                        u.avatar,
                        COALESCE(u.avatarScale, 1) AS avatarScale,
                        COALESCE(u.avatarOffsetX, 50) AS avatarOffsetX,
                        COALESCE(u.avatarOffsetY, 50) AS avatarOffsetY,
                        CASE
                            WHEN an.relatedDownloadId IS NOT NULL THEN COALESCE(d.name, 'Postagem')
                            ELSE NULL
                        END AS downloadName,
                        NULL AS commentContent,
                        NULL AS commentAttachmentPath,
                        NULL AS commentAttachmentOriginalName,
                        NULL AS commentAttachmentMime,
                        NULL AS commentAttachmentSize,
                        NULL AS ticketAttachmentPath,
                        NULL AS ticketAttachmentOriginalName,
                        NULL AS ticketAttachmentMime,
                        NULL AS ticketAttachmentSize,
                        0 AS ticketIsBroadcast,
                        an.rankName,
                        CASE
                            WHEN LOWER(TRIM(COALESCE(an.message, ''))) IN ('conquista automática de evento', 'conquista automática de evento.')
                                THEN 'Você recebeu a conquista especial "' || an.rankName || '".'
                            ELSE an.message
                        END AS achievementMessage,
                        NULL AS ticketTitle,
                        NULL AS ticketMessage,
                        NULL AS ticketColor,
                        NULL AS fromUserHierarchyLevel,
                        NULL AS suspensionStatus,
                        NULL AS suspensionUserMessage
                    FROM achievement_notifications an
                    LEFT JOIN users u ON an.awardedByUserId = u.id
                    LEFT JOIN downloads d ON an.relatedDownloadId = d.id
                    WHERE an.userId = ?

                    UNION ALL

                    SELECT
                        'ticket:' || at.id AS id,
                        at.userId,
                        at.fromUserId,
                        NULL AS downloadId,
                        'ticket' AS type,
                        NULL AS commentId,
                        at.isRead,
                        at.createdAt,
                        u.firstName,
                        u.lastName,
                        COALESCE(u.nickname, 'Administração') AS nickname,
                        u.avatar,
                        COALESCE(u.avatarScale, 1) AS avatarScale,
                        COALESCE(u.avatarOffsetX, 50) AS avatarOffsetX,
                        COALESCE(u.avatarOffsetY, 50) AS avatarOffsetY,
                        NULL AS downloadName,
                        NULL AS commentContent,
                        NULL AS commentAttachmentPath,
                        NULL AS commentAttachmentOriginalName,
                        NULL AS commentAttachmentMime,
                        NULL AS commentAttachmentSize,
                        at.attachmentPath AS ticketAttachmentPath,
                        at.attachmentOriginalName AS ticketAttachmentOriginalName,
                        at.attachmentMime AS ticketAttachmentMime,
                        at.attachmentSize AS ticketAttachmentSize,
                        at.isBroadcast AS ticketIsBroadcast,
                        NULL AS rankName,
                        NULL AS achievementMessage,
                        at.title AS ticketTitle,
                        at.message AS ticketMessage,
                        at.ticketColor,
                        at.fromUserHierarchyLevel,
                        ds.status AS suspensionStatus,
                        ds.userMessage AS suspensionUserMessage
                    FROM admin_tickets at
                    LEFT JOIN users u ON at.fromUserId = u.id
                    LEFT JOIN download_suspensions ds ON at.id = ds.userTicketId OR at.id = ds.reviewTicketId
                    WHERE at.userId = ?
                ) AS combined
                ORDER BY datetime(combined.createdAt) DESC, combined.id DESC
                LIMIT ? OFFSET ?`,
                [userId, userId, userId, Number(limit) || 50, Number(offset) || 0],
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(rows || []);
                }
            );
        });
    }

    // Marcar notificacao como lida (id negativo = achievement_notifications)
    static markAsRead(notificationId, userId) {
        return new Promise((resolve, reject) => {
            const rawId = String(notificationId || '').trim();
            const ticketMatch = rawId.match(/^ticket:(\d+)$/i);
            if (ticketMatch) {
                db.run(
                    `UPDATE admin_tickets SET isRead = 1 WHERE id = ? AND userId = ?`,
                    [Number(ticketMatch[1]), userId],
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve({ success: true, updated: this.changes || 0 });
                    }
                );
                return;
            }

            const parsedId = Number(rawId);
            if (!Number.isInteger(parsedId) || parsedId === 0) {
                reject(new Error('notificationId invalido'));
                return;
            }
            const isAchievementNotification = parsedId < 0;
            const normalizedId = Math.abs(parsedId);
            const query = isAchievementNotification
                ? `UPDATE achievement_notifications SET isRead = 1 WHERE id = ? AND userId = ?`
                : `UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?`;

            db.run(query, [normalizedId, userId], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ success: true, updated: this.changes || 0 });
            });
        });
    }

    // Marcar todas notificacoes do usuario como lidas
    static markAllAsRead(userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0`,
                [userId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const updatedRegular = this.changes || 0;
                    db.run(
                        `UPDATE achievement_notifications SET isRead = 1 WHERE userId = ? AND isRead = 0`,
                        [userId],
                        function(achievementErr) {
                            if (achievementErr) {
                                reject(achievementErr);
                                return;
                            }
                            const updatedAchievements = this.changes || 0;
                            db.run(
                                `UPDATE admin_tickets SET isRead = 1 WHERE userId = ? AND isRead = 0`,
                                [userId],
                                function(ticketErr) {
                                    if (ticketErr) {
                                        reject(ticketErr);
                                        return;
                                    }
                                    resolve({
                                        success: true,
                                        updated: updatedRegular + updatedAchievements + (this.changes || 0)
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    }

    // Contar notificacoes nao lidas (padrao + conquistas)
    static getUnreadCount(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    (SELECT COUNT(*) FROM notifications WHERE userId = ? AND isRead = 0) +
                    (SELECT COUNT(*) FROM achievement_notifications WHERE userId = ? AND isRead = 0) +
                    (SELECT COUNT(*) FROM admin_tickets WHERE userId = ? AND isRead = 0) AS count`,
                [userId, userId, userId],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(Number(row?.count || 0));
                }
            );
        });
    }

    // Deletar notificacao (id negativo = achievement_notifications)
    static deleteNotification(notificationId, userId) {
        return new Promise((resolve, reject) => {
            const rawId = String(notificationId || '').trim();
            const ticketMatch = rawId.match(/^ticket:(\d+)$/i);
            if (ticketMatch) {
                db.run(
                    `DELETE FROM admin_tickets WHERE id = ? AND userId = ?`,
                    [Number(ticketMatch[1]), userId],
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve({ success: true, deleted: this.changes || 0 });
                    }
                );
                return;
            }

            const parsedId = Number(rawId);
            if (!Number.isInteger(parsedId) || parsedId === 0) {
                reject(new Error('notificationId invalido'));
                return;
            }
            const isAchievementNotification = parsedId < 0;
            const normalizedId = Math.abs(parsedId);
            const query = isAchievementNotification
                ? `DELETE FROM achievement_notifications WHERE id = ? AND userId = ?`
                : `DELETE FROM notifications WHERE id = ? AND userId = ?`;

            db.run(query, [normalizedId, userId], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve({ success: true, deleted: this.changes || 0 });
            });
        });
    }

    static deleteAllNotifications(userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM notifications WHERE userId = ?`,
                [userId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const deletedRegular = this.changes || 0;
                    db.run(
                        `DELETE FROM achievement_notifications WHERE userId = ?`,
                        [userId],
                        function(achievementErr) {
                            if (achievementErr) {
                                reject(achievementErr);
                                return;
                            }

                            const deletedAchievements = this.changes || 0;
                            db.run(
                                `DELETE FROM admin_tickets WHERE userId = ?`,
                                [userId],
                                function(ticketErr) {
                                    if (ticketErr) {
                                        reject(ticketErr);
                                        return;
                                    }

                                    resolve({
                                        success: true,
                                        deleted: deletedRegular + deletedAchievements + (this.changes || 0)
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    }

    // Verificar se ja existe notificacao de reacao
    static checkDuplicateReactionNotification(userId, fromUserId, downloadId, type) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT id FROM notifications WHERE userId = ? AND fromUserId = ? AND downloadId = ? AND type = ? AND commentId IS NULL`,
                [userId, fromUserId, downloadId, type],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(!!row);
                }
            );
        });
    }
}

export default Notification;
