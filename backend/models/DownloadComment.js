import db from '../config/database.js';

export class DownloadComment {
    // Criar novo comentario
    static createComment(downloadId, userId, content, attachment = null) {
        return new Promise((resolve, reject) => {
            const attachmentPath = attachment?.path || null;
            const attachmentOriginalName = attachment?.originalName || null;
            const attachmentMime = attachment?.mime || null;
            const attachmentSize = Number.isFinite(Number(attachment?.size))
                ? Number(attachment.size)
                : null;

            db.run(
                `INSERT INTO download_comments (
                    downloadId,
                    userId,
                    content,
                    attachmentPath,
                    attachmentOriginalName,
                    attachmentMime,
                    attachmentSize
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    downloadId,
                    userId,
                    content,
                    attachmentPath,
                    attachmentOriginalName,
                    attachmentMime,
                    attachmentSize
                ],
                function(err) {
                    if (err) return reject(err);
                    resolve({
                        id: this.lastID,
                        downloadId,
                        userId,
                        content,
                        attachmentPath,
                        attachmentOriginalName,
                        attachmentMime,
                        attachmentSize,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    });
                }
            );
        });
    }

    // Obter todos os comentarios de uma postagem
    static getDownloadComments(downloadId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                    dc.id,
                    dc.downloadId,
                    dc.userId,
                    dc.content,
                    dc.attachmentPath,
                    dc.attachmentOriginalName,
                    dc.attachmentMime,
                    dc.attachmentSize,
                    dc.isPinned,
                    dc.pinnedBy,
                    dc.pinnedAt,
                    dc.createdAt,
                    dc.updatedAt,
                    u.firstName,
                    u.lastName,
                    u.nickname,
                    u.avatar,
                    pinner.id as pinnedById,
                    pinner.nickname as pinnedByNickname,
                    pinner.avatar as pinnedByAvatar
                FROM download_comments dc
                JOIN users u ON dc.userId = u.id
                LEFT JOIN users pinner ON dc.pinnedBy = pinner.id
                WHERE dc.downloadId = ?
                ORDER BY dc.isPinned DESC, dc.createdAt DESC`,
                [downloadId],
                async (err, rows) => {
                    if (err) return reject(err);
                    
                    if (!rows || rows.length === 0) {
                        return resolve([]);
                    }

                    // Buscar reações para cada comentário
                    try {
                        const commentsWithReactions = await Promise.all(
                            rows.map(async (row) => {
                                const reactions = await new Promise((res, rej) => {
                                    db.all(
                                        `SELECT emoji, COUNT(*) as count FROM comment_reactions WHERE commentId = ? GROUP BY emoji`,
                                        [row.id],
                                        (err, reactionRows) => {
                                            if (err) return rej(err);
                                            res(reactionRows || []);
                                        }
                                    );
                                });
                                return { ...row, reactions };
                            })
                        );
                        resolve(commentsWithReactions);
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }

    // Obter um comentario especifico
    static getCommentById(commentId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    dc.id,
                    dc.downloadId,
                    dc.userId,
                    dc.content,
                    dc.attachmentPath,
                    dc.attachmentOriginalName,
                    dc.attachmentMime,
                    dc.attachmentSize,
                    dc.createdAt,
                    dc.updatedAt,
                    u.firstName,
                    u.lastName,
                    u.nickname,
                    u.avatar
                FROM download_comments dc
                JOIN users u ON dc.userId = u.id
                WHERE dc.id = ?`,
                [commentId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row || null);
                }
            );
        });
    }

    // Editar comentario
    static updateComment(commentId, content) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE download_comments SET content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                [content, commentId],
                function(err) {
                    if (err) return reject(err);
                    resolve({ success: true, updated: this.changes });
                }
            );
        });
    }

    // Fixar/Desafixar comentário
    static setPinned(commentId, isPinned, pinnedBy = null) {
        return new Promise((resolve, reject) => {
            let query = `UPDATE download_comments SET isPinned = ?`;
            let params = [isPinned ? 1 : 0];
            
            if (isPinned && pinnedBy) {
                // Quando pinnar, salva quem pinnou e o timestamp
                query += `, pinnedBy = ?, pinnedAt = CURRENT_TIMESTAMP`;
                params.push(pinnedBy);
            } else if (!isPinned) {
                // Quando desafixar, remove os dados de quem pinnou
                query += `, pinnedBy = NULL, pinnedAt = NULL`;
            }
            
            query += ` WHERE id = ?`;
            params.push(commentId);
            
            db.run(query, params, function(err) {
                if (err) return reject(err);
                resolve({ success: true, updated: this.changes });
            });
        });
    }

    // Deletar comentario
    static deleteComment(commentId) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM download_comments WHERE id = ?`,
                [commentId],
                function(err) {
                    if (err) return reject(err);
                    resolve({ success: true, deleted: this.changes });
                }
            );
        });
    }

    // Contar comentarios de uma postagem
    static getCommentCount(downloadId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count FROM download_comments WHERE downloadId = ?`,
                [downloadId],
                (err, row) => {
                    if (err) return reject(err);
                    resolve(row ? row.count : 0);
                }
            );
        });
    }
}

export default DownloadComment;
