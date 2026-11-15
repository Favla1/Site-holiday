import db from '../config/database.js';
import bcrypt from 'bcryptjs';

function normalizeExpiryDate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? new Date(value) : null;
    }

    const normalized = String(value).trim();
    if (/^\d+$/.test(normalized)) {
        return new Date(Number(normalized));
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export class User {
    static create(userData) {
        return new Promise((resolve, reject) => {
            const {
                firstName,
                lastName,
                nickname,
                email,
                password,
                birthDate,
                googleSubject = null,
                emailVerified = 0
            } = userData;
            
            bcrypt.hash(password, 10, (err, hashedPassword) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.run(
                    `INSERT INTO users (firstName, lastName, nickname, email, password, birthDate, googleSubject, emailVerified, canPostDownloads)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                    [firstName, lastName, nickname, email, hashedPassword, birthDate, googleSubject, emailVerified],
                    function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve({ 
                            id: this.lastID, 
                            firstName, 
                            lastName, 
                            nickname, 
                            email 
                        });
                    }
                );
            });
        });
    }

    static findByEmail(email) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE LOWER(email) = LOWER(?)`, [email], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static findByNickname(nickname) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE LOWER(nickname) = LOWER(?)`, [nickname], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static findByUsername(username) {
        return this.findByNickname(username);
    }

    static findById(id) {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    static updateProfile(id, updateData) {
        return new Promise((resolve, reject) => {
            // Construir dinamicamente a query apenas com os campos fornecidos
            const fields = [];
            const values = [];

            if (updateData.bio !== undefined) {
                fields.push('bio = ?');
                values.push(updateData.bio);
            }
            if (updateData.avatar !== undefined) {
                fields.push('avatar = ?');
                values.push(updateData.avatar);
            }
            if (updateData.avatarScale !== undefined) {
                fields.push('avatarScale = ?');
                values.push(updateData.avatarScale);
            }
            if (updateData.avatarOffsetX !== undefined) {
                fields.push('avatarOffsetX = ?');
                values.push(updateData.avatarOffsetX);
            }
            if (updateData.avatarOffsetY !== undefined) {
                fields.push('avatarOffsetY = ?');
                values.push(updateData.avatarOffsetY);
            }
            if (updateData.banner !== undefined) {
                fields.push('banner = ?');
                values.push(updateData.banner);
            }
            if (updateData.bannerScale !== undefined) {
                fields.push('bannerScale = ?');
                values.push(updateData.bannerScale);
            }
            if (updateData.bannerOffsetX !== undefined) {
                fields.push('bannerOffsetX = ?');
                values.push(updateData.bannerOffsetX);
            }
            if (updateData.bannerOffsetY !== undefined) {
                fields.push('bannerOffsetY = ?');
                values.push(updateData.bannerOffsetY);
            }
            if (updateData.firstName !== undefined) {
                fields.push('firstName = ?');
                values.push(updateData.firstName);
            }
            if (updateData.lastName !== undefined) {
                fields.push('lastName = ?');
                values.push(updateData.lastName);
            }
            if (updateData.nickname !== undefined) {
                fields.push('nickname = ?');
                values.push(updateData.nickname);
            }
            if (updateData.email !== undefined) {
                fields.push('email = ?');
                values.push(updateData.email);
            }
            if (updateData.birthDate !== undefined) {
                fields.push('birthDate = ?');
                values.push(updateData.birthDate);
            }
            if (updateData.profileTagline !== undefined) {
                fields.push('profileTagline = ?');
                values.push(updateData.profileTagline);
            }
            if (updateData.profileTag !== undefined) {
                fields.push('profileTag = ?');
                values.push(updateData.profileTag);
            }
            if (updateData.profileTagStyle !== undefined) {
                fields.push('profileTagStyle = ?');
                values.push(updateData.profileTagStyle);
            }
            if (updateData.profileTagColor !== undefined) {
                fields.push('profileTagColor = ?');
                values.push(updateData.profileTagColor);
            }
            if (updateData.profileTagTextColor !== undefined) {
                fields.push('profileTagTextColor = ?');
                values.push(updateData.profileTagTextColor);
            }
            if (updateData.profileTagSymbolStyle !== undefined) {
                fields.push('profileTagSymbolStyle = ?');
                values.push(updateData.profileTagSymbolStyle);
            }
            if (updateData.profileTagBannerStyle !== undefined) {
                fields.push('profileTagBannerStyle = ?');
                values.push(updateData.profileTagBannerStyle);
            }
            if (updateData.profileTagGradientStart !== undefined) {
                fields.push('profileTagGradientStart = ?');
                values.push(updateData.profileTagGradientStart);
            }
            if (updateData.profileTagGradientEnd !== undefined) {
                fields.push('profileTagGradientEnd = ?');
                values.push(updateData.profileTagGradientEnd);
            }
            if (updateData.profileTagUseGradient !== undefined) {
                fields.push('profileTagUseGradient = ?');
                values.push(updateData.profileTagUseGradient);
            }
            if (updateData.showFullNameInMiniProfile !== undefined) {
                fields.push('showFullNameInMiniProfile = ?');
                values.push(updateData.showFullNameInMiniProfile);
            }
            if (updateData.customTitle !== undefined) {
                fields.push('customTitle = ?');
                values.push(updateData.customTitle);
            }
            if (updateData.customTitleSubtitle !== undefined) {
                fields.push('customTitleSubtitle = ?');
                values.push(updateData.customTitleSubtitle);
            }
            if (updateData.aqwCharPageUrl !== undefined) {
                fields.push('aqwCharPageUrl = ?');
                values.push(updateData.aqwCharPageUrl);
            }

            // Se não há campos para atualizar, retorna sucesso
            if (fields.length === 0) {
                resolve({ success: true });
                return;
            }

            // Adicionar ID como último parâmetro
            values.push(id);

            const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
            
            db.run(query, values, (err) => {
                if (err) reject(err);
                resolve({ success: true });
            });
        });
    }

    static verifyPassword(inputPassword, hashedPassword) {
        return bcrypt.compare(inputPassword, hashedPassword);
    }

    static updatePassword(id, newPassword) {
        return new Promise((resolve, reject) => {
            bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
                if (err) reject(err);
                
                db.run(
                    `UPDATE users SET password = ? WHERE id = ?`,
                    [hashedPassword, id],
                    (err) => {
                        if (err) reject(err);
                        resolve({ success: true });
                    }
                );
            });
        });
    }

    static setVerificationCode(email, code) {
        return new Promise((resolve, reject) => {
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

            db.run(
                `UPDATE users SET verificationCode = ?, verificationExpires = ? WHERE LOWER(email) = ?`,
                [code, expiresAt, normalizedEmail],
                (err) => {
                    if (err) reject(err);
                    resolve({ success: true });
                }
            );
        });
    }

    static verifyEmail(email, code) {
        return new Promise((resolve, reject) => {
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const normalizedCode = String(code || '').trim().toUpperCase();

            db.get(
                `SELECT * FROM users WHERE LOWER(email) = ? AND verificationCode = ?`,
                [normalizedEmail, normalizedCode],
                (err, row) => {
                    if (err) reject(err);
                    
                    if (!row) {
                        resolve(null);
                        return;
                    }

                    const now = new Date();
                    const expiresAt = normalizeExpiryDate(row.verificationExpires);

                    if (!expiresAt || now > expiresAt) {
                        resolve(null);
                        return;
                    }

                    db.run(
                        `UPDATE users SET emailVerified = 1, verificationCode = NULL WHERE LOWER(email) = ?`,
                        [normalizedEmail],
                        (err) => {
                            if (err) reject(err);
                            resolve(row);
                        }
                    );
                }
            );
        });
    }

    static setResetCode(email, code) {
        return new Promise((resolve, reject) => {
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

            db.run(
                `UPDATE users SET resetCode = ?, resetExpires = ? WHERE LOWER(email) = ?`,
                [code, expiresAt, normalizedEmail],
                (err) => {
                    if (err) reject(err);
                    resolve({ success: true });
                }
            );
        });
    }

    static verifyResetCode(email, code) {
        return new Promise((resolve, reject) => {
            const normalizedEmail = String(email || '').trim().toLowerCase();
            const normalizedCode = String(code || '').trim().toUpperCase();

            db.get(
                `SELECT * FROM users WHERE LOWER(email) = ? AND resetCode = ?`,
                [normalizedEmail, normalizedCode],
                (err, row) => {
                    if (err) reject(err);
                    
                    if (!row) {
                        resolve(null);
                        return;
                    }

                    const now = new Date();
                    const expiresAt = normalizeExpiryDate(row.resetExpires);

                    if (!expiresAt || now > expiresAt) {
                        resolve(null);
                        return;
                    }

                    resolve(row);
                }
            );
        });
    }

    static setManualRank(userId, rankName) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE users SET manualRank = ? WHERE id = ?`,
                [rankName, userId],
                (err) => {
                    if (err) reject(err);
                    resolve({ success: true });
                }
            );
        });
    }

    static setEmailChangeCode(userId, code) {
        return new Promise((resolve, reject) => {
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos
            db.run(
                `UPDATE users SET emailChangeCode = ?, emailChangeExpires = ? WHERE id = ?`,
                [code, expiresAt, userId],
                (err) => {
                    if (err) reject(err);
                    resolve({ success: true });
                }
            );
        });
    }

    static updateEmail(userId, newEmail) {
        return new Promise((resolve, reject) => {
            const normalizedEmail = String(newEmail || '').trim().toLowerCase();

            db.run(
                `UPDATE users SET email = ?, emailChangeCode = NULL, emailChangeExpires = NULL WHERE id = ?`,
                [normalizedEmail, userId],
                (err) => {
                    if (err) reject(err);
                    resolve({ success: true });
                }
            );
        });
    }
}

export default User;
