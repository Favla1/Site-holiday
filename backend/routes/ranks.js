import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, isAdminOrHasAdminRank } from '../middleware/auth.js';
import { canAssignOrRemoveRole } from '../utils/staff-hierarchy.js';
import db from '../config/database.js';
import { fileURLToPath } from 'url';
import AchievementNotification from '../models/AchievementNotification.js';
import Rank from '../models/Rank.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const MAX_RANK_BACKGROUND_BYTES = 500 * 1024 * 1024; // 500MB
const RANK_BACKGROUND_UPLOAD_DIR = path.join(__dirname, '../../uploads/rank-backgrounds');
const ALLOWED_RANK_BACKGROUND_MIME = new Set([
    'image/gif',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
]);
const ALLOWED_RANK_BACKGROUND_EXT = new Set([
    '.gif',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp'
]);

const rankBackgroundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(RANK_BACKGROUND_UPLOAD_DIR, { recursive: true });
        cb(null, RANK_BACKGROUND_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase() || '.gif';
        cb(null, `rank-bg-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});

const uploadRankBackground = multer({
    storage: rankBackgroundStorage,
    limits: { fileSize: MAX_RANK_BACKGROUND_BYTES },
    fileFilter: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const byExt = ALLOWED_RANK_BACKGROUND_EXT.has(ext);
        const byMime = ALLOWED_RANK_BACKGROUND_MIME.has(mime);
        const mimeUnknown = !mime || mime === 'application/octet-stream';
        const allowed = byExt && (byMime || mimeUnknown);
        if (allowed) return cb(null, true);
        cb(new Error('Imagem da conquista aceita apenas GIF, PNG, JPG ou WEBP.'));
    }
});

function dbGetAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAllAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function dbRunAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function removeRankIdFromUserSelectedRanks(userId, rankId) {
    if (!Number.isInteger(userId) || userId <= 0) return;
    const targetId = Number(rankId);
    if (!Number.isFinite(targetId)) return;

    const row = await dbGetAsync('SELECT selectedRanks FROM users WHERE id = ?', [userId]);
    if (!row?.selectedRanks) return;

    let selectedRanks;
    try {
        selectedRanks = JSON.parse(row.selectedRanks);
    } catch {
        return;
    }

    if (!Array.isArray(selectedRanks)) return;

    const filteredRanks = selectedRanks.filter((item) => {
        if (typeof item === 'number' && Number.isFinite(item)) {
            return Number(item) !== targetId;
        }
        if (typeof item === 'string') {
            const trimmed = item.trim();
            const asNumber = Number(trimmed);
            if (Number.isFinite(asNumber) && Number(asNumber) === targetId) {
                return false;
            }
        }
        return true;
    });

    if (filteredRanks.length === selectedRanks.length) return;

    await dbRunAsync(
        'UPDATE users SET selectedRanks = ? WHERE id = ?',
        [filteredRanks.length > 0 ? JSON.stringify(filteredRanks) : null, userId]
    );
}

const PROGRESSION_RANK_SEQUENCE = [
    'membro inicial',
    'membro novato',
    'membro iniciado',
    'membro aprendiz',
    'membro experiente',
    'membro adepto',
    'membro especialista',
    'membro mestre',
    'grande mestre',
    'membro lendário',
    'membro mítico',
    'membro transcendente',
    'membro eterno',
    'membro imortal'
];
const PROGRESSION_RANK_ORDER = new Map(
    PROGRESSION_RANK_SEQUENCE.map((name, index) => [name, index])
);

const FIXED_AUTO_RANK_KEY = 'fixed:auto';
const FIXED_MANUAL_RANK_KEY = 'fixed:manual';

function normalizeRankNameKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

async function getHighestOwnedProgressionRank(userId, fallbackRank = null) {
    const progressionRows = await dbAllAsync(
        `SELECT
            cr.id,
            cr.name,
            COALESCE(NULLIF(TRIM(ucr.customColor), ''), cr.color) AS color,
            cr.description,
            cr.customText,
            cr.icon,
            cr.rankGroup,
            cr.isVisible,
            ucr.assignedAt
         FROM user_custom_ranks ucr
         JOIN custom_ranks cr ON cr.id = ucr.customRankId
         WHERE ucr.userId = ? AND cr.rankGroup = 'progression'`,
        [userId]
    );

    const rankedRows = (progressionRows || [])
        .map((row) => ({
            ...row,
            _progressionOrder: PROGRESSION_RANK_ORDER.has(String(row?.name || '').trim().toLowerCase())
                ? Number(PROGRESSION_RANK_ORDER.get(String(row?.name || '').trim().toLowerCase()))
                : -1
        }))
        .filter((row) => row._progressionOrder >= 0 && String(row?.name || '').trim().toLowerCase() !== 'membro beta')
        .sort((a, b) => b._progressionOrder - a._progressionOrder || String(b.assignedAt || '').localeCompare(String(a.assignedAt || '')));

    if (rankedRows.length > 0) {
        const top = rankedRows[0];
        return {
            id: top.id,
            name: top.name,
            color: top.color,
            description: top.description || '',
            customText: top.customText || '',
            backgroundImage: null,
            isVisible: top.isVisible,
            rankGroup: 'progression',
            icon: top.icon || '',
            isFixed: true,
            isRemovable: true
        };
    }

    return fallbackRank || null;
}

function parseHiddenFixedRankIds(value) {
    try {
        const parsed = JSON.parse(String(value || '[]'));
        if (!Array.isArray(parsed)) return [];
        return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
    } catch {
        return [];
    }
}

function buildFixedRankObject(rank, type) {
    const normalizedKey = normalizeRankNameKey(rank?.name || '').replace(/\s+/g, '-');
    const color = rank?.color || rank?.baseColor || rank?.customColor || '#EC4899';
    return {
        id: `fixed-${type}-${normalizedKey}`,
        name: rank?.name || 'Conquista',
        color,
        description: rank?.description || '',
        customText: rank?.customText || '',
        backgroundImage: null,
        enableAdminPanel: false,
        isVisible: rank?.isVisible ?? 1,
        rankGroup: type === 'manual' ? 'fixed_manual' : 'progression',
        icon: rank?.icon || '',
        isFixed: true,
        isRemovable: true
    };
}

async function canSendAchievementNotification(userId) {
    const row = await dbGetAsync(
        `SELECT disableAchievementNotifications, disableAllNotifications FROM users WHERE id = ?`,
        [userId]
    );
    if (!row) return false;
    if (Number(row.disableAllNotifications) === 1) return false;
    if (Number(row.disableAchievementNotifications) === 1) return false;
    return true;
}

async function ensureHiddenProgressionRanksColumn() {
    try {
        await dbGetAsync(`SELECT hiddenProgressionRanks FROM users LIMIT 1`, []);
    } catch (error) {
        if (String(error.message || '').toLowerCase().includes('no such column')) {
            await dbRunAsync(`ALTER TABLE users ADD COLUMN hiddenProgressionRanks TEXT DEFAULT NULL`, []);
        }
    }
}

// CONQUISTAS PADRÃO (não removíveis)
const DEFAULT_RANKS = [
    { name: 'Beta', color: '#6B46C1', icon: 'BETA', description: 'Novo membro' },
    { name: 'Alpha', color: '#EC4899', icon: 'ALPHA', description: 'Membro experiente' },
    { name: 'Initiate', color: '#3B82F6', icon: 'INIT', description: 'Iniciado' },
    { name: 'Apprentice', color: '#06B6D4', icon: 'APPR', description: 'Aprendiz' },
    { name: 'Novice', color: '#10B981', icon: 'NOV', description: 'Novato' },
    { name: 'Adept', color: '#F59E0B', icon: 'ADPT', description: 'Adepto' },
    { name: 'Expert', color: '#8B5CF6', icon: 'EXP', description: 'Especialista' },
    { name: 'Master', color: '#06B6D4', icon: 'MAS', description: 'Mestre' },
    { name: 'Sage', color: '#10B981', icon: 'SAG', description: 'Sábio' },
    { name: 'Oracle', color: '#F59E0B', icon: 'ORC', description: 'Oráculo' },
    { name: 'Mythic', color: '#8B5CF6', icon: 'MYT', description: 'Mítico' },
    { name: 'Legend', color: '#DC2626', icon: 'LEG', description: 'Lenda' },
    { name: 'Eternal', color: '#7C3AED', icon: 'ETR', description: 'Eterno' },
    { name: 'Supreme', color: '#EC4899', icon: 'SUP', description: 'Supremo' }
];

// GET - Listar todos os conquistas customizáveis (incluindo ocultos) - APENAS PARA ADMINS
router.get('/custom/all', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        db.all(`SELECT *, rankGroup AS "group" FROM custom_ranks WHERE isDefault = 0 ORDER BY createdAt ASC`, (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro ao buscar conquistas' });
            }
            res.json({ success: true, ranks: rows || [] });
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
    }
});

// GET - Listar todos os conquistas customizáveis
router.get('/custom', (req, res) => {
    db.all(`SELECT * FROM custom_ranks WHERE isDefault = 0 AND isVisible = 1 AND (rankGroup IS NULL OR TRIM(rankGroup) = '') ORDER BY createdAt ASC`, (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao buscar conquistas' });
        }
        res.json({ success: true, ranks: rows || [] });
    });
});

router.get('/custom/group/:group', protect, isAdminOrHasAdminRank, async (req, res) => {
    let group = String(req.params.group || '').trim().toLowerCase();
    if (!group) {
        return res.status(400).json({ success: false, message: 'Grupo inválido' });
    }

    if (group === 'likes' || group === 'like') {
        group = 'like_achievement';
    } else if (group === 'posts' || group === 'post') {
        group = 'post_achievement';
    } else if (group === 'fixed_automatic') {
        group = 'progression';
    }

    if (!['post_achievement', 'like_achievement', 'progression'].includes(group)) {
        return res.status(400).json({ success: false, message: 'Grupo inválido' });
    }

    db.all(`SELECT *, rankGroup AS "group" FROM custom_ranks WHERE isDefault = 0 AND LOWER(TRIM(rankGroup)) = ? ORDER BY createdAt ASC`, [group.toLowerCase()], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Erro ao buscar conquistas por grupo' });
        }
        res.json({ success: true, ranks: rows || [] });
    });
});

// GET - Listar conquistas padrão
router.get('/default', (req, res) => {
    res.json({ success: true, ranks: DEFAULT_RANKS });
});

function handleRankBackgroundUpload(req, res) {
    uploadRankBackground.single('backgroundImage')(req, res, (err) => {
        if (err?.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Arquivo muito grande. Limite de 500MB para imagem da conquista.'
            });
        }

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Erro no upload da imagem da conquista.'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo foi enviado.'
            });
        }

        return res.json({
            success: true,
            message: 'Imagem enviada com sucesso.',
            backgroundImageUrl: `/uploads/rank-backgrounds/${req.file.filename}`
        });
    });
}

// POST - Upload de imagem de fundo para conquista customizável (até 500MB)
router.post('/custom/upload-background', protect, isAdminOrHasAdminRank, handleRankBackgroundUpload);
// Compatibilidade com versões antigas do frontend
router.post('/cust-upload-background', protect, isAdminOrHasAdminRank, handleRankBackgroundUpload);
router.post('/cust_upload_background', protect, isAdminOrHasAdminRank, handleRankBackgroundUpload);
// POST - Criar novo conquista customizável
router.post('/custom', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const userId = parseInt(req.user.id);
        console.log('[RANKS] Tentando criar conquista. UserID:', userId);

        const {
            name,
            color,
            description,
            customText,
            backgroundImageUrl,
            enableAdminPanel,
            isVisible,
            canManageDownloads,
            canOrderAllRanks,
            canUseAnimatedProfile,
            canChangeOwnColor
        } = req.body;

        if (!name || !color || !description) {
            return res.status(400).json({ success: false, message: 'Nome, cor e descrição são obrigatórios' });
        }

        db.run(
            'INSERT INTO custom_ranks (name, color, icon, description, customText, backgroundImage, enableAdminPanel, isVisible, canManageDownloads, canOrderAllRanks, canUseAnimatedProfile, canChangeOwnColor, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
            [
                name,
                color,
                name.substring(0, 3).toUpperCase(),
                description,
                customText,
                backgroundImageUrl || null,
                Boolean(enableAdminPanel) ? 1 : 0,
                Boolean(isVisible) ? 1 : 0,
                Boolean(canManageDownloads) ? 1 : 0,
                Boolean(canOrderAllRanks) ? 1 : 0,
                Boolean(canUseAnimatedProfile) ? 1 : 0,
                Boolean(canChangeOwnColor) ? 1 : 0
            ],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ success: false, message: 'conquista com esse nome já existe' });
                    }
                    return res.status(500).json({ success: false, message: 'Erro ao criar conquista' });
                }
                console.log('[RANKS] conquista criado com sucesso:', name);
                res.json({
                    success: true,
                    message: 'conquista criado com sucesso',
                    rank: {
                        id: this.lastID,
                        name,
                        color,
                        description,
                        customText,
                        backgroundImage: backgroundImageUrl || null,
                        enableAdminPanel: Boolean(enableAdminPanel) ? 1 : 0,
                        isVisible: Boolean(isVisible) ? 1 : 0,
                        canManageDownloads: Boolean(canManageDownloads) ? 1 : 0,
                        canOrderAllRanks: Boolean(canOrderAllRanks) ? 1 : 0,
                        canUseAnimatedProfile: Boolean(canUseAnimatedProfile) ? 1 : 0,
                        canChangeOwnColor: Boolean(canChangeOwnColor) ? 1 : 0,
                        isDefault: 0
                    }
                });
            }
        );
    } catch (error) {
        console.error('[RANKS] Erro ao criar conquista:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor: ' + error.message });
    }
});

// PUT - Editar conquista customizável
router.put('/custom/:id', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const {
            name,
            color,
            description,
            customText,
            backgroundImageUrl,
            enableAdminPanel,
            isVisible,
            canManageDownloads,
            canOrderAllRanks,
            canUseAnimatedProfile,
            canChangeOwnColor
        } = req.body;
        const rankId = req.params.id;

        if (!name || !color || !description) {
            return res.status(400).json({ success: false, message: 'Nome, cor e descrição são obrigatórios' });
        }

        // Buscar nome antigo do conquista usando Promise
        const row = await new Promise((resolve, reject) => {
            db.get('SELECT name FROM custom_ranks WHERE id = ? AND isDefault = 0', [rankId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        if (!row) {
            return res.status(404).json({ success: false, message: 'conquista não encontrado' });
        }

        const oldName = row.name;
        const oldImagePath = path.join(__dirname, '../imagens', `${oldName}.png`);
        const newImagePath = path.join(__dirname, '../imagens', `${name}.png`);

        // Se o nome mudou e a imagem antiga existe, renomear para o novo nome
        if (oldName !== name && fs.existsSync(oldImagePath)) {
            fs.rename(oldImagePath, newImagePath, (renameErr) => {
                if (renameErr) {
                    console.error('Erro ao renomear imagem:', renameErr);
                }
            });
        }

        // Atualizar banco de dados
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE custom_ranks SET name = ?, color = ?, description = ?, customText = ?, backgroundImage = ?, enableAdminPanel = ?, isVisible = ?, canManageDownloads = ?, canOrderAllRanks = ?, canUseAnimatedProfile = ?, canChangeOwnColor = ? WHERE id = ? AND isDefault = 0',
                [
                    name,
                    color,
                    description || '',
                    customText || '',
                    (backgroundImageUrl || '').trim() || null,
                    Boolean(enableAdminPanel) ? 1 : 0,
                    Boolean(isVisible) ? 1 : 0,
                    Boolean(canManageDownloads) ? 1 : 0,
                    Boolean(canOrderAllRanks) ? 1 : 0,
                    Boolean(canUseAnimatedProfile) ? 1 : 0,
                    Boolean(canChangeOwnColor) ? 1 : 0,
                    rankId
                ],
                function(err) {
                    if (err) reject(err);
                    else if (this.changes === 0) reject(new Error('conquista não encontrado ou é um conquista padrão'));
                    else resolve();
                }
            );
        });

        res.json({ success: true, message: 'conquista atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar conquista:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar conquista: ' + error.message });
    }
});

// DELETE - Deletar conquista customizável
router.delete('/custom/:id', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        db.run(
            'DELETE FROM custom_ranks WHERE id = ? AND isDefault = 0',
            [req.params.id],
            function(err) {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Erro ao deletar conquista' });
                }
                if (this.changes === 0) {
                    return res.status(404).json({ success: false, message: 'conquista não encontrado ou é um conquista padrão' });
                }
                
                // Remover associações de usuários com este conquista
                db.run('DELETE FROM user_custom_ranks WHERE customRankId = ?', [req.params.id]);
                
                res.json({ success: true, message: 'conquista deletado com sucesso' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// POST - Atribuir conquista customizável a usuário
router.post('/user/:userId/add', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const { customRankId } = req.body;
        const targetUserId = Number(req.params.userId);
        const actorUserId = Number(req.user?.id);
        const normalizedCustomRankId = Number(customRankId);

        if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
            return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
        }

        const rankRow = await dbGetAsync(
            'SELECT id, name, rankGroup, isVisible FROM custom_ranks WHERE id = ? LIMIT 1',
            [normalizedCustomRankId]
        );
        if (!rankRow) {
            return res.status(404).json({ success: false, message: 'conquista não encontrado' });
        }

        const hierarchyCheck = await canAssignOrRemoveRole(actorUserId, targetUserId, normalizedCustomRankId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        db.run(
            'INSERT INTO user_custom_ranks (userId, customRankId) VALUES (?, ?)',
            [targetUserId, normalizedCustomRankId],
            async function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ success: false, message: 'Usuário já possui este conquista' });
                    }
                    return res.status(500).json({ success: false, message: 'Erro ao atribuir conquista' });
                }

                try {
                    await removeRankIdFromUserSelectedRanks(targetUserId, normalizedCustomRankId);
                } catch (cleanupError) {
                    console.error('Erro ao limpar selectedRanks após atribuir conquista customizável:', cleanupError);
                }

                try {
                    const canNotify = await canSendAchievementNotification(targetUserId);
                    if (canNotify) {
                        await AchievementNotification.createNotification(targetUserId, String(rankRow.name || ''), {
                            message: `Você recebeu a conquista "${rankRow.name}".`,
                            awardedByUserId: Number.isInteger(actorUserId) ? actorUserId : null,
                            relatedDownloadId: null
                        });
                    }
                } catch (notificationError) {
                    console.error('Erro ao criar notificação de conquista customizável:', notificationError);
                }

                // Garantir que a conquista atribuída apareça no perfil do usuário automaticamente
                try {
                    const userRow = await dbGetAsync('SELECT selectedRanks FROM users WHERE id = ?', [targetUserId]);
                    let selectedRanks = [];
                    if (userRow?.selectedRanks) {
                        try { selectedRanks = JSON.parse(userRow.selectedRanks) || []; } catch { selectedRanks = []; }
                    }
                    // Normalizar para números e strings ok
                    const exists = selectedRanks.some(v => Number(v) === Number(normalizedCustomRankId));
                    if (!exists) {
                        // Inserir no final, respeitando tamanho maximo (frontend permite até 4)
                        selectedRanks.push(Number(normalizedCustomRankId));
                        if (selectedRanks.length > 4) selectedRanks = selectedRanks.slice(-4);
                        await dbRunAsync('UPDATE users SET selectedRanks = ? WHERE id = ?', [JSON.stringify(selectedRanks), targetUserId]);
                    }
                } catch (e) {
                    console.error('[RANKS] Erro ao atualizar selectedRanks automaticamente após atribuição:', e);
                }

                res.json({ success: true, message: 'conquista atribuído com sucesso' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// POST - Atribuir conquista padrão (DEFAULT_RANKS) a usuário
router.post('/user/:userId/add-default', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const { defaultKey } = req.body; // expected format: id or name
        const targetUserId = Number(req.params.userId);
        const actorUserId = Number(req.user?.id);

        if (!defaultKey) return res.status(400).json({ success: false, message: 'defaultKey é obrigatório' });
        if (!Number.isInteger(targetUserId) || targetUserId <= 0) return res.status(400).json({ success: false, message: 'ID de usuário inválido' });

        // localizar default rank por nome (case-insensitive) ou por índice/id
        const keyStr = String(defaultKey || '').trim();
        let defaultRank = DEFAULT_RANKS.find(r => normalizeRankNameKey(r.name) === normalizeRankNameKey(keyStr));
        if (!defaultRank && /^\d+$/.test(keyStr)) {
            const idx = Number(keyStr);
            if (idx >= 0 && idx < DEFAULT_RANKS.length) defaultRank = DEFAULT_RANKS[idx];
        }
        if (!defaultRank) {
            // tentar match por key sem acentos
            defaultRank = DEFAULT_RANKS.find(r => normalizeRankNameKey(r.name).includes(normalizeRankNameKey(keyStr)));
        }
        if (!defaultRank) return res.status(404).json({ success: false, message: 'Conquista padrão não encontrada' });

        // Verificar se já existe um custom_rank correspondente (isDefault = 1)
        const existing = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM custom_ranks WHERE lower(name) = lower(?) AND isDefault = 1 LIMIT 1', [defaultRank.name], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });

        let customRankId = null;
        if (existing) {
            customRankId = Number(existing.id);
            if (!existing.rankGroup || String(existing.rankGroup || '').trim() === '') {
                await new Promise((resolve, reject) => {
                    db.run('UPDATE custom_ranks SET rankGroup = ? WHERE id = ?', ['progression', customRankId], function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }
        } else {
            // criar entrada em custom_ranks com rankGroup = progression e isDefault = 1
            const insertResult = await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO custom_ranks (name, color, icon, description, rankGroup, customText, backgroundImage, enableAdminPanel, isVisible, canManageDownloads, canOrderAllRanks, canUseAnimatedProfile, canChangeOwnColor, isDefault) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    [
                        defaultRank.name,
                        defaultRank.color || '#999',
                        String(defaultRank.icon || '').substring(0, 3).toUpperCase(),
                        defaultRank.description || '',
                        'progression',
                        defaultRank.customText || '',
                        null,
                        0,
                        1,
                        0,
                        0,
                        0,
                        0
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });
            customRankId = Number(insertResult);
        }

        // Hierarquia/permissões
        const hierarchyCheck = await canAssignOrRemoveRole(actorUserId, targetUserId, customRankId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        // Inserir associação user_custom_ranks
        await new Promise((resolve, reject) => {
            db.run('INSERT INTO user_custom_ranks (userId, customRankId) VALUES (?, ?)', [targetUserId, customRankId], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        try {
            await removeRankIdFromUserSelectedRanks(targetUserId, customRankId);
        } catch (cleanupError) {
            console.error('Erro ao limpar selectedRanks após atribuir conquista padrão:', cleanupError);
        }

            // Garantir que a conquista atribuída apareça no perfil do usuário automaticamente
            try {
                const userRow = await dbGetAsync('SELECT selectedRanks FROM users WHERE id = ?', [targetUserId]);
                let selectedRanks = [];
                if (userRow?.selectedRanks) {
                    try { selectedRanks = JSON.parse(userRow.selectedRanks) || []; } catch { selectedRanks = []; }
                }
                const exists = selectedRanks.some(v => Number(v) === Number(customRankId));
                if (!exists) {
                    selectedRanks.push(Number(customRankId));
                    if (selectedRanks.length > 4) selectedRanks = selectedRanks.slice(-4);
                    await dbRunAsync('UPDATE users SET selectedRanks = ? WHERE id = ?', [JSON.stringify(selectedRanks), targetUserId]);
                }
            } catch (e) {
                console.error('[RANKS] Erro ao atualizar selectedRanks automaticamente após atribuição (default):', e);
            }

            res.json({ success: true, message: 'conquista padrão atribuído com sucesso' });
    } catch (error) {
        console.error('[RANKS] Error in add-default:', error);
        res.status(500).json({ success: false, message: 'Erro ao atribuir conquista padrão' });
    }
});

// DELETE - Remover conquista customizável de usuário
router.delete('/user/:userId/remove/:customRankId', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const targetUserId = Number(req.params.userId);
        const customRankId = Number(req.params.customRankId);
        const actorUserId = Number(req.user?.id);

        console.log(`[RANKS] ====== DELETE RANK START ======`);
        console.log(`[RANKS] Removing rank ${customRankId} from user ${targetUserId}`);

        const isPanelAdmin = req.isAdmin === true || Boolean(req.adminRank);
        if (!isPanelAdmin) {
            const hierarchyCheck = await canAssignOrRemoveRole(actorUserId, targetUserId, customRankId);
            if (!hierarchyCheck.allowed) {
                return res.status(403).json({ success: false, message: hierarchyCheck.message });
            }
        }

        // Get user's current state BEFORE deletion
        const userBefore = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id, manualRank, manualRankColor FROM users WHERE id = ?',
                [targetUserId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        console.log(`[RANKS] User before deletion:`, userBefore);

        // Delete the user_custom_ranks association
        await new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM user_custom_ranks WHERE userId = ? AND customRankId = ?',
                [targetUserId, customRankId],
                function(err) {
                    if (err) {
                        console.error(`[RANKS] Error deleting from user_custom_ranks:`, err);
                        reject(err);
                    } else {
                        console.log(`[RANKS] Deleted ${this.changes} row(s) from user_custom_ranks`);
                        resolve(this);
                    }
                }
            );
        });

        // STEP 1: Remove the rank ID from selectedRanks array
        console.log(`[RANKS] Cleaning selectedRanks...`);
        await new Promise((resolve, reject) => {
            db.get(
                'SELECT selectedRanks FROM users WHERE id = ?',
                [targetUserId],
                (err, row) => {
                    if (err) {
                        console.error(`[RANKS] Error reading selectedRanks:`, err);
                        reject(err);
                        return;
                    }
                    
                    let selectedRanks = [];
                    if (row?.selectedRanks) {
                        try {
                            selectedRanks = JSON.parse(row.selectedRanks);
                            if (!Array.isArray(selectedRanks)) selectedRanks = [];
                        } catch {
                            selectedRanks = [];
                        }
                    }
                    
                    // Remove the customRankId from selectedRanks
                    const beforeLength = selectedRanks.length;
                    selectedRanks = selectedRanks.filter(id => Number(id) !== customRankId);
                    const afterLength = selectedRanks.length;
                    
                    if (beforeLength !== afterLength) {
                        console.log(`[RANKS] ✓ Removed rank ${customRankId} from selectedRanks (was ${beforeLength}, now ${afterLength})`);
                        
                        // Update selectedRanks
                        db.run(
                            'UPDATE users SET selectedRanks = ? WHERE id = ?',
                            [JSON.stringify(selectedRanks), targetUserId],
                            function(err) {
                                if (err) {
                                    console.error(`[RANKS] Error updating selectedRanks:`, err);
                                    reject(err);
                                } else {
                                    console.log(`[RANKS] ✓ Updated selectedRanks. Rows updated: ${this.changes}`);
                                    resolve();
                                }
                            }
                        );
                    } else {
                        console.log(`[RANKS] Rank ${customRankId} was not in selectedRanks`);
                        resolve();
                    }
                }
            );
        });

        // STEP 2: AGGRESSIVE APPROACH: Force clear manualRank if it no longer exists in user_custom_ranks
        if (userBefore?.manualRank) {
            console.log(`[RANKS] User has manualRank: "${userBefore.manualRank}"`);
            
            // Count existing user_custom_ranks for this user
            const customRankCount = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT COUNT(*) AS count FROM user_custom_ranks WHERE userId = ?`,
                    [targetUserId],
                    (err, row) => {
                        if (err) {
                            console.error(`[RANKS] Error counting custom ranks:`, err);
                            reject(err);
                        } else {
                            const count = Number(row?.count || 0);
                            console.log(`[RANKS] User ${targetUserId} now has ${count} custom ranks`);
                            resolve(count);
                        }
                    }
                );
            });

            // If no custom ranks exist, clear manualRank
            if (customRankCount === 0) {
                console.log(`[RANKS] ⚠️  User has NO custom ranks left! Force clearing manualRank.`);
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE users SET manualRank = NULL, manualRankColor = NULL WHERE id = ?',
                        [targetUserId],
                        function(err) {
                            if (err) {
                                console.error(`[RANKS] Error clearing manualRank:`, err);
                                reject(err);
                            } else {
                                console.log(`[RANKS] ✓ Force cleared manualRank. Rows updated: ${this.changes}`);
                                
                                // Final verification
                                db.get(
                                    'SELECT manualRank FROM users WHERE id = ?',
                                    [targetUserId],
                                    (verifyErr, verifyRow) => {
                                        console.log(`[RANKS] ✓ Final verification - manualRank is now: "${verifyRow?.manualRank}" (should be null/empty)`);
                                    }
                                );
                                
                                resolve(this);
                            }
                        }
                    );
                });
            } else {
                console.log(`[RANKS] User still has ${customRankCount} custom rank(s), not clearing manualRank`);
            }
        }

        console.log(`[RANKS] ====== DELETE RANK END ======`);
        res.json({ success: true, message: 'conquista removido com sucesso' });
    } catch (error) {
        console.error('[RANKS] FATAL ERROR removing user rank:', error);
        res.status(500).json({ success: false, message: 'Erro ao remover conquista' });
    }
});

// GET - Listar conquistas de um usuário
router.get('/user/:userId', (req, res) => {
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
            cr.isSpecial,
            cr.createdAt
         FROM custom_ranks cr
         JOIN user_custom_ranks ucr ON cr.id = ucr.customRankId
         WHERE ucr.userId = ?
         ORDER BY ucr.assignedAt ASC`,
        [req.params.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Erro ao buscar conquistas' });
            }
            res.json({ success: true, ranks: (rows || []).map((row) => ({ ...row, isRemovable: true })) });
        }
    );
});

router.post('/user/:userId/hide-fixed-rank', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const { fixedRankId } = req.body;
        const targetUserId = Number(req.params.userId);
        if (!targetUserId || !fixedRankId || typeof fixedRankId !== 'string') {
            return res.status(400).json({ success: false, message: 'fixedRankId é obrigatório' });
        }

        const normalized = String(fixedRankId || '').trim();
        const isValidFixedRankId = /^(?:fixed:(?:auto|manual)|fixed-(?:auto|manual)(?:-[a-z0-9\-]+)?)$/i.test(normalized);
        if (!isValidFixedRankId) {
            return res.status(400).json({ success: false, message: 'fixedRankId inválido' });
        }

        const userRow = await new Promise((resolve, reject) => {
            db.get('SELECT hiddenProgressionRanks FROM users WHERE id = ?', [targetUserId], (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
        if (!userRow) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hiddenIds = parseHiddenFixedRankIds(userRow.hiddenProgressionRanks);
        if (!hiddenIds.includes(normalized)) {
            hiddenIds.push(normalized);
        }

        await new Promise((resolve, reject) => {
            db.run('UPDATE users SET hiddenProgressionRanks = ? WHERE id = ?', [JSON.stringify(hiddenIds), targetUserId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Rank fixo ocultado com sucesso' });
    } catch (error) {
        console.error('[RANKS] Error hiding fixed rank:', error);
        res.status(500).json({ success: false, message: 'Erro ao ocultar rank fixo' });
    }
});

// GET - Listar todas as conquistas de um usuário (inclui progresso automático e rank manual atual)
router.get('/user/:userId/full', protect, isAdminOrHasAdminRank, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    try {
        const customRanks = await dbAllAsync(
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
                cr.isSpecial,
                cr.isSpecial,
                cr.createdAt
             FROM custom_ranks cr
             JOIN user_custom_ranks ucr ON cr.id = ucr.customRankId
             WHERE ucr.userId = ?
             ORDER BY ucr.assignedAt ASC`,
            [userId]
        );

        const normalizedNames = new Set(
            (customRanks || []).map((row) => normalizeRankNameKey(row.name))
        );

        let rankComplete = null;
        try {
            rankComplete = await Rank.getUserRankComplete(userId);
        } catch (error) {
            console.error('[RANKS] Error fetching user rank complete for full ranks:', error);
            rankComplete = null;
        }

        const extraRanks = [];
        const userRow = await dbGetAsync('SELECT hiddenProgressionRanks FROM users WHERE id = ?', [userId]);
        if (!userRow) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hiddenRankIds = parseHiddenFixedRankIds(userRow.hiddenProgressionRanks);

        if (rankComplete?.custom?.name) {
            const normalizedCustomName = normalizeRankNameKey(rankComplete.custom.name);
            if (!normalizedNames.has(normalizedCustomName)) {
                const manualRank = buildFixedRankObject({
                    ...rankComplete.custom,
                    isVisible: 0
                }, 'manual');
                extraRanks.push(manualRank);
                normalizedNames.add(normalizedCustomName);
            }
        }

        const progressionAuto = rankComplete?.automatic || null;
        const progressionCompleted = rankComplete?.automaticCompleted || null;
        let progressionRank = null;

        const buildFixedAutoRank = (rank) => {
            if (!rank || typeof rank.name !== 'string' || rank.name.trim() === '') return null;
            return {
                id: FIXED_AUTO_RANK_KEY,
                ...rank,
                description: rank.description || 'Conquista automático atual',
                customText: '',
                backgroundImage: null,
                isVisible: 0,
                rankGroup: 'fixed_automatic',
                isFixed: true
            };
        };

        const isHiddenAutoRank = (rank) => {
            if (!rank || typeof rank.name !== 'string' || !rank.name.trim()) return false;
            const hiddenId = `fixed-auto-${normalizeRankNameKey(rank.name).replace(/\s+/g, '-')}`;
            return hiddenRankIds.includes(hiddenId);
        };

        if (progressionAuto && !isHiddenAutoRank(progressionAuto)) {
            progressionRank = buildFixedAutoRank(progressionAuto);
        } else if (progressionCompleted && !isHiddenAutoRank(progressionCompleted)) {
            progressionRank = buildFixedAutoRank(progressionCompleted);
        } else {
            progressionRank = await getHighestOwnedProgressionRank(userId, null);
        }

        if (progressionRank && normalizeRankNameKey(progressionRank.name) !== '' && !normalizedNames.has(normalizeRankNameKey(progressionRank.name))) {
            const autoRank = buildFixedRankObject(progressionRank, 'auto');
            if (!hiddenRankIds.includes(autoRank.id)) {
                extraRanks.push(autoRank);
            }
        }

        const ranks = [
            ...(customRanks || []).map((rank) => ({ ...rank, isRemovable: true })),
            ...extraRanks
        ];

        res.json({ success: true, ranks });
    } catch (error) {
        console.error('[RANKS] Error fetching full user ranks:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar conquistas do usuário' });
    }
});

// POST - Sincronizar conquistas de postagens
router.post('/sync/post-achievements', protect, (req, res) => {
    // Sincronizar conquistas de postagens para o usuário
    // Este endpoint basicamente retorna sucesso - a sincronização real ocorre no backend
    res.json({ success: true, message: 'Conquistas de postagens sincronizadas' });
});

// POST - Sincronizar conquistas de likes
router.post('/sync/like-achievements', protect, (req, res) => {
    // Sincronizar conquistas de likes para o usuário
    // Este endpoint basicamente retorna sucesso - a sincronização real ocorre no backend
    res.json({ success: true, message: 'Conquistas de likes sincronizadas' });
});

export default router;



