import db from '../config/database.js';

const MAX_DOWNLOAD_LINKS = 3;
const VALID_DOWNLOAD_LINK_FORMATS = new Set(['auto', 'apk', 'exe', 'msi', 'zip', 'rar', '7z', 'pdf', 'doc', 'xls', 'ppt', 'txt', 'jpg', 'png', 'gif', 'webp', 'svg', 'mp3', 'mp4', 'iso', 'software', 'site', 'outro']);

function normalizeDownloadLinkFormat(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return VALID_DOWNLOAD_LINK_FORMATS.has(normalized) ? normalized : 'auto';
}

function normalizeDownloadLinksInput(rawLinks) {
    const source = Array.isArray(rawLinks) ? rawLinks : [rawLinks];
    const normalizedLinks = [];

    for (const item of source) {
        if (typeof item === 'string') {
            const url = item.trim();
            if (!url) continue;
            normalizedLinks.push({ url, format: 'auto' });
            continue;
        }

        if (item && typeof item === 'object') {
            const url = String(item.url || item.link || '').trim();
            if (!url) continue;
            normalizedLinks.push({
                url,
                format: normalizeDownloadLinkFormat(item.format)
            });
        }
    }

    return normalizedLinks.slice(0, MAX_DOWNLOAD_LINKS);
}

export default class Download {
    // Criar novo download/postagem
    static createDownload(userId, name, description, link, options = {}) {
        return new Promise((resolve, reject) => {
            const normalizedLinks = normalizeDownloadLinksInput(link);
            const mainLink = normalizedLinks[0]?.url || '';
            const linksJson = normalizedLinks.length > 0 ? JSON.stringify(normalizedLinks) : null;
            const isAdult = options?.isAdult ? 1 : 0;
            const membersOnly = options?.membersOnly ? 1 : 0;

            db.run(
                `INSERT INTO downloads (userId, name, description, link, links_json, isAdult, membersOnly) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, name, description, mainLink, linksJson, isAdult, membersOnly],
                function(err) {
                    if (err) reject(err);
                    resolve({
                        id: this.lastID,
                        userId,
                        name,
                        description,
                        link: mainLink,
                        links_json: linksJson,
                        isAdult,
                        membersOnly,
                        createdAt: new Date()
                    });
                }
            );
        });
    }

    // Obter todos os downloads com informaÃ§Ãµes do usuÃ¡rio
    static getAllDownloads() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                      d.id, d.userId, d.name, d.description, d.link, d.links_json, d.isAdult, d.membersOnly, d.createdAt, d.suspensionStatus,
                      u.firstName, u.lastName, u.nickname, u.avatar, u.avatarScale, u.avatarOffsetX, u.avatarOffsetY, u.profileTag,
                      u.profileTagStyle, u.profileTagColor, u.profileTagTextColor, u.profileTagSymbolStyle, u.profileTagBannerStyle, u.profileTagGradientStart, u.profileTagGradientEnd, u.profileTagUseGradient,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'like') as likes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'heart') as hearts,
                    (SELECT COUNT(*) FROM download_comments WHERE downloadId = d.id) as comments
                FROM downloads d
                JOIN users u ON d.userId = u.id
                ORDER BY d.createdAt DESC`,
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    // Obter download especÃ­fico
    static getDownloadById(downloadId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                      d.id, d.userId, d.name, d.description, d.link, d.links_json, d.isAdult, d.membersOnly, d.createdAt, d.suspensionStatus,
                      u.firstName, u.lastName, u.nickname, u.avatar, u.avatarScale, u.avatarOffsetX, u.avatarOffsetY, u.profileTag,
                      u.profileTagStyle, u.profileTagColor, u.profileTagTextColor, u.profileTagSymbolStyle, u.profileTagBannerStyle, u.profileTagGradientStart, u.profileTagGradientEnd, u.profileTagUseGradient,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'like') as likes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'heart') as hearts,
                    (SELECT COUNT(*) FROM download_comments WHERE downloadId = d.id) as comments
                FROM downloads d
                JOIN users u ON d.userId = u.id
                WHERE d.id = ?`,
                [downloadId],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row || null);
                }
            );
        });
    }

    // Adicionar/remover reaÃ§Ã£o (como toggle - permite mÃºltiplas reaÃ§Ãµes do mesmo usuÃ¡rio)
    static addOrUpdateReaction(downloadId, userId, reactionType) {
        return new Promise((resolve, reject) => {
            // Verifica se o usuÃ¡rio jÃ¡ tem essa reaÃ§Ã£o especÃ­fica
            db.get(
                `SELECT id FROM download_reactions WHERE downloadId = ? AND userId = ? AND reactionType = ?`,
                [downloadId, userId, reactionType],
                (err, existing) => {
                    if (err) reject(err);
                    
                    if (existing) {
                        // Se jÃ¡ existe, remove (toggle off)
                        db.run(
                            `DELETE FROM download_reactions WHERE id = ?`,
                            [existing.id],
                            function(errdel) {
                                if (errdel) reject(errdel);
                                resolve({ removed: true, reactionType });
                            }
                        );
                    } else {
                        // Se nÃ£o existe, adiciona (toggle on)
                        db.run(
                            `INSERT INTO download_reactions (downloadId, userId, reactionType) VALUES (?, ?, ?)`,
                            [downloadId, userId, reactionType],
                            function(erradd) {
                                if (erradd) reject(erradd);
                                resolve({ created: true, reactionType });
                            }
                        );
                    }
                }
            );
        });
    }

    // Obter reaÃ§Ãµes de um download
    static getReactions(downloadId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = ? AND reactionType = 'like') as likes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = ? AND reactionType = 'heart') as hearts`,
                [downloadId, downloadId],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row || { likes: 0, hearts: 0 });
                }
            );
        });
    }

    // Obter reaÃ§Ã£o do usuÃ¡rio em um download
    static getUserReaction(downloadId, userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT reactionType FROM download_reactions WHERE downloadId = ? AND userId ?`,
                [downloadId, userId],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row ? row.reactionType : null);
                }
            );
        });
    }

    // Obter TODAS as reaÃ§Ãµes do usuÃ¡rio em um download (like e heart)
    static getUserReactions(downloadId, userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT reactionType FROM download_reactions WHERE downloadId = ? AND userId = ?`,
                [downloadId, userId],
                (err, rows) => {
                    if (err) reject(err);
                    const reactions = rows || [];
                    resolve({
                        like: reactions.some(r => r.reactionType === 'like'),
                        heart: reactions.some(r => r.reactionType === 'heart')
                    });
                }
            );
        });
    }

    // Verificar se usuÃ¡rio tem uma reaÃ§Ã£o especÃ­fica (like ou heart)
    static checkUserReaction(downloadId, userId, reactionType) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT COUNT(*) as count FROM download_reactions WHERE downloadId = ? AND userId = ? AND reactionType = ?`,
                [downloadId, userId, reactionType],
                (err, row) => {
                    if (err) reject(err);
                    resolve((row && row.count > 0) || false);
                }
            );
        });
    }

    // Deletar download
    static deleteDownload(downloadId) {
        return new Promise((resolve, reject) => {
            // Primeiro deleta as reaÃ§Ãµes
            db.run(
                `DELETE FROM download_reactions WHERE downloadId = ?`,
                [downloadId],
                (err) => {
                    if (err) reject(err);
                    
                    // Depois deleta os favoritos
                    db.run(
                        `DELETE FROM download_favorites WHERE downloadId = ?`,
                        [downloadId],
                        (err) => {
                            if (err) reject(err);
                            
                            // Depois deleta o download
                            db.run(
                                `DELETE FROM downloads WHERE id = ?`,
                                [downloadId],
                                function(errdel) {
                                    if (errdel) reject(errdel);
                                    resolve({ deleted: true });
                                }
                            );
                        }
                    );
                }
            );
        });
    }

    // Atualizar download
    static updateDownload(downloadId, data) {
        return new Promise((resolve, reject) => {
            const { name, description } = data;
            const hasLinksInput = Object.prototype.hasOwnProperty.call(data || {}, 'links')
                || Object.prototype.hasOwnProperty.call(data || {}, 'link');
            const normalizedLinks = hasLinksInput
                ? normalizeDownloadLinksInput(data.links ?? data.link)
                : [];
            const mainLink = hasLinksInput ? (normalizedLinks[0]?.url || '') : null;
            const linksJson = hasLinksInput
                ? (normalizedLinks.length > 0 ? JSON.stringify(normalizedLinks) : null)
                : null;
            const normalizedIsAdult = typeof data.isAdult === 'boolean'
                ? (data.isAdult ? 1 : 0)
                : null;
            const normalizedMembersOnly = typeof data.membersOnly === 'boolean'
                ? (data.membersOnly ? 1 : 0)
                : null;
            
            db.run(
                `UPDATE downloads
                 SET name = ?,
                     description = ?,
                     link = COALESCE(?, link),
                     links_json = COALESCE(?, links_json),
                     isAdult = COALESCE(?, isAdult),
                     membersOnly = COALESCE(?, membersOnly)
                 WHERE id = ?`,
                [name, description, mainLink, linksJson, normalizedIsAdult, normalizedMembersOnly, downloadId],
                function(err) {
                    if (err) reject(err);
                    resolve({
                        id: downloadId,
                        ...data,
                        link: mainLink,
                        links_json: linksJson,
                        isAdult: normalizedIsAdult,
                        membersOnly: normalizedMembersOnly
                    });
                }
            );
        });
    }

    // Obter estatÃ­sticas do usuÃ¡rio

    // Adicionar/remover favorito
    static addOrRemoveFavorite(downloadId, userId) {
        return new Promise((resolve, reject) => {
            // Verificar se jÃ¡ existe nos favoritos
            db.get(
                `SELECT id FROM download_favorites WHERE downloadId = ? AND userId = ?`,
                [downloadId, userId],
                (err, existing) => {
                    if (err) reject(err);
                    
                    if (existing) {
                        // Remove dos favoritos
                        db.run(
                            `DELETE FROM download_favorites WHERE id = ?`,
                            [existing.id],
                            function(errdel) {
                                if (errdel) reject(errdel);
                                resolve({ removed: true });
                            }
                        );
                    } else {
                        // Adiciona aos favoritos
                        db.run(
                            `INSERT INTO download_favorites (downloadId, userId) VALUES (?, ?)`,
                            [downloadId, userId],
                            function(erradd) {
                                if (erradd) reject(erradd);
                                resolve({ added: true });
                            }
                        );
                    }
                }
            );
        });
    }

    // Verificar se um download estÃ¡ nos favoritos do usuÃ¡rio
    static isFavorite(downloadId, userId) {
        return new Promise((resolve, reject) => {
            if (!userId) {
                resolve(false);
                return;
            }
            
            db.get(
                `SELECT id FROM download_favorites WHERE downloadId = ? AND userId = ?`,
                [downloadId, userId],
                (err, row) => {
                    if (err) reject(err);
                    resolve(!!row);
                }
            );
        });
    }

    // Obter favoritos do usuÃ¡rio
    static getUserFavorites(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                      d.id, d.userId, d.name, d.description, d.link, d.links_json, d.isAdult, d.membersOnly, d.createdAt,
                      u.firstName, u.lastName, u.nickname, u.avatar, u.profileTag,
                      u.profileTagStyle, u.profileTagColor, u.profileTagTextColor, u.profileTagSymbolStyle, u.profileTagBannerStyle, u.profileTagGradientStart, u.profileTagGradientEnd, u.profileTagUseGradient,
                    u.postageRankLevel,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'like') as likes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'dislike') as dislikes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'heart') as hearts,
                    (SELECT COUNT(*) FROM downloads WHERE userId = u.id) as userPostageCount
                FROM downloads d
                JOIN users u ON d.userId = u.id
                JOIN download_favorites df ON d.id = df.downloadId
                WHERE df.userId = ?
                ORDER BY df.createdAt DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    // Obter estatÃ­sticas do usuÃ¡rio (para perfil pÃºblico)
    static getUserStats(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    (SELECT COUNT(*) FROM downloads WHERE userId = ?) as totalPostages,
                    (SELECT COUNT(*) FROM download_reactions dr
                        JOIN downloads d ON d.id = dr.downloadId
                        WHERE d.userId = ? AND dr.reactionType = 'like') as totalLikesCurrent,
                    (SELECT COUNT(*) FROM download_reactions dr
                        JOIN downloads d ON d.id = dr.downloadId
                        WHERE d.userId = ? AND dr.reactionType = 'heart') as totalHearts,
                    (SELECT COUNT(*) FROM download_like_history WHERE ownerUserId = ?) as totalLikesHistorical`,
                [userId, userId, userId, userId],
                (err, row) => {
                    if (err) reject(err);
                    const totalLikesHistorical = Number(row?.totalLikesHistorical || 0);
                    resolve({
                        totalPostages: Number(row?.totalPostages || 0),
                        // Mantem compatibilidade: totalLikes passa a ser historico/permanente
                        totalLikes: totalLikesHistorical,
                        totalLikesCurrent: Number(row?.totalLikesCurrent || 0),
                        totalLikesHistorical,
                        totalHearts: Number(row?.totalHearts || 0)
                    });
                }
            );
        });
    }

    // Obter downloads do usuÃ¡rio com conquista
    static getUserDownloads(userId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT 
                      d.id, d.userId, d.name, d.description, d.link, d.links_json, d.isAdult, d.membersOnly, d.createdAt,
                      u.firstName, u.lastName, u.nickname, u.avatar, u.profileTag,
                      u.profileTagStyle, u.profileTagColor, u.profileTagTextColor, u.profileTagSymbolStyle, u.profileTagBannerStyle, u.profileTagGradientStart, u.profileTagGradientEnd, u.profileTagUseGradient,
                    u.postageRankLevel,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'like') as likes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'dislike') as dislikes,
                    (SELECT COUNT(*) FROM download_reactions WHERE downloadId = d.id AND reactionType = 'heart') as hearts,
                    (SELECT COUNT(*) FROM downloads WHERE userId = u.id) as userPostageCount
                FROM downloads d
                JOIN users u ON d.userId = u.id
                WHERE d.userId = ?
                ORDER BY d.createdAt DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    // Verificar se usuário tem permissão de postar
    static hasPostPermission(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT canPostDownloads, emailVerified, id FROM users WHERE id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);

                    if (!row) {
                        resolve(false);
                        return;
                    }

                    const isEmailVerified = Number(row.emailVerified) === 1;

                    resolve(Boolean(row.canPostDownloads) && isEmailVerified);
                }
            );
        });
    }

    // Verificar se usuÃ¡rio pode gerenciar (editar/excluir) downloads de outros usuÃ¡rios
    static canManageDownloads(userId) {
        const userIdNum = Number(userId);
        return new Promise((resolve, reject) => {
            // Admin (ID 1) sempre pode gerenciar
            if (userIdNum === 1) {
                resolve(true);
                return;
            }

            db.get(
                `SELECT canManageDownloads FROM users WHERE id = ?`,
                [userIdNum],
                (userErr, userRow) => {
                    if (userErr) {
                        reject(userErr);
                        return;
                    }

                    if (userRow && Number(userRow.canManageDownloads) === 1) {
                        resolve(true);
                        return;
                    }

                    // Verificar se tem um conquista com canManageDownloads = 1
                    db.get(
                        `SELECT cr.canManageDownloads FROM user_custom_ranks ucr
                         JOIN custom_ranks cr ON ucr.customRankId = cr.id
                         WHERE ucr.userId = ? AND cr.canManageDownloads = 1
                         LIMIT 1`,
                        [userIdNum],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row ? !!row.canManageDownloads : false);
                        }
                    );
                }
            );
        });
    }
}



