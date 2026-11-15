import db from '../config/database.js';

export class AchievementNotification {
    static createNotification(userId, rankName, options = {}) {
        const {
            message = '',
            awardedByUserId = null,
            relatedDownloadId = null
        } = options;

        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO achievement_notifications
                 (userId, rankName, message, awardedByUserId, relatedDownloadId, isRead)
                 VALUES (?, ?, ?, ?, ?, 0)`,
                [userId, rankName, message || '', awardedByUserId, relatedDownloadId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({
                        id: this.lastID,
                        userId,
                        rankName,
                        message,
                        awardedByUserId,
                        relatedDownloadId,
                        isRead: false,
                        createdAt: new Date().toISOString()
                    });
                }
            );
        });
    }

    static getUnreadNotifications(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    an.id,
                    an.userId,
                    an.rankName,
                    an.message,
                    an.awardedByUserId,
                    an.relatedDownloadId AS downloadId,
                    an.isRead,
                    an.createdAt,
                    u.nickname AS awardedByNickname,
                    u.avatar AS awardedByAvatar
                 FROM achievement_notifications an
                 LEFT JOIN users u ON an.awardedByUserId = u.id
                 WHERE an.userId = ? AND an.isRead = 0
                 ORDER BY an.createdAt DESC`,
                [userId],
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

    static getAllNotifications(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    an.id,
                    an.userId,
                    an.rankName,
                    an.message,
                    an.awardedByUserId,
                    an.relatedDownloadId AS downloadId,
                    an.isRead,
                    an.createdAt,
                    u.nickname AS awardedByNickname,
                    u.avatar AS awardedByAvatar
                 FROM achievement_notifications an
                 LEFT JOIN users u ON an.awardedByUserId = u.id
                 WHERE an.userId = ?
                 ORDER BY an.createdAt DESC`,
                [userId],
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

    static markAsRead(notificationId, userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE achievement_notifications
                 SET isRead = 1
                 WHERE id = ? AND userId = ?`,
                [notificationId, userId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ success: true, updated: this.changes || 0 });
                }
            );
        });
    }

    static markAllAsRead(userId) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE achievement_notifications
                 SET isRead = 1
                 WHERE userId = ? AND isRead = 0`,
                [userId],
                function(err) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve({ success: true, updated: this.changes || 0 });
                }
            );
        });
    }

    static getUnreadCount(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) AS count
                 FROM achievement_notifications
                 WHERE userId = ? AND isRead = 0`,
                [userId],
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
}

export default AchievementNotification;

