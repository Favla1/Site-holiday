import db from '../config/database.js';
import { calculateCompletedRank, calculateRank, getCustomRankByName } from '../config/ranks.js';

const MANUAL_RANK_OVERRIDES_SETTING_KEY = 'manual_rank_overrides';

function normalizeRankNameKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function parseManualRankOverrides(raw) {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(String(raw));
        if (!parsed || typeof parsed !== 'object') return {};
        return parsed;
    } catch {
        return {};
    }
}

function loadManualRankOverrides() {
    return new Promise((resolve) => {
        db.get(
            `SELECT settingValue
             FROM site_settings
             WHERE settingKey = ?
             LIMIT 1`,
            [MANUAL_RANK_OVERRIDES_SETTING_KEY],
            (err, row) => {
                if (err) return resolve({});
                resolve(parseManualRankOverrides(row?.settingValue));
            }
        );
    });
}

function applyManualRankOverride(manualRankName, baseRank, overrideMap) {
    const key = normalizeRankNameKey(manualRankName);
    const rawOverride = overrideMap?.[key];
    if (!rawOverride || typeof rawOverride !== 'object') return { ...baseRank };

    const overrideName = String(rawOverride.name || '').trim();
    const overrideDescription = String(rawOverride.description || '').trim();
    const overrideCustomText = String(rawOverride.customText || '').trim();
    const overrideColor = /^#[0-9a-f]{6}$/i.test(String(rawOverride.color || '').trim())
        ? String(rawOverride.color).trim().toUpperCase()
        : '';
    const overrideBackgroundImage = String(rawOverride.backgroundImage || '').trim();

    return {
        ...baseRank,
        name: overrideName || manualRankName,
        description: overrideDescription || baseRank.description,
        customText: overrideCustomText || baseRank.customText || '',
        color: baseRank.customColor || overrideColor || baseRank.color,
        backgroundImage: Object.prototype.hasOwnProperty.call(rawOverride, 'backgroundImage')
            ? overrideBackgroundImage
            : baseRank.backgroundImage || ''
    };
}

export class Rank {
    /**
     * Retorna o conquista do usuário (customizado ou automático)
     * Se tem conquista customizado, retorna ele
     * Caso contrário, retorna o conquista automático baseado em dias de criação
     */
    static getUserRank(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT u.createdAt, u.manualRank, u.manualRankColor FROM users u WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    if (!row) resolve(null);
                    else {
                        if (row.manualRank) {
                            const customRank = getCustomRankByName(row.manualRank);
                            if (customRank) {
                                loadManualRankOverrides()
                                    .then((overrideMap) => {
                                        const overridden = applyManualRankOverride(row.manualRank, { ...customRank, customText: '' }, overrideMap);
                                        const customColor = String(row.manualRankColor || '').trim();
                                        const baseColor = String(customRank.color || '').trim();
                                        resolve({
                                            ...overridden,
                                            color: customColor || overridden.color || baseColor || customRank.color,
                                            baseColor: baseColor || customRank.color || null,
                                            customColor: customColor || null,
                                            isCustom: true
                                        });
                                    })
                                    .catch(() => {
                                        const customColor = String(row.manualRankColor || '').trim();
                                        const baseColor = String(customRank.color || '').trim();
                                        resolve({
                                            ...customRank,
                                            name: row.manualRank,
                                            customText: '',
                                            color: customColor || baseColor || customRank.color,
                                            baseColor: baseColor || customRank.color || null,
                                            customColor: customColor || null,
                                            isCustom: true
                                        });
                                    });
                            } else {
                                resolve({
                                    ...calculateRank(row.createdAt),
                                    isCustom: false
                                });
                            }
                        } else {
                            resolve({
                                ...calculateRank(row.createdAt),
                                isCustom: false
                            });
                        }
                    }
                }
            );
        });
    }

    /**
     * Retorna tanto o conquista automático quanto o customizado do usuário
     */
    static getUserRankComplete(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT u.createdAt, u.manualRank, u.manualRankColor FROM users u WHERE u.id = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    if (!row) resolve(null);
                    else {
                        const autoRank = calculateRank(row.createdAt);
                        const completedAutoRank = calculateCompletedRank(row.createdAt);
                        const customRankBase = row.manualRank ? getCustomRankByName(row.manualRank) : null;
                        const finalize = (overrideMap) => {
                            const baseCustomRank = customRankBase
                                ? {
                                    ...customRankBase,
                                    name: row.manualRank,
                                    customText: '',
                                    color: String(row.manualRankColor || '').trim() || customRankBase.color,
                                    baseColor: customRankBase.color,
                                    customColor: String(row.manualRankColor || '').trim() || null
                                }
                                : null;

                            const customRank = baseCustomRank
                                ? applyManualRankOverride(row.manualRank, baseCustomRank, overrideMap || {})
                                : null;

                            resolve({
                                automatic: autoRank,
                                automaticCompleted: completedAutoRank,
                                custom: customRank ? { ...customRank } : null,
                                current: customRank
                                    ? { ...customRank, isCustom: true }
                                    : { ...autoRank, isCustom: false }
                            });
                        };

                        if (!customRankBase) {
                            finalize({});
                            return;
                        }

                        loadManualRankOverrides()
                            .then((overrideMap) => finalize(overrideMap))
                            .catch(() => finalize({}));
                    }
                }
            );
        });
    }

    static getRankHistory(userId) {
        return new Promise((resolve, reject) => {
            console.log('[Rank.getRankHistory] Getting history for user', userId);
            // Retornar as conquistas customizadas do usuário ordenadas por data de atribuição
            db.all(
                `SELECT
                    cr.id,
                    cr.name,
                    COALESCE(NULLIF(TRIM(ucr.customColor), ''), cr.color) AS color,
                    cr.color AS baseColor,
                    ucr.customColor AS customColor,
                    cr.icon,
                    cr.description,
                    cr.customText,
                    cr.backgroundImage,
                    cr.enableAdminPanel,
                    cr.isVisible,
                    cr.canManageDownloads,
                    cr.canOrderAllRanks,
                    cr.canUseAnimatedProfile,
                    cr.canChangeOwnColor,
                    cr.rankGroup,
                    cr.isDefault,
                    cr.createdAt,
                    ucr.assignedAt
                 FROM custom_ranks cr
                 JOIN user_custom_ranks ucr ON cr.id = ucr.customRankId
                 WHERE ucr.userId = ?
                 ORDER BY ucr.assignedAt ASC`,
                [userId],
                (err, rows) => {
                    if (err) {
                        console.error('[Rank.getRankHistory] Error:', err);
                        return reject(err);
                    }
                    console.log('[Rank.getRankHistory] Returned', rows?.length || 0, 'ranks');
                    resolve(rows || []);
                }
            );
        });
    }

    static recordRankAchievement(userId, rank) {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO ranks (userId, rankLevel, rankName, color, icon) VALUES (?, ?, ?, ?, ?)`,
                [userId, rank.level, rank.name, rank.color, rank.icon],
                function(err) {
                    if (err) reject(err);
                    resolve({ id: this.lastID, ...rank });
                }
            );
        });
    }

    /**
     * Retorna os conquistas selecionados para exibição na ordem salva pelo usuário.
     * Inclui também conquistas fixos atribuídos (isVisible = 0).
     */
    static getSelectedRanks(userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT selectedRanks FROM users WHERE id = ?`,
                [userId],
                (err, userRow) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let selectedIds = [];
                    if (userRow && userRow.selectedRanks) {
                        try {
                            const parsed = JSON.parse(userRow.selectedRanks);
                            if (Array.isArray(parsed)) {
                                selectedIds = parsed
                                    .map(id => Number(id))
                                    .filter(Number.isFinite);
                            }
                        } catch (e) {
                            selectedIds = [];
                        }
                    }

                    const loadSelectedRanks = (cb) => {
                        if (selectedIds.length === 0) {
                            cb([]);
                            return;
                        }

                        const placeholders = selectedIds.map(() => '?').join(',');
                        db.all(
                            `SELECT
                                cr.id,
                                cr.name,
                                COALESCE(NULLIF(TRIM(ucr.customColor), ''), cr.color) AS color,
                                cr.color AS baseColor,
                                ucr.customColor AS customColor,
                                cr.icon,
                                COALESCE(NULLIF(TRIM(ucr.customDescription), ''), cr.description) AS description,
                                cr.isVisible,
                                cr.canChangeOwnColor
                             FROM custom_ranks cr
                             LEFT JOIN user_custom_ranks ucr
                                ON ucr.customRankId = cr.id
                               AND ucr.userId = ?
                             WHERE cr.id IN (${placeholders})`,
                            [userId, ...selectedIds],
                            (selectedErr, selectedRows) => {
                                if (selectedErr) {
                                    reject(selectedErr);
                                    return;
                                }
                                const byId = new Map((selectedRows || []).map(rank => [Number(rank.id), rank]));
                                const ordered = selectedIds
                                    .map(id => byId.get(Number(id)))
                                    .filter(Boolean);
                                cb(ordered);
                            }
                        );
                    };

                    const loadFixedRanks = (cb) => {
                        db.all(
                            `SELECT
                                cr.id,
                                cr.name,
                                COALESCE(NULLIF(TRIM(ucr.customColor), ''), cr.color) AS color,
                                cr.color AS baseColor,
                                ucr.customColor AS customColor,
                                cr.icon,
                                COALESCE(NULLIF(TRIM(ucr.customDescription), ''), cr.description) AS description,
                                cr.isVisible,
                                cr.canChangeOwnColor
                             FROM user_custom_ranks ucr
                             JOIN custom_ranks cr ON cr.id = ucr.customRankId
                             WHERE ucr.userId = ? AND cr.isVisible = 0
                             ORDER BY ucr.assignedAt ASC`,
                            [userId],
                            (fixedErr, fixedRows) => {
                                if (fixedErr) {
                                    reject(fixedErr);
                                    return;
                                }
                                cb(fixedRows || []);
                            }
                        );
                    };

                    loadSelectedRanks((selectedRanks) => {
                        loadFixedRanks((fixedRanks) => {
                            const result = [...selectedRanks];
                            for (const fixedRank of fixedRanks) {
                                if (!result.find(rank => Number(rank.id) === Number(fixedRank.id))) {
                                    result.push(fixedRank);
                                }
                            }
                            resolve(result);
                        });
                    });
                }
            );
        });
    }
}

export default Rank;
