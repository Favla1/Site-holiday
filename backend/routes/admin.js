import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../config/database.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { protect, isAdminOrHasAdminRank } from '../middleware/auth.js';
import { writeAdminAuditLog } from '../utils/audit-log.js';
import AchievementNotification from '../models/AchievementNotification.js';
import Notification from '../models/Notification.js';
import { sendEmail } from '../utils/mailer.js';
import { buildNoticeEmail } from '../utils/transactional-email.js';
import {
    ADMIN_PANEL_TAB_COLUMNS,
    ADMIN_TAB_ACCESS_COLUMNS,
    getAdminTabAccess,
    getAdminTabAccessRow,
    getDirectAdminTabAccess,
    getFullAdminTabAccess
} from '../utils/admin-tab-access.js';
import {
    canAssignOrRemoveRole,
    canManageTargetUser,
    getUserHighestStaffRole,
    isOwnerEmail,
    listStaffHierarchyRanks
} from '../utils/staff-hierarchy.js';

const router = express.Router();
const OWNER_EMAIL = 'sustmanrft@hotmail.com';
const FALLBACK_FRONTEND_URL = 'https://guildaholiday.discloud.dev';
const DEFAULT_WHATSAPP_URL = 'https://chat.whatsapp.com/EDqaY8udJmFCTVCTex3b5p';
const DEFAULT_DISCORD_URL = 'https://discord.gg/KEc4ZdR3';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PASSWORD_CONSONANTS = 'bcdfghjkmnpqrstvwxyz';
const PASSWORD_VOWELS = 'aeiou';
const MAX_ACHIEVEMENT_BACKGROUND_BYTES = 20 * 1024 * 1024; // 20MB
const ACHIEVEMENT_BACKGROUND_UPLOAD_DIR = path.join(__dirname, '../../uploads/achievement-backgrounds');
const MAX_EVENT_ATTACHMENT_BYTES = 200 * 1024 * 1024; // 200MB por arquivo
const EVENT_ATTACHMENT_UPLOAD_DIR = path.join(__dirname, '../../uploads/event-attachments');
const MAX_ADMIN_TICKET_ATTACHMENT_BYTES = 500 * 1024 * 1024; // 500MB
const ADMIN_TICKET_UPLOAD_DIR = path.join(__dirname, '../../uploads/admin-ticket-files');
const ALLOWED_ACHIEVEMENT_BACKGROUND_MIME = new Set([
    'image/gif',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
]);
const ALLOWED_ADMIN_TICKET_ATTACHMENT_EXT = new Set([
    '.gif', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg',
    '.pdf', '.txt', '.zip', '.rar', '.7z', '.apk', '.iso', '.exe', '.msi',
    '.mp3', '.mp4', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.json'
]);
const ALLOWED_ACHIEVEMENT_BACKGROUND_EXT = new Set([
    '.gif',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp'
]);
const ALLOWED_EVENT_ATTACHMENT_EXT = new Set([
    '.gif', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg',
    '.pdf', '.txt', '.zip', '.rar', '.7z', '.apk', '.iso', '.exe', '.msi',
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4', '.mov', '.avi', '.mkv', '.webm',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.json'
]);
const ALLOWED_ACHIEVEMENT_TARGET_GROUPS = new Set([
    'like_achievement',
    'post_achievement'
]);
const ALLOWED_ACHIEVEMENT_CARD_ANIMATION_GROUPS = new Set([
    'like_achievement',
    'post_achievement',
    'general'
]);
const ALLOWED_ACHIEVEMENT_CARD_ANIMATION_MODES = new Set([
    'hover',
    'always'
]);
const ACHIEVEMENT_BACKGROUND_SETTING_KEYS = Object.freeze({
    like_achievement: 'achievement_bg_like',
    post_achievement: 'achievement_bg_post',
    animation_modes: 'achievement_card_animation_modes'
});
function normalizeAchievementNameKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

const FOUNDER_ACHIEVEMENT_NAME_KEY = normalizeAchievementNameKey('Fundador');
const MANUAL_RANK_OVERRIDES_SETTING_KEY = 'manual_rank_overrides';

function normalizeHierarchyRankGroup(value) {
    return String(value || '').trim().toLowerCase();
}

function isSystemHierarchyProtectedRank(rank = {}) {
    const rankGroup = normalizeHierarchyRankGroup(rank?.rankGroup);
    const icon = String(rank?.icon || '').trim().toUpperCase();

    if (rankGroup === 'like_achievement' || rankGroup === 'post_achievement') {
        return true;
    }

    if (
        rankGroup === 'fixed_automatic' ||
        rankGroup === 'progression_achievement' ||
        rankGroup.includes('progress')
    ) {
        return true;
    }

    if (/^L\d+/.test(icon) || /^P\d+/.test(icon) || /^T\d+/.test(icon)) {
        return true;
    }

    return false;
}

function isFounderAchievementKey(rankNameKey) {
    const key = String(rankNameKey || '').trim().toLowerCase();
    return key === FOUNDER_ACHIEVEMENT_NAME_KEY || key.includes(FOUNDER_ACHIEVEMENT_NAME_KEY);
}

function safeJsonParse(value) {
    if (!value) return null;
    try {
        return JSON.parse(String(value));
    } catch {
        return null;
    }
}

function extractEmailChangeRequest(message = '') {
    const text = String(message || '');
    const match = text.match(/Novo e-mail solicitado:\s*([^\n]+)/i);
    return match ? match[1].trim() : '';
}

function sanitizeManualRankOverridePayload(payload = {}) {
    const name = String(payload?.name ?? '').trim();
    const description = String(payload?.description ?? '').trim();
    const customText = String(payload?.customText ?? '').trim();
    const rawColor = payload?.color === undefined ? '' : String(payload.color).trim();
    const rawBackgroundImage = payload?.backgroundImage === undefined
        ? undefined
        : String(payload.backgroundImage || '').trim();
    return {
        name: name.slice(0, 60),
        description: description.slice(0, 240),
        customText: customText.slice(0, 120),
        color: /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor.toUpperCase() : '',
        backgroundImage: rawBackgroundImage === undefined
            ? undefined
            : normalizeAchievementBackgroundUrl(rawBackgroundImage)
    };
}

const achievementBackgroundStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(ACHIEVEMENT_BACKGROUND_UPLOAD_DIR, { recursive: true });
        cb(null, ACHIEVEMENT_BACKGROUND_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase() || '.gif';
        cb(null, `achievement-bg-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});

const uploadAchievementBackground = multer({
    storage: achievementBackgroundStorage,
    limits: { fileSize: MAX_ACHIEVEMENT_BACKGROUND_BYTES },
    fileFilter: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase();
        const mime = String(file.mimetype || '').toLowerCase();
        const byExt = ALLOWED_ACHIEVEMENT_BACKGROUND_EXT.has(ext);
        const byMime = ALLOWED_ACHIEVEMENT_BACKGROUND_MIME.has(mime);
        const mimeUnknown = !mime || mime === 'application/octet-stream';
        const allowed = byExt && (byMime || mimeUnknown);
        if (allowed) return cb(null, true);
        cb(new Error('Imagem de fundo aceita apenas GIF, PNG, JPG ou WEBP.'));
    }
});

const eventFileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = file.fieldname === 'background' ? ACHIEVEMENT_BACKGROUND_UPLOAD_DIR : EVENT_ATTACHMENT_UPLOAD_DIR;
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase() || '.bin';
        const prefix = file.fieldname === 'background' ? 'achievement-bg' : 'event-file';
        cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});

const uploadEventFiles = multer({
    storage: eventFileStorage,
    limits: { fileSize: MAX_EVENT_ATTACHMENT_BYTES },
    fileFilter: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase();
        if (file.fieldname === 'background') {
            const mime = String(file.mimetype || '').toLowerCase();
            const byExt = ALLOWED_ACHIEVEMENT_BACKGROUND_EXT.has(ext);
            const byMime = ALLOWED_ACHIEVEMENT_BACKGROUND_MIME.has(mime);
            const mimeUnknown = !mime || mime === 'application/octet-stream';
            const allowed = byExt && (byMime || mimeUnknown);
            if (allowed) return cb(null, true);
            return cb(new Error('Imagem de fundo aceita apenas GIF, PNG, JPG ou WEBP.'));
        }
        if (file.fieldname === 'attachments') {
            if (ALLOWED_EVENT_ATTACHMENT_EXT.has(ext)) return cb(null, true);
            return cb(new Error('Tipo de arquivo não permitido para anexos de eventos.'));
        }
        cb(new Error('Campo de arquivo inválido.'));
    }
});

const adminTicketAttachmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(ADMIN_TICKET_UPLOAD_DIR, { recursive: true });
        cb(null, ADMIN_TICKET_UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase() || '.bin';
        cb(null, `admin-ticket-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
});

const uploadAdminTicketAttachment = multer({
    storage: adminTicketAttachmentStorage,
    limits: { 
        fileSize: MAX_ADMIN_TICKET_ATTACHMENT_BYTES,
        fieldSize: 50 * 1024 * 1024  // 50MB limit for form fields (support large base64 images)
    },
    fileFilter: (req, file, cb) => {
        const ext = String(path.extname(file.originalname || '')).toLowerCase();
        if (ALLOWED_ADMIN_TICKET_ATTACHMENT_EXT.has(ext)) return cb(null, true);
        cb(new Error('Anexo de ticket inválido. Envie imagem, GIF ou arquivo permitido.'));
    }
});

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function maskEmail(value) {
    const raw = String(value || '').trim();
    const atIndex = raw.indexOf('@');
    if (atIndex <= 0 || atIndex >= raw.length - 1) return '***';

    const local = raw.slice(0, atIndex);
    const domain = raw.slice(atIndex + 1);
    const domainParts = domain.split('.');
    const mainDomain = domainParts[0] || '';
    const tld = domainParts.slice(1).join('.') || '';

    const localStart = local.slice(0, 2);
    const localEnd = local.length > 2 ? local.slice(-1) : '';
    const maskedLocal = `${localStart}${'*'.repeat(Math.max(2, local.length - 3))}${localEnd}`;

    const maskedDomain = mainDomain.length > 2
        ? `${mainDomain[0]}${'*'.repeat(mainDomain.length - 2)}${mainDomain.slice(-1)}`
        : `${mainDomain[0] || '*'}*`;

    return `${maskedLocal}@${maskedDomain}${tld ? '.' + tld : ''}`;
}

function toFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

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

function normalizeAchievementBackgroundUrl(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return '';
    if (value.length > 2048) return '';
    return value;
}

function normalizeAchievementCardAnimationMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    return ALLOWED_ACHIEVEMENT_CARD_ANIMATION_MODES.has(mode) ? mode : '';
}

function buildAchievementCardAnimationModeKey(groupKey, rankNameKey) {
    const group = String(groupKey || '').trim();
    const nameKey = normalizeAchievementNameKey(rankNameKey);
    if (!ALLOWED_ACHIEVEMENT_CARD_ANIMATION_GROUPS.has(group) || !nameKey) return '';
    return `${group}:${nameKey}`;
}

function mapAchievementBackgroundRows(rows = []) {
    const settings = Object.fromEntries((rows || []).map((row) => [row.settingKey, row.settingValue]));
    const rawAnimationModes = String(settings[ACHIEVEMENT_BACKGROUND_SETTING_KEYS.animation_modes] || '').trim();
    let animationModes = {};

    if (rawAnimationModes) {
        try {
            const parsed = JSON.parse(rawAnimationModes);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                animationModes = Object.entries(parsed).reduce((acc, [rawKey, rawValue]) => {
                    const keyParts = String(rawKey || '').trim().toLowerCase().split(':');
                    const groupKey = keyParts.shift() || '';
                    const rankNameKey = normalizeAchievementNameKey(keyParts.join(':'));
                    const storageKey = buildAchievementCardAnimationModeKey(groupKey, rankNameKey);
                    const mode = normalizeAchievementCardAnimationMode(rawValue);
                    if (!storageKey || !mode || mode === 'hover') return acc;
                    acc[storageKey] = mode;
                    return acc;
                }, {});
            }
        } catch (error) {
            animationModes = {};
        }
    }

    return {
        like_achievement: String(settings[ACHIEVEMENT_BACKGROUND_SETTING_KEYS.like_achievement] || '').trim(),
        post_achievement: String(settings[ACHIEVEMENT_BACKGROUND_SETTING_KEYS.post_achievement] || '').trim(),
        animationModes
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

async function canSendTeamEmail(userId) {
    const row = await dbGetAsync(
        `SELECT disableTeamEmailNotifications FROM users WHERE id = ?`,
        [userId]
    );
    if (!row) return true;
    return Number(row.disableTeamEmailNotifications) !== 1;
}

async function notifyManualAchievement({ targetUserId, rankName, awardedByUserId }) {
    const userId = Number(targetUserId);
    const rank = String(rankName || '').trim();
    if (!Number.isInteger(userId) || userId <= 0 || !rank) return;

    const canNotify = await canSendAchievementNotification(userId);
    if (!canNotify) return;

    await AchievementNotification.createNotification(userId, rank, {
        message: `Você recebeu a conquista "${rank}".`,
        awardedByUserId: Number.isInteger(Number(awardedByUserId)) ? Number(awardedByUserId) : null,
        relatedDownloadId: null
    });
}

function buildSocialLinks(settings = {}) {
    const parsedNavbarButtons = safeJsonParse(settings.navbar_buttons);
    return {
        whatsappUrl: settings.whatsapp_url || DEFAULT_WHATSAPP_URL,
        discordUrl: settings.discord_url || DEFAULT_DISCORD_URL,
        whatsappTooltip: settings.whatsapp_tooltip != null ? settings.whatsapp_tooltip : 'WhatsApp',
        discordTooltip: settings.discord_tooltip != null ? settings.discord_tooltip : 'Discord',
        whatsappEnabled: settings.whatsapp_enabled !== '0',
        discordEnabled: settings.discord_enabled !== '0',
        navbarButtons: Array.isArray(parsedNavbarButtons)
            ? parsedNavbarButtons.map((button) => {
                const position = typeof button.position === 'string' ? String(button.position).trim() : '';
                return {
                    ...button,
                    position: position || 'beforeLogin'
                };
            })
            : []
    };
}

function ensureSocialLinksDefaults(callback) {
    const defaultEntries = [
        ['whatsapp_url', DEFAULT_WHATSAPP_URL],
        ['discord_url', DEFAULT_DISCORD_URL],
        ['whatsapp_tooltip', 'WhatsApp'],
        ['discord_tooltip', 'Discord'],
        ['whatsapp_enabled', '1'],
        ['discord_enabled', '1'],
        ['navbar_buttons', '[]']
    ];

    let remaining = defaultEntries.length;
    defaultEntries.forEach(([key, value]) => {
        db.run(`
            INSERT OR IGNORE INTO site_settings (settingKey, settingValue, updatedAt)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [key, value], (err) => {
            if (err) {
                console.error('[ADMIN] Erro ao garantir valores padrão de links sociais:', key, err);
            }
            remaining -= 1;
            if (remaining === 0 && typeof callback === 'function') {
                callback();
            }
        });
    });
}

function normalizeCommunityUrl(rawValue, fallback) {
    const value = String(rawValue || '').trim();
    if (!value) return fallback;

    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed.toString();
    } catch (error) {
        return null;
    }
}

function getRequestIp(req) {
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwardedFor) return forwardedFor;
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

function normalizeAdminTicketTitle(value) {
    return String(value || '').trim().slice(0, 120);
}

function normalizeAdminTicketMessage(value) {
    return String(value || '').trim().slice(0, 3000);
}

function normalizeAdminEmailSubject(value) {
    return String(value || '').trim().slice(0, 220);
}

function normalizeAdminEmailBody(value) {
    // Support large messages with embedded base64 images (up to 2MB)
    return String(value || '').trim().slice(0, 2097152);
}

function normalizeBooleanInput(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'sim', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

function normalizeAdminEmailMediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return parsed.toString();
    } catch {
        return '';
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================
// Rotas de eventos manuais (admin)
// =====================

router.get('/events', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const rows = await dbAllAsync(`SELECT * FROM custom_ranks WHERE isSpecial = 1 AND COALESCE(generatedFromTemplate, 0) = 0 ORDER BY createdAt DESC`);
        const events = (rows || []).map((row) => ({
            ...row,
            eventAttachments: safeJsonParse(row.eventAttachments) || [],
            generatedFromTemplate: row.generatedFromTemplate === 1 || row.generatedFromTemplate === true ? 1 : 0
        }));
        res.json({ success: true, events });
    } catch (error) {
        console.error('[ADMIN EVENTS] listar', error);
        res.status(500).json({ success: false, message: 'Erro ao listar eventos' });
    }
});

router.patch('/events/:id', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const eventId = Number(req.params?.id || 0);
        const action = String(req.body?.action || '').trim().toLowerCase();

        if (!Number.isInteger(eventId) || eventId <= 0) {
            return res.status(400).json({ success: false, message: 'Evento inválido' });
        }

        if (action === 'cancel') {
            await dbRunAsync('UPDATE custom_ranks SET isSpecial = 0, eventEndDate = COALESCE(eventEndDate, CURRENT_TIMESTAMP) WHERE id = ?', [eventId]);
            await writeAdminAuditLog(req.user.id, `Cancelou evento manual: #${eventId}`);
            return res.json({ success: true });
        }

        if (action === 'finish') {
            await dbRunAsync('UPDATE custom_ranks SET eventEndDate = CURRENT_TIMESTAMP WHERE id = ?', [eventId]);
            await writeAdminAuditLog(req.user.id, `Encerrando evento manual: #${eventId}`);
            return res.json({ success: true });
        }

        return res.status(400).json({ success: false, message: 'Ação inválida' });
    } catch (error) {
        console.error('[ADMIN EVENTS] atualizar status', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar evento' });
    }
});

router.post('/events', protect, isAdminOrHasAdminRank, uploadEventFiles.fields([{ name: 'background', maxCount: 1 }, { name: 'attachments', maxCount: 20 }]), async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim().slice(0, 120);
        if (!name) return res.status(400).json({ success: false, message: 'Nome é obrigatório' });

        const color = String(req.body?.color || '#333').slice(0, 32);
        const icon = String(req.body?.icon || 'star').slice(0, 64);
        const description = String(req.body?.description || '').slice(0, 1024);
        const isSpecial = toFlag(req.body?.isSpecial ?? true);
        const eventStartDate = req.body?.eventStartDate || null;
        const eventEndDate = req.body?.eventEndDate || null;
        const autoAwardOnLogin = toFlag(req.body?.autoAwardOnLogin || false);
        const eventCategory = String(req.body?.eventCategory || '').slice(0, 64) || null;

        const backgroundPath = req.files?.background?.[0] ? `/uploads/achievement-backgrounds/${req.files.background[0].filename}` : null;
        const attachments = Array.isArray(req.files?.attachments) ? req.files.attachments.map((file) => `/uploads/event-attachments/${file.filename}`) : [];
        const attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;

        const stmt = await dbRunAsync(
            `INSERT INTO custom_ranks (name, color, icon, description, backgroundImage, isSpecial, eventStartDate, eventEndDate, autoAwardOnLogin, eventCategory, eventAttachments, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [name, color, icon, description, backgroundPath, isSpecial ? 1 : 0, eventStartDate, eventEndDate, autoAwardOnLogin ? 1 : 0, eventCategory, attachmentsJson]
        );

        const created = await dbGetAsync('SELECT * FROM custom_ranks WHERE id = ?', [stmt.lastID]);
        await writeAdminAuditLog(req.user.id, `Criou evento manual: ${name}`);
        res.json({ success: true, event: created });
    } catch (error) {
        console.error('[ADMIN EVENTS] criar', error);
        res.status(500).json({ success: false, message: 'Erro ao criar evento manual' });
    }
});

const ALLOWED_ADMIN_EMAIL_MEDIA_TYPES = new Set(['image', 'gif', 'video']);

function buildAdminEmailHtml(message, mediaUrl, mediaType) {
    // Message is expected to be safe HTML produced by admin UI (rich text).
    // We intentionally do not HTML-escape here so formatting and links are preserved.
    const escapedMessage = String(message || '');
    let mediaMarkup = '';
    if (mediaUrl && ALLOWED_ADMIN_EMAIL_MEDIA_TYPES.has(mediaType)) {
        if (mediaType === 'video') {
            mediaMarkup = `<p><video controls style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;"><source src="${escapeHtml(mediaUrl)}"></video></p>`;
        } else {
            mediaMarkup = `<p><img src="${escapeHtml(mediaUrl)}" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;"></p>`;
        }
    }

    return `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;margin:0;padding:0;background:linear-gradient(135deg, #0a0015 0%, #1a0f2e 100%);">
    <div style="max-width:680px;margin:0 auto;padding:40px 20px;">
        <!-- Header com Branding -->
        <div style="background:linear-gradient(135deg, #6B46C1 0%, #EC4899 100%);border-radius:16px 16px 0 0;padding:40px 30px;text-align:center;box-shadow:0 20px 40px rgba(236,72,153,0.2);">
            <h1 style="margin:0;font-size:32px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:2px;">
                GUILD HOLIDAY
            </h1>
            <p style="margin:10px 0 0 0;font-size:14px;color:rgba(255,255,255,0.9);letter-spacing:1px;">
                Mensagem da equipe
            </p>
        </div>
        
        <!-- Conteúdo Principal -->
        <div style="background:#ffffff;padding:40px 30px;border-radius:0 0 16px 16px;box-shadow:0 20px 40px rgba(0,0,0,0.15);">
            <!-- Mensagem -->
            <div style="font-size:16px;line-height:1.8;color:#1a1a1a;margin-bottom:30px;">
                ${escapedMessage}
            </div>
            
            ${mediaMarkup}
            
            <!-- Rodapé -->
            <div style="margin-top:40px;padding-top:30px;border-top:2px solid #f0f0f0;">
                <p style="font-size:12px;color:#666;line-height:1.6;margin:0;">
                    <strong>GUILD HOLIDAY</strong><br>
                    Este email foi enviado pela nossa equipe.<br>
                    Se você não esperava essa mensagem ou tem dúvidas, entre em contato conosco.<br>
                    Você pode desativar essas mensagens em <a href="https://holidayguild.com/profile.html" style="color:#6B46C1;text-decoration:underline;">Configurações da conta</a>.
                </p>
            </div>
            
            <!-- Botão Social -->
            <div style="text-align:center;margin-top:30px;">
                <a href="https://holidayguild.com/login.html" style="display:inline-block;padding:12px 30px;background:linear-gradient(135deg, #6B46C1 0%, #EC4899 100%);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
                    Faça o login
                </a>
            </div>
        </div>
        
        <!-- Créditos -->
        <div style="text-align:center;margin-top:20px;font-size:11px;color:rgba(255,255,255,0.6);">
            © 2026 Equipe da HOLIDAY. Todos os direitos reservados.
        </div>
    </div>
</body>
</html>`;
}

function buildAdminEmailAttachments(req) {
    // Support single file (req.file) or multiple files (req.files array)
    const result = [];
    if (req?.file) {
        result.push({
            filename: String(req.file.originalname || 'attachment'),
            path: req.file.path,
            contentType: String(req.file.mimetype || 'application/octet-stream')
        });
        return result;
    }

    const files = req?.files || [];
    if (Array.isArray(files) && files.length) {
        files.forEach((f) => {
            if (!f) return;
            result.push({
                filename: String(f.originalname || 'attachment'),
                path: f.path,
                contentType: String(f.mimetype || 'application/octet-stream')
            });
        });
    }
    return result;
}

function normalizeAdminTicketRecipientGroup(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['all', 'post_achievement', 'like_achievement', 'general', 'specific_rank'].includes(normalized)) {
        return normalized;
    }
    return 'all';
}

function buildAdminTicketAttachmentPayload(file) {
    if (!file) return null;
    return {
        path: `/uploads/admin-ticket-files/${file.filename}`,
        originalName: String(file.originalname || '').trim() || 'anexo',
        mime: String(file.mimetype || '').trim().toLowerCase(),
        size: Number(file.size || 0)
    };
}

async function getAdminTicketTargetUsers(requesterId, recipientGroup = 'all', customRankId = null) {
    const normalizedGroup = normalizeAdminTicketRecipientGroup(recipientGroup);

    const normalizedEmailSelect = `lower(trim(u.email)) AS email`;
    const baseUserFields = `u.id, u.nickname, ${normalizedEmailSelect}`;
    const nonEmptyEmailClause = `TRIM(IFNULL(u.email, '')) <> '' AND instr(lower(trim(u.email)), '@') > 0`;

    if (normalizedGroup === 'all') {
        return dbAllAsync(
            `SELECT DISTINCT ${baseUserFields}
             FROM users u
             WHERE u.id != ? AND ${nonEmptyEmailClause}
             ORDER BY u.id ASC`,
            [requesterId]
        );
    }

    if (normalizedGroup === 'specific_rank') {
        const normalizedRankId = Number(customRankId);
        if (!Number.isInteger(normalizedRankId) || normalizedRankId <= 0) {
            throw new Error('Conquista específica inválida');
        }

        return dbAllAsync(
            `SELECT DISTINCT ${baseUserFields}
             FROM users u
             JOIN user_custom_ranks ucr ON u.id = ucr.userId
             WHERE u.id != ? AND ucr.customRankId = ? AND ${nonEmptyEmailClause}
             ORDER BY u.id ASC`,
            [requesterId, normalizedRankId]
        );
    }

    const groupCondition = normalizedGroup === 'general'
        ? `(COALESCE(NULLIF(TRIM(cr.rankGroup), ''), 'general') = 'general')`
        : `cr.rankGroup = ?`;
    const params = normalizedGroup === 'general'
        ? [requesterId]
        : [requesterId, normalizedGroup];

    return dbAllAsync(
        `SELECT DISTINCT ${baseUserFields}
         FROM users u
         JOIN user_custom_ranks ucr ON u.id = ucr.userId
         JOIN custom_ranks cr ON cr.id = ucr.customRankId
         WHERE u.id != ? AND ${groupCondition} AND ${nonEmptyEmailClause}
         ORDER BY u.id ASC`,
        params
    );
}

function resolveUploadsPathFromPublicPath(rawPath) {
    const value = String(rawPath || '').trim();
    if (!value.startsWith('/uploads/')) return '';
    const relativePath = value.replace(/^\/+/, '').split('/').join(path.sep);
    return path.join(__dirname, '../../', relativePath);
}

function safeDeleteUploadFile(publicPath) {
    const absolutePath = resolveUploadsPathFromPublicPath(publicPath);
    if (!absolutePath) return;
    try {
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
    } catch (error) {
        console.warn('[ADMIN] Não foi possível remover arquivo de upload:', absolutePath, error.message);
    }
}

function auditAdminAction(req, event, payload = {}) {
    writeAdminAuditLog({
        event,
        actorUserId: Number.isInteger(req?.user?.id) ? req.user.id : null,
        actorEmail: payload.actorEmail || null,
        targetUserId: Number.isInteger(payload.targetUserId) ? payload.targetUserId : null,
        targetEmail: payload.targetEmail || null,
        ip: getRequestIp(req),
        success: payload.success !== false,
        metadata: payload.metadata || {}
    }).catch((error) => {
        console.error('[ADMIN] Erro ao gravar log de auditoria:', error.message);
    });
}

async function ensureOwnerRequester(req, res) {
    const requester = await dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [req.user?.id]);
    if (!requester) {
        res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        return null;
    }

    if (!isOwnerEmail(requester.email)) {
        res.status(403).json({ success: false, message: 'Apenas o dono da conta pode acessar esta área de hierarquia' });
        return null;
    }

    return requester;
}

async function ensureAdminTabRequester(req, res, tabKey) {
    const column = ADMIN_TAB_ACCESS_COLUMNS[tabKey];
    if (!column) {
        res.status(500).json({ success: false, message: 'Permissão de aba inválida.' });
        return null;
    }

    const requester = await dbGetAsync(
        `SELECT id, email, ${column} AS tabAccess FROM users WHERE id = ?`,
        [req.user?.id]
    );
    if (!requester) {
        res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado.' });
        return null;
    }
    if (Number(requester.id) !== 1 && !isOwnerEmail(requester.email) && Number(requester.tabAccess) !== 1) {
        res.status(403).json({ success: false, message: 'Você não tem permissão para acessar esta aba do painel.' });
        return null;
    }
    return requester;
}

function generateReadablePassword() {
    const syllable = () => (
        PASSWORD_CONSONANTS[crypto.randomInt(PASSWORD_CONSONANTS.length)] +
        PASSWORD_VOWELS[crypto.randomInt(PASSWORD_VOWELS.length)] +
        PASSWORD_CONSONANTS[crypto.randomInt(PASSWORD_CONSONANTS.length)] +
        PASSWORD_VOWELS[crypto.randomInt(PASSWORD_VOWELS.length)]
    );
    const chunks = [syllable(), syllable(), syllable()];
    chunks[0] = `${chunks[0][0].toUpperCase()}${chunks[0].slice(1)}`;
    const digits = String(crypto.randomInt(100000)).padStart(5, '0');
    return `${chunks.join('-')}-${digits}!`;
}

function getPasswordRecoveryUrl(email) {
    const configuredUrl = String(process.env.FRONTEND_URL || '').trim();
    let baseUrl = FALLBACK_FRONTEND_URL;
    try {
        const parsed = new URL(configuredUrl);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            baseUrl = parsed.toString();
        }
    } catch {
        baseUrl = FALLBACK_FRONTEND_URL;
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const recoveryUrl = new URL('forgot-password.html', normalizedBaseUrl);
    recoveryUrl.searchParams.set('email', email);
    return recoveryUrl.toString();
}

async function issueSitePasswordForGoogleAccount({ req, requester, target, disableGoogleLogin }) {
    const userId = Number(target.id);
    const email = String(target.email || '').trim();
    const previousGoogleLoginEnabled = Number(target.googleLoginEnabled ?? 1) === 1 ? 1 : 0;
    const nextGoogleLoginEnabled = disableGoogleLogin ? 0 : previousGoogleLoginEnabled;
    const newPassword = generateReadablePassword();
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    const googleStatusMessage = nextGoogleLoginEnabled
        ? 'Seu login pelo Google continua ativo.'
        : 'O login pelo Google foi desativado para sua conta.';
    const emailMessage = buildNoticeEmail({
        title: disableGoogleLogin ? 'Acesso por senha ativado' : 'Nova senha da sua conta',
        greeting: String(target.nickname || '').trim(),
        intro: disableGoogleLogin
            ? 'O acesso pelo Google foi desativado para sua conta HOLIDAY Guild. Use seu nickname ou e-mail e a senha inicial abaixo para entrar pelo site.'
            : 'Uma senha inicial foi definida para sua conta HOLIDAY Guild. Use seu nickname ou e-mail e a senha abaixo para entrar pelo site.',
        details: [
            { label: 'Nickname', value: String(target.nickname || '') },
            { label: 'E-mail', value: email },
            { label: 'Senha inicial', value: newPassword }
        ],
        action: {
            label: 'Trocar minha senha',
            url: getPasswordRecoveryUrl(email)
        },
        noticeTitle: 'Recomendação de segurança',
        notice: `Use o botão para solicitar a troca da senha e concluir a verificação pelo e-mail. ${googleStatusMessage} Não compartilhe esta mensagem.`
    });

    const updateResult = await dbRunAsync(
        `UPDATE users
         SET password = ?, googleLoginEnabled = ?
         WHERE id = ?
           AND googleSubject = ?
           AND emailVerified = 1
           AND password = ?
           AND COALESCE(googleLoginEnabled, 1) = ?`,
        [
            newPasswordHash,
            nextGoogleLoginEnabled,
            userId,
            target.googleSubject,
            target.password,
            previousGoogleLoginEnabled
        ]
    );
    if (updateResult.changes !== 1) {
        return {
            status: 409,
            body: {
                success: false,
                message: 'A conta foi alterada durante a operação. Atualize a busca e tente novamente.'
            }
        };
    }

    try {
        await sendEmail(
            email,
            disableGoogleLogin ? 'Acesso por senha à sua conta | HOLIDAY Guild' : 'Nova senha da sua conta | HOLIDAY Guild',
            emailMessage.html,
            [],
            emailMessage.text
        );
    } catch (emailError) {
        try {
            const rollbackResult = await dbRunAsync(
                `UPDATE users
                 SET password = ?, googleLoginEnabled = ?
                 WHERE id = ?
                   AND password = ?
                   AND googleLoginEnabled = ?`,
                [
                    target.password,
                    previousGoogleLoginEnabled,
                    userId,
                    newPasswordHash,
                    nextGoogleLoginEnabled
                ]
            );
            if (rollbackResult.changes !== 1) {
                console.error(`[ADMIN] Não foi possível restaurar senha e login Google do usuário ${userId} após falha no envio.`);
                return {
                    status: 500,
                    body: {
                        success: false,
                        message: 'O e-mail falhou e não foi possível restaurar o acesso anterior automaticamente. Contate o suporte.'
                    }
                };
            }
        } catch (rollbackError) {
            console.error(`[ADMIN] Falha ao restaurar acesso do usuário ${userId}:`, rollbackError);
            return {
                status: 500,
                body: {
                    success: false,
                    message: 'O e-mail falhou e não foi possível restaurar o acesso anterior automaticamente. Contate o suporte.'
                }
            };
        }

        console.error('[ADMIN] Falha ao enviar senha inicial por e-mail:', emailError);
        return {
            status: 502,
            body: {
                success: false,
                message: 'Não foi possível enviar o e-mail. O acesso anterior foi mantido.'
            }
        };
    }

    auditAdminAction(req, disableGoogleLogin ? 'disabled_google_login_and_sent_password' : 'sent_password_for_google_account', {
        actorEmail: requester.email,
        targetUserId: userId,
        targetEmail: email,
        metadata: { method: 'generated_password_email' }
    });

    return {
        status: 200,
        body: {
            success: true,
            message: `Senha enviada para ${maskEmail(email)}. ${googleStatusMessage}`
        }
    };
}

async function getStaffHierarchyAccess(req) {
    const userId = Number(req.user?.id || 0);
    if (userId === 1) {
        return {
            canView: true,
            canEditAll: true,
            requesterLevel: Number.MAX_SAFE_INTEGER,
            roleName: 'Dono'
        };
    }

    const requester = await dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [userId]);
    if (!requester) {
        return { canView: false, canEditAll: false, requesterLevel: 0, roleName: '' };
    }

    if (isOwnerEmail(requester.email)) {
        return {
            canView: true,
            canEditAll: true,
            requesterLevel: Number.MAX_SAFE_INTEGER,
            roleName: 'Dono'
        };
    }

    const [requesterRole, accessRow] = await Promise.all([
        getUserHighestStaffRole(userId),
        getAdminTabAccessRow(userId)
    ]);

    return {
        canView: Boolean(getAdminTabAccess(accessRow).staffHierarchy),
        canEditAll: false,
        requesterLevel: Number(requesterRole?.level || 0),
        roleName: String(requesterRole?.rankName || '').trim()
    };
}

// Verificar se usuário tem acesso ao painel admin e às abas delegadas
router.get('/check-permission', protect, async (req, res) => {
    try {
        const user = await getAdminTabAccessRow(req.user.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado.' });
        }

        const isOwner = isOwnerEmail(user.email);
        const isRootAdmin = Number(user.id) === 1;
        const hasFullAdminAccess = isOwner || isRootAdmin;
        const rank = hasFullAdminAccess ? null : await dbGetAsync(
            `SELECT cr.name,
                    COALESCE(cr.canViewStaffHierarchy, 0) AS canViewStaffHierarchy,
                    COALESCE(cr.canViewMembersPage, 0) AS canViewMembersPage
             FROM user_custom_ranks ucr
             JOIN custom_ranks cr ON ucr.customRankId = cr.id
             WHERE ucr.userId = ? AND COALESCE(cr.enableAdminPanel, 0) = 1
             ORDER BY COALESCE(cr.hierarchyLevel, 0) DESC, ucr.assignedAt ASC
             LIMIT 1`,
            [req.user.id]
        );
        const tabAccess = hasFullAdminAccess
            ? getFullAdminTabAccess()
            : getAdminTabAccess(user);

        return res.json({
            success: true,
            hasAccess: hasFullAdminAccess || Boolean(rank),
            isAdmin: hasFullAdminAccess,
            isOwner,
            adminRank: rank?.name || null,
            canViewStaffHierarchy: tabAccess.staffHierarchy,
            canViewMembersPage: hasFullAdminAccess || Number(rank?.canViewMembersPage || 0) === 1,
            adminTabAccess: tabAccess
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao verificar permissão:', error);
        return res.status(500).json({ success: false, message: 'Erro ao verificar permissões' });
    }
});

router.get('/tab-access/users', protect, async (req, res) => {
    try {
        const requester = await ensureOwnerRequester(req, res);
        if (!requester) return;

        const query = String(req.query?.q || '').trim();
        if (query.length < 2 || query.length > 100) {
            return res.status(400).json({ success: false, message: 'Digite pelo menos 2 caracteres para buscar.' });
        }

        const inheritedAccessColumns = Object.entries(ADMIN_PANEL_TAB_COLUMNS).map(([key, column]) => (
            `EXISTS (
                SELECT 1
                FROM user_custom_ranks ucr
                JOIN custom_ranks cr ON cr.id = ucr.customRankId
                WHERE ucr.userId = u.id
                  AND COALESCE(cr.enableAdminPanel, 0) = 1
                  AND COALESCE(cr.${column}, 0) = 1
            ) AS roleTab_${key}`
        ));
        const users = await dbAllAsync(
            `SELECT u.id, u.nickname, u.firstName, u.lastName, u.email, u.isAdmin, u.canAccessAdminPanel,
                    u.adminTabRanks, u.adminTabEvents, u.adminTabAppearance,
                    u.adminTabUsers, u.adminTabAccount, u.adminTabSendmail,
                    u.adminTabStaffHierarchy, u.adminTabPostPermissions,
                    u.adminTabNavbar, u.adminTabBans, u.adminTabSuspendedPosts,
                    ${inheritedAccessColumns.join(', ')},
                    EXISTS (
                        SELECT 1
                        FROM user_custom_ranks ucr
                        JOIN custom_ranks cr ON cr.id = ucr.customRankId
                        WHERE ucr.userId = u.id
                          AND COALESCE(cr.enableAdminPanel, 0) = 1
                    ) AS hasAdminEnabledRank
             FROM users u
             WHERE instr(LOWER(u.nickname), LOWER(?)) > 0
                OR instr(LOWER(u.email), LOWER(?)) > 0
             ORDER BY u.nickname COLLATE NOCASE
             LIMIT 30`,
            [query, query]
        );

        return res.json({
            success: true,
            users: users.map((user) => ({
                id: Number(user.id),
                nickname: String(user.nickname || ''),
                fullName: [user.firstName, user.lastName]
                    .map((part) => String(part || '').trim())
                    .filter(Boolean)
                    .join(' ') || String(user.nickname || ''),
                maskedEmail: maskEmail(user.email),
                isOwnerAccount: Number(user.id) === 1 || isOwnerEmail(user.email),
                hasAdminPanelAccess: Number(user.isAdmin) === 1
                    || Number(user.canAccessAdminPanel) === 1
                    || Number(user.hasAdminEnabledRank) === 1,
                permissions: getDirectAdminTabAccess(user),
                effectivePermissions: getAdminTabAccess(user),
                inheritedPermissions: Object.fromEntries(
                    Object.keys(ADMIN_PANEL_TAB_COLUMNS).map((key) => [
                        key,
                        Number(user[`roleTab_${key}`]) === 1
                    ])
                )
            }))
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao buscar permissões de abas:', error);
        return res.status(500).json({ success: false, message: 'Não foi possível buscar usuários.' });
    }
});

router.put('/tab-access/users/:userId', protect, async (req, res) => {
    const userId = Number(req.params?.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    }

    try {
        const requester = await ensureOwnerRequester(req, res);
        if (!requester) return;

        const target = await dbGetAsync(`SELECT id, nickname, email FROM users WHERE id = ?`, [userId]);
        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }
        if (Number(target.id) === 1 || isOwnerEmail(target.email)) {
            return res.status(409).json({ success: false, message: 'As permissões do owner não podem ser alteradas.' });
        }

        const permissions = req.body?.permissions;
        if (!permissions || Object.keys(ADMIN_TAB_ACCESS_COLUMNS).some((key) => typeof permissions[key] !== 'boolean')) {
            return res.status(400).json({ success: false, message: 'Informe uma permissão booleana para cada aba.' });
        }

        const entries = Object.entries(ADMIN_TAB_ACCESS_COLUMNS);
        const setClause = entries.map(([, column]) => `${column} = ?`).join(', ');
        const values = entries.map(([key]) => permissions[key] ? 1 : 0);
        const result = await dbRunAsync(
            `UPDATE users SET ${setClause} WHERE id = ?`,
            [...values, userId]
        );
        if (result.changes !== 1) {
            return res.status(409).json({ success: false, message: 'Não foi possível salvar as permissões do usuário.' });
        }

        auditAdminAction(req, 'updated_admin_tab_access', {
            actorEmail: requester.email,
            targetUserId: userId,
            targetEmail: target.email,
            metadata: { permissions }
        });
        return res.json({
            success: true,
            message: `Permissões das abas atualizadas para ${target.nickname}.`
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao salvar permissões de abas:', error);
        return res.status(500).json({ success: false, message: 'Não foi possível salvar as permissões.' });
    }
});

// Verificar se usuário pode suspender postagens
router.get('/check-can-suspend', protect, (req, res) => {
    const userId = Number(req.user?.id || 0);
    const userEmail = String(req.user?.email || '').trim();
    
    console.log('[CHECK-CAN-SUSPEND] ========================================');
    console.log('[CHECK-CAN-SUSPEND] Verificando para userId:', userId);
    console.log('[CHECK-CAN-SUSPEND] Email do usuário:', userEmail);
    console.log('[CHECK-CAN-SUSPEND] OWNER_EMAIL esperado:', OWNER_EMAIL);
    
    // ID 1 é sempre admin (pode suspender)
    if (userId === 1) {
        console.log('[CHECK-CAN-SUSPEND] ✅ É admin (ID 1), pode suspender');
        console.log('[CHECK-CAN-SUSPEND] ========================================');
        return res.json({ success: true, canSuspend: true });
    }

    // Verificar se é fundador
    db.get(`SELECT email FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err) {
            console.error('[CHECK-CAN-SUSPEND] ❌ Erro ao buscar usuário:', err);
            console.log('[CHECK-CAN-SUSPEND] ========================================');
            return res.status(500).json({ success: false, message: 'Erro ao verificar permissão' });
        }

        const dbEmail = String(user?.email || '').trim();
        console.log('[CHECK-CAN-SUSPEND] Email no DB:', dbEmail);
        console.log('[CHECK-CAN-SUSPEND] Match?', dbEmail === OWNER_EMAIL);
        
        if (user && user.email === OWNER_EMAIL) {
            console.log('[CHECK-CAN-SUSPEND] ✅ É fundador, pode suspender');
            console.log('[CHECK-CAN-SUSPEND] ========================================');
            return res.json({ success: true, canSuspend: true });
        }

        // Verificar se tem rank de staff com hierarchyLevel >= 100
        db.get(`
            SELECT MAX(COALESCE(cr.hierarchyLevel, 0)) AS maxLevel
            FROM user_custom_ranks ucr
            JOIN custom_ranks cr ON ucr.customRankId = cr.id
            WHERE ucr.userId = ? AND COALESCE(cr.isStaffRole, 0) = 1
        `, [userId], (err2, result) => {
            if (err2) {
                console.error('[CHECK-CAN-SUSPEND] ❌ Erro ao verificar hierarquia:', err2);
                console.log('[CHECK-CAN-SUSPEND] ========================================');
                return res.status(500).json({ success: false, message: 'Erro ao verificar permissão' });
            }

            const maxLevel = Number(result?.maxLevel || 0);
            const canSuspend = maxLevel >= 100;
            
            console.log('[CHECK-CAN-SUSPEND] Staff check - maxLevel:', maxLevel, 'canSuspend:', canSuspend);
            if (!canSuspend) {
                console.log('[CHECK-CAN-SUSPEND] ❌ Nenhuma permissão (não é admin, não é fundador, não é staff lvl 100+)');
            } else {
                console.log('[CHECK-CAN-SUSPEND] ✅ Tem permissão por staff level');
            }
            console.log('[CHECK-CAN-SUSPEND] ========================================');
            res.json({ success: true, canSuspend });
        });
    });
});

// Listar todos os usuários
router.get('/users', protect, isAdminOrHasAdminRank, async (req, res) => {
    console.log(`[ADMIN] Listando usuários para ID: ${req.user.id}`);

    try {
        const requester = await dbGetAsync(`SELECT email FROM users WHERE id = ?`, [req.user.id]);
        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        const canManageSensitiveAccounts = isOwnerEmail(requester.email);

        const users = await dbAllAsync(`
            SELECT
                u.id,
                u.firstName,
                u.lastName,
                u.nickname,
                u.email,
                u.emailVerified,
                u.animatedProfileGifUrl,
                u.customTitle,
                u.customTitleSubtitle,
                u.createdAt,
                u.manualRank,
                t.message AS pendingEmailChangeMessage,
                EXISTS (
                    SELECT 1
                    FROM user_custom_ranks ucr
                    JOIN custom_ranks cr ON cr.id = ucr.customRankId
                    WHERE ucr.userId = u.id AND cr.canOrderAllRanks = 1
                ) AS hasRankOrderPermission
            FROM users u
            LEFT JOIN (
                SELECT userId, message
                FROM admin_tickets
                WHERE title = 'Pedido de troca de e-mail'
                ORDER BY createdAt DESC
            ) t ON t.userId = u.id
            ORDER BY u.createdAt DESC
        `);

        const mapped = (users || []).map((user) => {
            const ownerAccount = isOwnerEmail(user.email);
            const rawEmail = String(user.email || '');
            return {
                ...user,
                email: canManageSensitiveAccounts ? rawEmail : maskEmail(rawEmail),
                emailVerified: Number(user.emailVerified || 0) === 1,
                animatedProfileGifUrl: String(user.animatedProfileGifUrl || '').trim(),
                isExampleEmail: normalizeEmail(rawEmail).endsWith('@example.com'),
                isOwnerAccount: ownerAccount,
                canOrderFixedRanks: Boolean(user.hasRankOrderPermission) || ownerAccount,
                pendingEmailChangeRequest: extractEmailChangeRequest(user.pendingEmailChangeMessage)
            };
        });

        console.log(`[ADMIN] Usuários retornados: ${mapped.length}`);
        return res.json({ success: true, users: mapped, canManageSensitiveAccounts });
    } catch (error) {
        console.error('[ADMIN] Erro ao buscar usuários:', error);
        return res.status(500).json({ success: false, message: 'Erro ao buscar usuários: ' + error.message });
    }
});

router.get('/users/google-login', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const requester = await ensureAdminTabRequester(req, res, 'account');
        if (!requester) return;

        const query = String(req.query?.q || '').trim();
        if (query.length < 2 || query.length > 100) {
            return res.status(400).json({
                success: false,
                message: 'Digite pelo menos 2 caracteres para buscar.'
            });
        }

        const users = await dbAllAsync(
            `SELECT id, nickname, email, emailVerified, COALESCE(googleLoginEnabled, 1) AS googleLoginEnabled
             FROM users
             WHERE googleSubject IS NOT NULL
               AND LENGTH(TRIM(googleSubject)) > 0
               AND (
                   instr(LOWER(nickname), LOWER(?)) > 0
                   OR instr(LOWER(email), LOWER(?)) > 0
               )
             ORDER BY nickname COLLATE NOCASE
             LIMIT 30`,
            [query, query]
        );

        return res.json({
            success: true,
            users: users.map((user) => ({
                id: Number(user.id),
                nickname: String(user.nickname || ''),
                email: String(user.email || ''),
                emailVerified: Number(user.emailVerified) === 1,
                googleLoginEnabled: Number(user.googleLoginEnabled) === 1
            }))
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao buscar contas Google:', error);
        return res.status(500).json({ success: false, message: 'Não foi possível buscar contas Google.' });
    }
});

router.post('/users/:userId/password-login', protect, isAdminOrHasAdminRank, async (req, res) => {
    const userId = Number(req.params?.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    }

    try {
        const requester = await ensureAdminTabRequester(req, res, 'account');
        if (!requester) return;

        const target = await dbGetAsync(
            `SELECT id, nickname, email, emailVerified, googleSubject, password,
                    COALESCE(googleLoginEnabled, 1) AS googleLoginEnabled
             FROM users
             WHERE id = ?`,
            [userId]
        );
        if (!target || !String(target.googleSubject || '').trim()) {
            return res.status(404).json({
                success: false,
                message: 'Conta Google não encontrada.'
            });
        }
        if (Number(target.emailVerified) !== 1) {
            return res.status(409).json({
                success: false,
                message: 'O e-mail desta conta não está verificado. Não é seguro enviar uma senha.'
            });
        }

        const result = await issueSitePasswordForGoogleAccount({
            req,
            requester,
            target,
            disableGoogleLogin: false
        });
        return res.status(result.status).json(result.body);
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar senha de conta Google:', error);
        return res.status(500).json({ success: false, message: 'Não foi possível enviar uma senha para esta conta.' });
    }
});

router.put('/users/:userId/google-login', protect, isAdminOrHasAdminRank, async (req, res) => {
    const userId = Number(req.params?.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    }
    if (typeof req.body?.enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Informe se o login pelo Google deve ficar ativo.' });
    }

    try {
        const requester = await ensureAdminTabRequester(req, res, 'account');
        if (!requester) return;

        const target = await dbGetAsync(
            `SELECT id, nickname, email, emailVerified, googleSubject, password,
                    COALESCE(googleLoginEnabled, 1) AS googleLoginEnabled
             FROM users
             WHERE id = ?`,
            [userId]
        );
        if (!target || !String(target.googleSubject || '').trim()) {
            return res.status(404).json({ success: false, message: 'Conta Google não encontrada.' });
        }
        if (Number(target.emailVerified) !== 1) {
            return res.status(409).json({
                success: false,
                message: 'O e-mail desta conta não está verificado. Não é seguro alterar o acesso.'
            });
        }

        if (!req.body.enabled) {
            const result = await issueSitePasswordForGoogleAccount({
                req,
                requester,
                target,
                disableGoogleLogin: true
            });
            return res.status(result.status).json(result.body);
        }

        const updateResult = await dbRunAsync(
            `UPDATE users
             SET googleLoginEnabled = 1
             WHERE id = ?
               AND googleSubject = ?
               AND COALESCE(googleLoginEnabled, 1) = ?`,
            [userId, target.googleSubject, Number(target.googleLoginEnabled)]
        );
        if (updateResult.changes !== 1) {
            return res.status(409).json({
                success: false,
                message: 'A conta foi alterada durante a operação. Atualize a busca e tente novamente.'
            });
        }

        auditAdminAction(req, 'enabled_google_login_for_account', {
            actorEmail: requester.email,
            targetUserId: userId,
            targetEmail: target.email
        });
        return res.json({
            success: true,
            message: 'Login pelo Google ativado. O acesso por senha continua disponível.'
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao alterar login Google:', error);
        return res.status(500).json({ success: false, message: 'Não foi possível alterar o login pelo Google.' });
    }
});

router.put('/users/:userId/approve-email-change', protect, isAdminOrHasAdminRank, async (req, res) => {
    const userId = Number(req.params?.userId);
    const newEmail = String(req.body?.newEmail || '').trim();

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    }

    if (!newEmail) {
        return res.status(400).json({ success: false, message: 'Informe o novo e-mail.' });
    }

    try {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({ success: false, message: 'E-mail inválido.' });
        }

        const existingUser = await dbGetAsync('SELECT id FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Este e-mail já está sendo usado por outro usuário.' });
        }

        const targetUser = await dbGetAsync('SELECT id, email, nickname FROM users WHERE id = ?', [userId]);

        await dbRunAsync('UPDATE users SET email = ?, emailVerified = 1 WHERE id = ?', [newEmail, userId]);
        await dbRunAsync('DELETE FROM admin_tickets WHERE userId = ? AND title = ?', [userId, 'Pedido de troca de e-mail']);

        const currentEmail = targetUser?.email;

        if (currentEmail) {
            try {
                const emailMessage = buildNoticeEmail({
                    title: 'E-mail atualizado com sucesso',
                    greeting: targetUser?.nickname,
                    intro: 'A equipe analisou e aprovou sua solicitação de troca de e-mail para a conta HOLIDAY Guild.',
                    status: 'Solicitação aprovada',
                    details: [{ label: 'Novo endereço cadastrado', value: newEmail }],
                    notice: 'Se você não solicitou esta alteração, entre em contato com a equipe da HOLIDAY Guild.',
                    noticeTitle: 'Não reconhece esta alteração?'
                });
                await sendEmail(currentEmail, 'Seu novo e-mail foi aprovado | HOLIDAY Guild', emailMessage.html, [], emailMessage.text);
            } catch (mailError) {
                console.error('[EMAIL] Falha ao notificar aprovação de troca de e-mail:', mailError?.message || mailError);
            }
        }

        return res.json({ success: true, message: 'E-mail aprovado com sucesso.' });
    } catch (error) {
        console.error('Erro ao aprovar troca de e-mail:', error);
        return res.status(500).json({ success: false, message: 'Erro ao aprovar troca de e-mail.' });
    }
});

router.delete('/users/:userId/cancel-email-change-request', protect, isAdminOrHasAdminRank, async (req, res) => {
    const userId = Number(req.params?.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: 'Usuário inválido.' });
    }

    try {
        const targetUser = await dbGetAsync('SELECT id, email, nickname FROM users WHERE id = ?', [userId]);
        await dbRunAsync('DELETE FROM admin_tickets WHERE userId = ? AND title = ?', [userId, 'Pedido de troca de e-mail']);

        const currentEmail = targetUser?.email;

        if (currentEmail) {
            try {
                const emailMessage = buildNoticeEmail({
                    title: 'Atualização da solicitação de e-mail',
                    greeting: targetUser?.nickname,
                    intro: 'A equipe analisou sua solicitação de troca de e-mail, mas não foi possível aprová-la neste momento.',
                    status: 'Solicitação não aprovada',
                    notice: 'Você pode entrar em contato com a equipe para entender o motivo e, se necessário, enviar uma nova solicitação com as informações corrigidas.',
                    noticeTitle: 'Próximos passos'
                });
                await sendEmail(
                    currentEmail,
                    'Atualiza\u00e7\u00e3o sobre sua solicita\u00e7\u00e3o de e-mail | HOLIDAY Guild',
                    emailMessage.html,
                    [],
                    emailMessage.text
                );
            } catch (mailError) {
                console.error('[EMAIL] Falha ao notificar recusa de troca de e-mail:', mailError?.message || mailError);
            }
        }

        return res.json({ success: true, message: 'Pedido cancelado com sucesso.' });
    } catch (error) {
        console.error('Erro ao cancelar pedido de troca de e-mail:', error);
        return res.status(500).json({ success: false, message: 'Erro ao cancelar pedido de troca de e-mail.' });
    }
});

router.get('/staff-hierarchy', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const access = await getStaffHierarchyAccess(req);
        if (!access.canView && !access.canEditAll) {
            return res.status(403).json({ success: false, message: 'Você não tem permissão para visualizar a hierarquia da staff.' });
        }

        const ranks = await listStaffHierarchyRanks();
        return res.json({
            success: true,
            canEditAll: access.canEditAll,
            requesterLevel: Number(access.requesterLevel || 0),
            canView: access.canView || access.canEditAll,
            ranks: (ranks || []).map((rank) => ({
                ...rank,
                isStaffRole: Number(rank?.isStaffRole) === 1,
                hierarchyLevel: Number(rank?.hierarchyLevel || 0),
                enableAdminPanel: Number(rank?.enableAdminPanel) === 1,
                canViewStaffHierarchy: Number(rank?.canViewStaffHierarchy || 0) === 1,
                canViewMembersPage: Number(rank?.canViewMembersPage || 0) === 1,
                adminPanelTabs: Object.fromEntries(
                    Object.entries(ADMIN_PANEL_TAB_COLUMNS).map(([key, column]) => [
                        key,
                        Number(rank?.[column] || 0) === 1
                    ])
                ),
                assignedUsers: Number(rank?.assignedUsers || 0),
                isSystemHierarchyProtected: isSystemHierarchyProtectedRank(rank)
            }))
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao carregar hierarquia da staff:', error);
        return res.status(500).json({ success: false, message: 'Erro ao carregar hierarquia da staff: ' + error.message });
    }
});

router.put('/staff-hierarchy/:rankId', protect, isAdminOrHasAdminRank, async (req, res) => {
    const rankId = Number(req.params?.rankId);
    if (!Number.isInteger(rankId) || rankId <= 0) {
        return res.status(400).json({ success: false, message: 'Cargo inválido' });
    }

    try {
        const access = await getStaffHierarchyAccess(req);
        if (!access.canView && !access.canEditAll) {
            return res.status(403).json({ success: false, message: 'Você não tem permissão para editar a hierarquia da staff.' });
        }

        const isStaffRole = req.body?.isStaffRole === true;
        const hierarchyLevel = Math.max(0, Number.parseInt(req.body?.hierarchyLevel, 10) || 0);
        const enableAdminPanel = req.body?.enableAdminPanel === true;
        const requestedTabPermissions = req.body?.adminPanelTabs;
        if (
            access.canEditAll &&
            (!requestedTabPermissions ||
                Object.keys(ADMIN_PANEL_TAB_COLUMNS).some((key) => typeof requestedTabPermissions[key] !== 'boolean'))
        ) {
            return res.status(400).json({ success: false, message: 'Informe uma permissão válida para cada aba do painel.' });
        }

        const existing = await dbGetAsync(
            `SELECT id,
                    name,
                    COALESCE(isStaffRole, 0) AS isStaffRole,
                    COALESCE(hierarchyLevel, 0) AS hierarchyLevel,
                    COALESCE(enableAdminPanel, 0) AS enableAdminPanel,
                    COALESCE(canViewStaffHierarchy, 0) AS canViewStaffHierarchy,
                    COALESCE(canViewMembersPage, 0) AS canViewMembersPage,
                    ${Object.entries(ADMIN_PANEL_TAB_COLUMNS)
                        .map(([key, column]) => `COALESCE(${column}, 0) AS roleTab_${key}`)
                        .join(', ')}
             FROM custom_ranks
             WHERE id = ? AND isDefault = 0`,
            [rankId]
        );
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Cargo não encontrado' });
        }

        if (!access.canEditAll) {
            if (isSystemHierarchyProtectedRank(existing)) {
                return res.status(403).json({
                    success: false,
                    message: 'Conquistas padrão de likes, postagens e progressão só podem ser alteradas pelo fundador.'
                });
            }

            const currentLevel = Number(existing?.hierarchyLevel || 0);
            const requesterLevel = Number(access.requesterLevel || 0);

            if (requesterLevel <= currentLevel) {
                return res.status(403).json({
                    success: false,
                    message: 'Você só pode editar cargos abaixo do seu nível hierárquico.'
                });
            }

            if (hierarchyLevel >= requesterLevel) {
                return res.status(403).json({
                    success: false,
                    message: 'Você só pode salvar cargos com nível abaixo do seu nível hierárquico.'
                });
            }
        }

        const adminPanelTabs = Object.fromEntries(
            Object.entries(ADMIN_PANEL_TAB_COLUMNS).map(([key]) => [
                key,
                access.canEditAll
                    ? requestedTabPermissions[key]
                    : Number(existing?.[`roleTab_${key}`] || 0) === 1
            ])
        );
        const canViewMembersPage = access.canEditAll
            ? req.body?.canViewMembersPage === true
            : Number(existing?.canViewMembersPage || 0) === 1;
        const roleTabEntries = Object.entries(ADMIN_PANEL_TAB_COLUMNS);
        const roleTabSetClause = roleTabEntries.map(([, column]) => `${column} = ?`).join(', ');

        await dbRunAsync(
            `UPDATE custom_ranks
             SET isStaffRole = ?,
                 hierarchyLevel = ?,
                 enableAdminPanel = ?,
                 canViewMembersPage = ?,
                 ${roleTabSetClause}
             WHERE id = ? AND isDefault = 0`,
            [
                isStaffRole ? 1 : 0,
                hierarchyLevel,
                enableAdminPanel ? 1 : 0,
                canViewMembersPage ? 1 : 0,
                ...roleTabEntries.map(([key]) => adminPanelTabs[key] ? 1 : 0),
                rankId
            ]
        );

        return res.json({
            success: true,
            message: `Hierarquia de ${existing.name} atualizada com sucesso`
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao salvar hierarquia da staff:', error);
        return res.status(500).json({ success: false, message: 'Erro ao salvar hierarquia da staff: ' + error.message });
    }
});

// Excluir conta completa (somente dono da conta principal)
router.delete('/users/:userId', protect, isAdminOrHasAdminRank, async (req, res) => {
    const requesterId = req.user?.id;
    const targetUserId = Number(req.params?.userId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        auditAdminAction(req, 'admin_delete_user_rejected', {
            success: false,
            targetUserId,
            metadata: { reason: 'invalid_target_id' }
        });
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    try {
        const requester = await dbGetAsync(`SELECT email FROM users WHERE id = ?`, [requesterId]);
        if (!requester) {
            auditAdminAction(req, 'admin_delete_user_rejected', {
                success: false,
                targetUserId,
                metadata: { reason: 'requester_not_found' }
            });
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        if (!isOwnerEmail(requester.email)) {
            auditAdminAction(req, 'admin_delete_user_rejected', {
                success: false,
                targetUserId,
                actorEmail: requester.email,
                metadata: { reason: 'requester_not_owner' }
            });
            return res.status(403).json({ success: false, message: 'Somente o dono da conta pode excluir usuários' });
        }

        const target = await dbGetAsync(`SELECT id, nickname, email FROM users WHERE id = ?`, [targetUserId]);
        if (!target) {
            auditAdminAction(req, 'admin_delete_user_rejected', {
                success: false,
                targetUserId,
                actorEmail: requester.email,
                metadata: { reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        if (isOwnerEmail(target.email)) {
            auditAdminAction(req, 'admin_delete_user_rejected', {
                success: false,
                targetUserId,
                actorEmail: requester.email,
                targetEmail: target.email,
                metadata: { reason: 'target_is_owner' }
            });
            return res.status(403).json({ success: false, message: 'A conta dona não pode ser excluída por esta ação' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, targetUserId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        await dbRunAsync('BEGIN TRANSACTION');
        try {
            await dbRunAsync(`
                DELETE FROM notifications
                WHERE userId = ? OR fromUserId = ?
                   OR downloadId IN (SELECT id FROM downloads WHERE userId = ?)
            `, [targetUserId, targetUserId, targetUserId]);

            await dbRunAsync(`
                DELETE FROM download_comments
                WHERE userId = ?
                   OR downloadId IN (SELECT id FROM downloads WHERE userId = ?)
            `, [targetUserId, targetUserId]);

            await dbRunAsync(`
                DELETE FROM download_reactions
                WHERE userId = ?
                   OR downloadId IN (SELECT id FROM downloads WHERE userId = ?)
            `, [targetUserId, targetUserId]);

            await dbRunAsync(`
                DELETE FROM download_favorites
                WHERE userId = ?
                   OR downloadId IN (SELECT id FROM downloads WHERE userId = ?)
            `, [targetUserId, targetUserId]);

            await dbRunAsync(`
                DELETE FROM download_like_history
                WHERE ownerUserId = ? OR fromUserId = ?
                   OR downloadId IN (SELECT id FROM downloads WHERE userId = ?)
            `, [targetUserId, targetUserId, targetUserId]);

            await dbRunAsync(`DELETE FROM user_custom_ranks WHERE userId = ?`, [targetUserId]);
            await dbRunAsync(`DELETE FROM ranks WHERE userId = ?`, [targetUserId]);
            await dbRunAsync(`DELETE FROM bans WHERE userId = ?`, [targetUserId]);
            await dbRunAsync(`DELETE FROM downloads WHERE userId = ?`, [targetUserId]);

            const deleteUserResult = await dbRunAsync(`DELETE FROM users WHERE id = ?`, [targetUserId]);
            if (!deleteUserResult.changes) {
                throw new Error('Usuário não encontrado para exclusão');
            }

            await dbRunAsync('COMMIT');
            console.log(`[ADMIN] Conta excluída com sucesso: ${target.nickname} (ID ${targetUserId})`);
            auditAdminAction(req, 'admin_delete_user_success', {
                actorEmail: requester.email,
                targetUserId,
                targetEmail: target.email,
                metadata: { targetNickname: target.nickname }
            });
            return res.json({ success: true, message: `Conta ${target.nickname} excluída com sucesso` });
        } catch (txError) {
            try {
                await dbRunAsync('ROLLBACK');
            } catch (rollbackError) {
                console.error('[ADMIN] Falha ao desfazer transação de exclusão:', rollbackError);
            }
            console.error('[ADMIN] Erro ao excluir conta (transação):', txError);
            auditAdminAction(req, 'admin_delete_user_error', {
                success: false,
                actorEmail: requester.email,
                targetUserId,
                metadata: { stage: 'transaction', message: txError.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao excluir conta: ' + txError.message });
        }
    } catch (error) {
        console.error('[ADMIN] Erro ao excluir conta:', error);
        auditAdminAction(req, 'admin_delete_user_error', {
            success: false,
            targetUserId,
            metadata: { stage: 'outer', message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao excluir conta: ' + error.message });
    }
});

router.post('/users/:userId/remove-avatar', protect, isAdminOrHasAdminRank, async (req, res) => {
    const requesterId = Number(req.user?.id || 0);
    const targetUserId = Number(req.params?.userId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    try {
        const [requester, target] = await Promise.all([
            dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [requesterId]),
            dbGetAsync(`SELECT id, nickname, email, avatar FROM users WHERE id = ?`, [targetUserId])
        ]);

        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        if (isOwnerEmail(target.email) && !isOwnerEmail(requester.email)) {
            return res.status(403).json({ success: false, message: 'A foto da conta dona não pode ser removida por esta ação' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, targetUserId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        if (!String(target.avatar || '').trim()) {
            return res.json({ success: true, message: 'Usuário já está sem foto de perfil' });
        }

        const previousAvatar = String(target.avatar || '').trim();
        await dbRunAsync(
            `UPDATE users
             SET avatar = NULL, avatarScale = 1, avatarOffsetX = 50, avatarOffsetY = 50
             WHERE id = ?`,
            [targetUserId]
        );

        safeDeleteUploadFile(previousAvatar);
        auditAdminAction(req, 'admin_remove_user_avatar_success', {
            actorEmail: requester.email,
            targetUserId,
            targetEmail: target.email,
            metadata: { targetNickname: target.nickname }
        });

        return res.json({ success: true, message: `Foto de perfil de ${target.nickname} removida com sucesso` });
    } catch (error) {
        console.error('[ADMIN] Erro ao remover avatar do usuário:', error);
        auditAdminAction(req, 'admin_remove_user_avatar_error', {
            success: false,
            targetUserId,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao remover foto de perfil: ' + error.message });
    }
});

router.post('/users/:userId/remove-animated-background', protect, isAdminOrHasAdminRank, async (req, res) => {
    const requesterId = Number(req.user?.id || 0);
    const targetUserId = Number(req.params?.userId);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    try {
        const [requester, target] = await Promise.all([
            dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [requesterId]),
            dbGetAsync(
                `SELECT id, nickname, email, animatedProfileGifUrl, animatedProfileVisualMode
                 FROM users
                 WHERE id = ?`,
                [targetUserId]
            )
        ]);

        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        if (isOwnerEmail(target.email) && !isOwnerEmail(requester.email)) {
            return res.status(403).json({ success: false, message: 'O fundo animado da conta dona não pode ser removido por esta ação' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, targetUserId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        const previousGif = String(target.animatedProfileGifUrl || '').trim();
        if (!previousGif) {
            return res.json({ success: true, message: 'Usuário já está sem fundo animado personalizado' });
        }

        await dbRunAsync(
            `UPDATE users
             SET animatedProfileGifUrl = NULL,
                 animatedProfileVisualMode = CASE
                     WHEN LOWER(COALESCE(animatedProfileVisualMode, '')) = 'gif' THEN 'theme'
                     ELSE animatedProfileVisualMode
                 END
             WHERE id = ?`,
            [targetUserId]
        );

        safeDeleteUploadFile(previousGif);
        auditAdminAction(req, 'admin_remove_user_animated_background_success', {
            actorEmail: requester.email,
            targetUserId,
            targetEmail: target.email,
            metadata: { targetNickname: target.nickname }
        });

        return res.json({ success: true, message: `Fundo animado de ${target.nickname} removido com sucesso` });
    } catch (error) {
        console.error('[ADMIN] Erro ao remover fundo animado do usuário:', error);
        auditAdminAction(req, 'admin_remove_user_animated_background_error', {
            success: false,
            targetUserId,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao remover fundo animado: ' + error.message });
    }
});

router.post('/users/:userId/send-ticket', protect, isAdminOrHasAdminRank, uploadAdminTicketAttachment.single('attachment'), async (req, res) => {
    const requesterId = Number(req.user?.id || 0);
    const targetUserId = Number(req.params?.userId);
    const title = normalizeAdminTicketTitle(req.body?.title);
    const message = normalizeAdminTicketMessage(req.body?.message);
    const attachment = buildAdminTicketAttachmentPayload(req.file);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    if (!title || !message) {
        return res.status(400).json({ success: false, message: 'Título e mensagem são obrigatórios' });
    }

    try {
        const [requester, target] = await Promise.all([
            dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [requesterId]),
            dbGetAsync(`SELECT id, nickname, email FROM users WHERE id = ?`, [targetUserId])
        ]);

        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        await Notification.createAdminTicket(targetUserId, requesterId, title, message, attachment, { isBroadcast: false });

        auditAdminAction(req, 'admin_send_ticket_success', {
            actorEmail: requester.email,
            targetUserId,
            targetEmail: target.email,
            metadata: {
                targetNickname: target.nickname,
                title,
                hasAttachment: Boolean(attachment?.path)
            }
        });

        return res.json({ success: true, message: `Ticket enviado para ${target.nickname}` });
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar ticket:', error);
        auditAdminAction(req, 'admin_send_ticket_error', {
            success: false,
            targetUserId,
            metadata: { title, message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao enviar ticket: ' + error.message });
    }
});

router.put('/users/:userId/email-status', protect, isAdminOrHasAdminRank, async (req, res) => {
    const targetUserId = Number(req.params?.userId);
    const emailVerified = normalizeBooleanInput(req.body?.emailVerified, false);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    try {
        const target = await dbGetAsync(`SELECT id, email, nickname FROM users WHERE id = ?`, [targetUserId]);
        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        await dbRunAsync(`UPDATE users SET emailVerified = ? WHERE id = ?`, [emailVerified ? 1 : 0, targetUserId]);

        auditAdminAction(req, 'admin_update_user_email_status', {
            actorEmail: req.user?.email || null,
            targetUserId,
            targetEmail: target.email,
            metadata: {
                targetNickname: target.nickname,
                emailVerified
            }
        });

        return res.json({
            success: true,
            message: `Email de ${target.nickname} marcado como ${emailVerified ? 'verificado' : 'inválido'}`
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao atualizar status de email do usuário:', error);
        auditAdminAction(req, 'admin_update_user_email_status_error', {
            success: false,
            targetUserId,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao atualizar status de email: ' + error.message });
    }
});

router.post('/users/:userId/send-email', protect, isAdminOrHasAdminRank, uploadAdminTicketAttachment.array('attachments', 10), async (req, res) => {
    const targetUserId = Number(req.params?.userId);
    const subject = normalizeAdminEmailSubject(req.body?.subject);
    const message = normalizeAdminEmailBody(req.body?.message);
    const mediaUrl = normalizeAdminEmailMediaUrl(req.body?.mediaUrl);
    const mediaType = String(req.body?.mediaType || '').trim().toLowerCase();

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de usuário inválido' });
    }

    if (!subject || !message) {
        return res.status(400).json({ success: false, message: 'Assunto e mensagem são obrigatórios' });
    }

    if (mediaUrl && !ALLOWED_ADMIN_EMAIL_MEDIA_TYPES.has(mediaType)) {
        return res.status(400).json({ success: false, message: 'Tipo de mídia inválido' });
    }

    try {
        const target = await dbGetAsync(`SELECT id, email, nickname, disableTeamEmailNotifications FROM users WHERE id = ?`, [targetUserId]);
        if (!target) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }
        if (Number(target.disableTeamEmailNotifications) === 1) {
            return res.status(400).json({ success: false, message: 'Este usuário optou por não receber e-mails da equipe.' });
        }

        const html = buildAdminEmailHtml(message, mediaUrl, mediaType);
        const attachments = buildAdminEmailAttachments(req);
        await sendEmail(target.email, subject, html, attachments);

        auditAdminAction(req, 'admin_send_email_success', {
            actorEmail: req.user?.email || null,
            targetUserId,
            targetEmail: target.email,
            metadata: {
                targetNickname: target.nickname,
                subject,
                mediaType: mediaUrl ? mediaType : 'none',
                hasMedia: Boolean(mediaUrl)
            }
        });

        return res.json({ success: true, message: `Email enviado para ${target.nickname}` });
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar email para usuário:', error);
        auditAdminAction(req, 'admin_send_email_error', {
            success: false,
            targetUserId,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao enviar email: ' + error.message });
    }
});

router.post('/emails/send-to-all', protect, isAdminOrHasAdminRank, uploadAdminTicketAttachment.array('attachments', 10), async (req, res) => {
    const subject = normalizeAdminEmailSubject(req.body?.subject);
    const message = normalizeAdminEmailBody(req.body?.message);
    const mediaUrl = normalizeAdminEmailMediaUrl(req.body?.mediaUrl);
    const mediaType = String(req.body?.mediaType || '').trim().toLowerCase();

    if (!subject || !message) {
        return res.status(400).json({ success: false, message: 'Assunto e mensagem são obrigatórios' });
    }

    if (mediaUrl && !ALLOWED_ADMIN_EMAIL_MEDIA_TYPES.has(mediaType)) {
        return res.status(400).json({ success: false, message: 'Tipo de mídia inválido' });
    }

    try {
        const requester = await dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [req.user?.id]);
        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        const users = await dbAllAsync(
            `SELECT DISTINCT id, lower(trim(email)) AS email, disableTeamEmailNotifications
             FROM users
             WHERE TRIM(IFNULL(email, '')) <> '' AND instr(lower(trim(email)), '@') > 0`
        );
        const eligibleUsers = (users || []).filter((user) => Number(user.disableTeamEmailNotifications) !== 1);
        if (eligibleUsers.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum destinatário aceitou receber e-mails da equipe.' });
        }
        const html = buildAdminEmailHtml(message, mediaUrl, mediaType);
        const attachments = buildAdminEmailAttachments(req);

        const sendResults = await Promise.allSettled(eligibleUsers.map((user) => sendEmail(String(user.email || '').trim(), subject, html, attachments)));
        const failed = sendResults.filter(result => result.status === 'rejected');

        auditAdminAction(req, 'admin_send_email_to_all', {
            actorEmail: requester.email,
            metadata: {
                totalRecipients: eligibleUsers.length,
                failedCount: failed.length,
                mediaType: mediaUrl ? mediaType : 'none'
            }
        });

        return res.json({
            success: failed.length === 0,
            message: failed.length === 0
                ? `Email enviado para ${eligibleUsers.length} usuário(s)`
                : `Email enviado para ${eligibleUsers.length - failed.length} usuário(s). Falha em ${failed.length} envio(s).`
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar email para todos:', error);
        auditAdminAction(req, 'admin_send_email_to_all_error', {
            success: false,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao enviar email para todos: ' + error.message });
    }
});

router.post('/emails/send-to-user', protect, isAdminOrHasAdminRank, uploadAdminTicketAttachment.array('attachments', 10), async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const subject = normalizeAdminEmailSubject(req.body?.subject);
    const message = normalizeAdminEmailBody(req.body?.message);
    const mediaUrl = normalizeAdminEmailMediaUrl(req.body?.mediaUrl);
    const mediaType = String(req.body?.mediaType || '').trim().toLowerCase();

    if (!email || !subject || !message) {
        return res.status(400).json({ success: false, message: 'Email, assunto e mensagem são obrigatórios' });
    }

    if (!email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    if (mediaUrl && !ALLOWED_ADMIN_EMAIL_MEDIA_TYPES.has(mediaType)) {
        return res.status(400).json({ success: false, message: 'Tipo de mídia inválido' });
    }

    try {
        const requester = await dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [req.user?.id]);
        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        const user = await dbGetAsync(
            `SELECT DISTINCT id, lower(trim(email)) AS email, disableTeamEmailNotifications FROM users WHERE lower(trim(email)) = ?`,
            [email]
        );

        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuário com esse email não encontrado' });
        }
        if (Number(user.disableTeamEmailNotifications) === 1) {
            return res.status(400).json({ success: false, message: 'Este usuário optou por não receber e-mails da equipe.' });
        }

        const html = buildAdminEmailHtml(message, mediaUrl, mediaType);
        const attachments = buildAdminEmailAttachments(req);

        await sendEmail(String(user.email || '').trim(), subject, html, attachments);

        auditAdminAction(req, 'admin_send_email_to_user', {
            actorEmail: requester.email,
            metadata: {
                targetEmail: email,
                mediaType: mediaUrl ? mediaType : 'none'
            }
        });

        return res.json({
            success: true,
            message: `Email enviado para ${user.email}`,
            sent: 1
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar email para usuário:', error);
        auditAdminAction(req, 'admin_send_email_to_user_error', {
            success: false,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao enviar email: ' + error.message });
    }
});

router.post('/tickets/send-to-all', protect, isAdminOrHasAdminRank, uploadAdminTicketAttachment.single('attachment'), async (req, res) => {
    const requesterId = Number(req.user?.id || 0);
    const title = normalizeAdminTicketTitle(req.body?.title);
    const message = normalizeAdminTicketMessage(req.body?.message);
    const attachment = buildAdminTicketAttachmentPayload(req.file);
    const recipientGroup = normalizeAdminTicketRecipientGroup(req.body?.recipientGroup);
    const customRankId = req.body?.customRankId;

    if (!title || !message) {
        return res.status(400).json({ success: false, message: 'Título e mensagem são obrigatórios' });
    }

    try {
        const requester = await dbGetAsync(`SELECT id, email FROM users WHERE id = ?`, [requesterId]);
        if (!requester) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }

        const users = await getAdminTicketTargetUsers(requesterId, recipientGroup, customRankId);

        if (!Array.isArray(users) || users.length === 0) {
            return res.status(404).json({ success: false, message: 'Nenhum usuário elegível encontrado para receber o ticket' });
        }

        for (const target of users) {
            await Notification.createAdminTicket(target.id, requesterId, title, message, attachment, { isBroadcast: true });
        }

        auditAdminAction(req, 'admin_send_ticket_broadcast_success', {
            actorEmail: requester.email,
            metadata: {
                title,
                recipients: users.length,
                hasAttachment: Boolean(attachment?.path),
                recipientGroup,
                customRankId: customRankId || null
            }
        });

        return res.json({
            success: true,
            message: `Ticket enviado para ${users.length} usuários`,
            recipients: users.length
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao enviar ticket em massa:', error);
        auditAdminAction(req, 'admin_send_ticket_broadcast_error', {
            success: false,
            metadata: { title, message: error.message }
        });
        return res.status(500).json({ success: false, message: 'Erro ao enviar ticket em massa: ' + error.message });
    }
});

// Dar conquista manual a um usuário
router.post('/set-rank', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userId, rankName } = req.body;
    const requesterId = req.user.id;
    
    console.log(`[ADMIN] Atribuindo conquista "${rankName}" ao usuário ${userId}`);
    
    // Não permitir modificar o admin (ID 1) se não for o próprio admin
    if (userId === 1 && requesterId !== 1) {
        auditAdminAction(req, 'admin_set_rank_rejected', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { rankName, reason: 'cannot_modify_main_admin' }
        });
        return res.status(403).json({ success: false, message: 'Não pode modificar a conta do admin' });
    }
    
    if (!userId || !rankName) {
        auditAdminAction(req, 'admin_set_rank_rejected', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { rankName, reason: 'missing_params' }
        });
        return res.status(400).json({ success: false, message: 'userId e rankName são obrigatórios' });
    }
    
    // Lista de conquistas manuais permitidos
    const manualRanks = {
        'Fundador': { color: '#FFD700' },
        'Administrador': { color: '#FF0000' },
        'Moderador': { color: '#0066FF' },
        'Amigo (A)': { color: '#00FF00' },
        'Ajudante': { color: '#FF9900' },
        'Experiente': { color: '#FFD700' },
        'Ultraboss': { color: '#FF00FF' },
        'Ex-PRO': { color: '#C0C0C0' },
        'PRO': { color: '#FFD700' }
    };
    
    if (!manualRanks[rankName]) {
        auditAdminAction(req, 'admin_set_rank_rejected', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { rankName, reason: 'rank_not_allowed' }
        });
        return res.status(400).json({ success: false, message: 'conquista não reconhecido' });
    }
    
    db.run(`UPDATE users SET manualRank = ? WHERE id = ?`, [rankName, userId], async function(err) {
        if (err) {
            console.error('[ADMIN] Erro ao atribuir conquista:', err);
            auditAdminAction(req, 'admin_set_rank_error', {
                success: false,
                targetUserId: Number(userId) || null,
                metadata: { rankName, message: err.message }
            });
            return res.status(500).json({ success: false, message: err.message });
        }
        
        console.log(`[ADMIN] conquista "${rankName}" atribuído ao usuário ID ${userId}`);
        auditAdminAction(req, 'admin_set_rank_success', {
            targetUserId: Number(userId) || null,
            metadata: { rankName }
        });

        try {
            await notifyManualAchievement({
                targetUserId: Number(userId),
                rankName,
                awardedByUserId: Number(requesterId)
            });
        } catch (notificationError) {
            console.error('[ADMIN] Erro ao criar notificação de conquista manual:', notificationError);
        }

        res.json({ success: true, message: `conquista "${rankName}" atribuído com sucesso` });
    });
});

// Remover conquista manual de um usuário
router.post('/remove-rank', protect, isAdminOrHasAdminRank, async (req, res) => {
    const { userId } = req.body;
    const requesterId = req.user.id;
    
    console.log(`[ADMIN] Removendo conquista do usuário ${userId}`);
    
    // Não permitir modificar o admin (ID 1) se não for o próprio admin
    if (userId === 1 && requesterId !== 1) {
        auditAdminAction(req, 'admin_remove_rank_rejected', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { reason: 'cannot_modify_main_admin' }
        });
        return res.status(403).json({ success: false, message: 'Não pode modificar a conta do admin' });
    }
    
    if (!userId) {
        auditAdminAction(req, 'admin_remove_rank_rejected', {
            success: false,
            metadata: { reason: 'missing_user_id' }
        });
        return res.status(400).json({ success: false, message: 'userId é obrigatório' });
    }
    
    try {
        // STEP 1: Get the ranking name before removing
        const userBefore = await new Promise((resolve, reject) => {
            db.get('SELECT manualRank FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        const removedRankName = userBefore?.manualRank;
        console.log(`[ADMIN] Rank being removed: "${removedRankName}"`);
        
        // STEP 2: Delete from users table (set manualRank to NULL)
        await new Promise((resolve, reject) => {
            db.run(`UPDATE users SET manualRank = NULL WHERE id = ?`, [userId], function(err) {
                if (err) {
                    console.error('[ADMIN] Error removing rank:', err);
                    reject(err);
                } else {
                    console.log(`[ADMIN] ✓ Cleared manualRank for user ${userId}`);
                    resolve();
                }
            });
        });
        
        // STEP 3: Also clean selectedRanks if this rank ID exists there
        // Find the custom_rank ID that corresponds to the removed rank name
        if (removedRankName) {
            const rankRecord = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM custom_ranks WHERE name = ? LIMIT 1',
                    [removedRankName],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (rankRecord?.id) {
                console.log(`[ADMIN] Found custom_rank ID ${rankRecord.id} for name "${removedRankName}"`);
                
                // Remove this ID from selectedRanks if it exists there
                const userRow = await new Promise((resolve, reject) => {
                    db.get('SELECT selectedRanks FROM users WHERE id = ?', [userId], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
                
                let selectedRanks = [];
                if (userRow?.selectedRanks) {
                    try {
                        selectedRanks = JSON.parse(userRow.selectedRanks);
                        if (!Array.isArray(selectedRanks)) selectedRanks = [];
                    } catch {
                        selectedRanks = [];
                    }
                }
                
                const beforeLength = selectedRanks.length;
                selectedRanks = selectedRanks.filter(id => Number(id) !== Number(rankRecord.id));
                const afterLength = selectedRanks.length;
                
                if (beforeLength !== afterLength) {
                    console.log(`[ADMIN] ✓ Removed rank ${rankRecord.id} from selectedRanks (${beforeLength} → ${afterLength})`);
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE users SET selectedRanks = ? WHERE id = ?',
                            [JSON.stringify(selectedRanks), userId],
                            (err) => {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                }
            }
        }
        
        console.log(`[ADMIN] conquista removido do usuário ID ${userId}`);
        auditAdminAction(req, 'admin_remove_rank_success', {
            targetUserId: Number(userId) || null
        });
        res.json({ success: true, message: 'conquista removido com sucesso' });
        
    } catch (error) {
        console.error('[ADMIN] FATAL ERROR removing rank:', error);
        auditAdminAction(req, 'admin_remove_rank_error', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { message: error.message }
        });
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Renomear sua própria conta
router.post('/rename-account', protect, (req, res) => {
    const { firstName, lastName } = req.body;
    const userId = req.user?.id;
    
    console.log(`[ADMIN] Renomeando conta do usuário ${userId}`);
    
    if (!userId) {
        auditAdminAction(req, 'admin_rename_account_rejected', {
            success: false,
            metadata: { reason: 'not_authenticated' }
        });
        return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    if (!firstName || !lastName) {
        auditAdminAction(req, 'admin_rename_account_rejected', {
            success: false,
            targetUserId: Number(userId) || null,
            metadata: { reason: 'missing_name_parts' }
        });
        return res.status(400).json({ success: false, message: 'firstName e lastName são obrigatórios' });
    }
    
    db.run(`UPDATE users SET firstName = ?, lastName = ? WHERE id = ?`, [firstName, lastName, userId], function(err) {
        if (err) {
            console.error('[ADMIN] Erro ao renomear conta:', err);
            auditAdminAction(req, 'admin_rename_account_error', {
                success: false,
                targetUserId: Number(userId) || null,
                metadata: { message: err.message }
            });
            return res.status(500).json({ success: false, message: err.message });
        }
        
        console.log(`[ADMIN] Conta do usuário ID ${userId} renomeada para ${firstName} ${lastName}`);
        auditAdminAction(req, 'admin_rename_account_success', {
            targetUserId: Number(userId) || null,
            metadata: { firstName, lastName }
        });
        res.json({ success: true, message: 'Nome atualizado com sucesso' });
    });
});

// Banir um usuário
router.post('/ban-user', protect, isAdminOrHasAdminRank, (req, res) => {
    const requesterId = req.user.id;
    const { userIdentifier, banType, banDays, reason } = req.body;
    
    console.log(`[ADMIN] Banindo usuário: ${userIdentifier} (tipo: ${banType})`);
    
    if (!userIdentifier || !banType) {
        auditAdminAction(req, 'admin_ban_user_rejected', {
            success: false,
            metadata: { userIdentifier, banType, reason: 'missing_required_fields' }
        });
        return res.status(400).json({ success: false, message: 'userIdentifier e banType são obrigatórios' });
    }
    
    if (banType !== 'suspension' && banType !== 'permanent') {
        auditAdminAction(req, 'admin_ban_user_rejected', {
            success: false,
            metadata: { userIdentifier, banType, reason: 'invalid_ban_type' }
        });
        return res.status(400).json({ success: false, message: 'banType deve ser "suspension" ou "permanent"' });
    }
    
    if (banType === 'suspension' && (!banDays || banDays <= 0)) {
        auditAdminAction(req, 'admin_ban_user_rejected', {
            success: false,
            metadata: { userIdentifier, banType, banDays, reason: 'invalid_suspension_days' }
        });
        return res.status(400).json({ success: false, message: 'banDays é obrigatório para suspensões' });
    }
    
    // Procurar usuário por nickname ou email
    db.get(`SELECT id FROM users WHERE nickname = ? OR email = ?`, [userIdentifier, userIdentifier], async (err, user) => {
        // Não permitir banir o admin (ID 1) se não for o próprio admin
        if (user && user.id === 1 && requesterId !== 1) {
            auditAdminAction(req, 'admin_ban_user_rejected', {
                success: false,
                targetUserId: user.id,
                metadata: { userIdentifier, reason: 'cannot_ban_main_admin' }
            });
            return res.status(403).json({ success: false, message: 'Não pode banir o admin' });
        }
        if (err) {
            console.error('[ADMIN] Erro ao buscar usuário:', err);
            auditAdminAction(req, 'admin_ban_user_error', {
                success: false,
                metadata: { userIdentifier, stage: 'find_user', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        
        if (!user) {
            auditAdminAction(req, 'admin_ban_user_rejected', {
                success: false,
                metadata: { userIdentifier, reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, user.id);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }
        
        // Calcular data de expiração para suspensões
        const expiresAt = banType === 'suspension' 
            ? new Date(Date.now() + banDays * 24 * 60 * 60 * 1000).toISOString()
            : null;
        
        // Criar banimento
        db.run(`
            INSERT INTO bans (userId, banType, suspensionDays, reason, expiresAt, isActive)
            VALUES (?, ?, ?, ?, ?, 1)
        `, [user.id, banType, banType === 'suspension' ? banDays : null, reason || '', expiresAt], function(err) {
            if (err) {
                console.error('[ADMIN] Erro ao criar banimento:', err);
                auditAdminAction(req, 'admin_ban_user_error', {
                    success: false,
                    targetUserId: user.id,
                    metadata: { userIdentifier, banType, stage: 'create_ban', message: err.message }
                });
                return res.status(500).json({ success: false, message: 'Erro ao criar banimento' });
            }
            
            const banTypeLabel = banType === 'suspension' ? `Suspensão por ${banDays} dias` : 'Banimento Permanente';
            console.log(`[ADMIN] ${banTypeLabel} criado para usuário ID ${user.id}`);
            
            // Suspender todas as postagens do usuário banido
            db.all(`SELECT id FROM downloads WHERE userId = ?`, [user.id], (err2, downloads) => {
                if (err2) {
                    console.error('[ADMIN] Erro ao buscar downloads para suspender:', err2);
                } else if (downloads && downloads.length > 0) {
                    const suspensionReason = `Usuário ${banTypeLabel.toLowerCase()}. Postagem temporariamente bloqueada até análise da administração.`;
                    for (const download of downloads) {
                        db.run(
                            `UPDATE downloads SET suspensionStatus = 'suspended', suspendedAt = CURRENT_TIMESTAMP, suspensionReason = ? WHERE id = ?`,
                            [suspensionReason, download.id],
                            (err3) => {
                                if (err3) {
                                    console.error(`[ADMIN] Erro ao suspender download ${download.id}:`, err3);
                                } else {
                                    // Inserir na tabela download_suspensions
                                    db.run(
                                        `INSERT INTO download_suspensions (downloadId, userId, suspendedBy, reason, status)
                                         VALUES (?, ?, ?, ?, 'suspended')`,
                                        [download.id, user.id, requesterId, suspensionReason],
                                        (err4) => {
                                            if (err4) {
                                                console.error(`[ADMIN] Erro ao inserir suspensão para download ${download.id}:`, err4);
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }
                    console.log(`[ADMIN] ${downloads.length} postagens suspensas para usuário banido ID ${user.id}`);
                }
            });
            
            auditAdminAction(req, 'admin_ban_user_success', {
                targetUserId: user.id,
                metadata: { userIdentifier, banType, banDays: banType === 'suspension' ? banDays : null, reason: reason || '' }
            });
            res.json({ success: true, message: `${banTypeLabel} criado com sucesso` });
        });
    });
});

// Listar todos os banimentos
router.get('/bans', protect, isAdminOrHasAdminRank, (req, res) => {
    console.log(`[ADMIN] Listando banimentos`);
    
    db.all(`
        SELECT 
            b.id, 
            b.userId, 
            b.banType, 
            b.suspensionDays, 
            b.reason, 
            b.createdAt, 
            b.expiresAt, 
            b.isActive,
            u.nickname,
            u.email
        FROM bans b
        JOIN users u ON b.userId = u.id
        WHERE b.isActive = 1
        ORDER BY b.createdAt DESC
    `, [], (err, bans) => {
        if (err) {
            console.error('[ADMIN] Erro ao listar banimentos:', err);
            return res.status(500).json({ success: false, message: 'Erro ao listar banimentos' });
        }
        
        // Processar bans para calcular status
        const processedBans = (bans || []).map(ban => ({
            ...ban,
            isExpired: ban.expiresAt && new Date() > new Date(ban.expiresAt)
        }));
        
        console.log(`[ADMIN] ${processedBans.length} banimentos listados`);
        res.json({ success: true, bans: processedBans });
    });
});

// Remover um banimento
router.delete('/unban/:banId', protect, isAdminOrHasAdminRank, (req, res) => {
    const requesterId = req.user.id;
    const { banId } = req.params;
    
    console.log(`[ADMIN] Removendo banimento ID: ${banId}`);
    
    if (!banId) {
        auditAdminAction(req, 'admin_unban_rejected', {
            success: false,
            metadata: { reason: 'missing_ban_id' }
        });
        return res.status(400).json({ success: false, message: 'banId é obrigatório' });
    }
    
    // Verificar se está tentando desbanir o admin
    db.get(`SELECT userId FROM bans WHERE id = ?`, [banId], async (err, ban) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar ban:', err);
            auditAdminAction(req, 'admin_unban_error', {
                success: false,
                metadata: { banId, stage: 'find_ban', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao remover banimento' });
        }
        
        if (!ban) {
            auditAdminAction(req, 'admin_unban_rejected', {
                success: false,
                metadata: { banId, reason: 'ban_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Banimento não encontrado' });
        }
        
        // Não permitir desbanir admin se não for o próprio admin
        if (ban.userId === 1 && requesterId !== 1) {
            auditAdminAction(req, 'admin_unban_rejected', {
                success: false,
                targetUserId: ban.userId,
                metadata: { banId, reason: 'cannot_unban_main_admin' }
            });
            return res.status(403).json({ success: false, message: 'Não pode desbanir o admin' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, ban.userId);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }
        
        db.run(`UPDATE bans SET isActive = 0 WHERE id = ?`, [banId], function(err) {
            if (err) {
                console.error('[ADMIN] Erro ao remover banimento:', err);
                auditAdminAction(req, 'admin_unban_error', {
                    success: false,
                    targetUserId: ban.userId,
                    metadata: { banId, stage: 'update_ban', message: err.message }
                });
                return res.status(500).json({ success: false, message: 'Erro ao remover banimento' });
            }
            
            if (this.changes === 0) {
                auditAdminAction(req, 'admin_unban_rejected', {
                    success: false,
                    targetUserId: ban.userId,
                    metadata: { banId, reason: 'no_rows_updated' }
                });
                return res.status(404).json({ success: false, message: 'Banimento não encontrado' });
            }
            
            console.log(`[ADMIN] Banimento ID ${banId} removido`);
            auditAdminAction(req, 'admin_unban_success', {
                targetUserId: ban.userId,
                metadata: { banId }
            });
            res.json({ success: true, message: 'Banimento removido com sucesso' });
        });
    });
});

// Dar permissão de postagem a um usuário
router.post('/grant-post-permission', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userIdentifier } = req.body;
    const requesterId = Number(req.user?.id);
    
    console.log(`[ADMIN] Concedendo permissão de postagem a: ${userIdentifier}`);
    
    if (!userIdentifier) {
        auditAdminAction(req, 'admin_grant_post_permission_rejected', {
            success: false,
            metadata: { reason: 'missing_user_identifier' }
        });
        return res.status(400).json({ success: false, message: 'userIdentifier é obrigatório' });
    }
    
    // Procurar usuário por nickname ou email
    db.get(`SELECT id, nickname FROM users WHERE nickname = ? OR email = ?`, [userIdentifier, userIdentifier], async (err, user) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar usuário:', err);
            auditAdminAction(req, 'admin_grant_post_permission_error', {
                success: false,
                metadata: { userIdentifier, stage: 'find_user', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        
        if (!user) {
            auditAdminAction(req, 'admin_grant_post_permission_rejected', {
                success: false,
                metadata: { userIdentifier, reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, user.id);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }
        
        // Atualizar permissão
        db.run(`UPDATE users SET canPostDownloads = 1 WHERE id = ?`, [user.id], function(err) {
            if (err) {
                console.error('[ADMIN] Erro ao conceder permissão:', err);
                auditAdminAction(req, 'admin_grant_post_permission_error', {
                    success: false,
                    targetUserId: user.id,
                    metadata: { userIdentifier, stage: 'update_user', message: err.message }
                });
                return res.status(500).json({ success: false, message: err.message });
            }
            
            console.log(`[ADMIN] Permissão de postagem concedida ao usuário ${user.nickname} (ID: ${user.id})`);
            auditAdminAction(req, 'admin_grant_post_permission_success', {
                targetUserId: user.id,
                metadata: { userIdentifier, nickname: user.nickname }
            });
            res.json({ success: true, message: `Permissão concedida a ${user.nickname}` });
        });
    });
});

// Remover permissão de postagem de um usuário
router.post('/revoke-post-permission', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userIdentifier } = req.body;
    const requesterId = Number(req.user?.id);
    
    console.log(`[ADMIN] Removendo permissão de postagem de: ${userIdentifier}`);
    
    if (!userIdentifier) {
        auditAdminAction(req, 'admin_revoke_post_permission_rejected', {
            success: false,
            metadata: { reason: 'missing_user_identifier' }
        });
        return res.status(400).json({ success: false, message: 'userIdentifier é obrigatório' });
    }
    
    // Procurar usuário por nickname ou email
    db.get(`SELECT id, nickname FROM users WHERE nickname = ? OR email = ?`, [userIdentifier, userIdentifier], async (err, user) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar usuário:', err);
            auditAdminAction(req, 'admin_revoke_post_permission_error', {
                success: false,
                metadata: { userIdentifier, stage: 'find_user', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        
        if (!user) {
            auditAdminAction(req, 'admin_revoke_post_permission_rejected', {
                success: false,
                metadata: { userIdentifier, reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hierarchyCheck = await canManageTargetUser(requesterId, user.id);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }
        
        // Atualizar permissão
        db.run(`UPDATE users SET canPostDownloads = 0 WHERE id = ?`, [user.id], function(err) {
            if (err) {
                console.error('[ADMIN] Erro ao remover permissão:', err);
                auditAdminAction(req, 'admin_revoke_post_permission_error', {
                    success: false,
                    targetUserId: user.id,
                    metadata: { userIdentifier, stage: 'update_user', message: err.message }
                });
                return res.status(500).json({ success: false, message: err.message });
            }
            
            console.log(`[ADMIN] Permissão de postagem removida do usuário ${user.nickname} (ID: ${user.id})`);
            auditAdminAction(req, 'admin_revoke_post_permission_success', {
                targetUserId: user.id,
                metadata: { userIdentifier, nickname: user.nickname }
            });
            res.json({ success: true, message: `Permissão removida de ${user.nickname}` });
        });
    });
});

// Listar usuários com permissões individuais (downloads + perfil + admin)
router.get('/users-with-post-permission', protect, isAdminOrHasAdminRank, (req, res) => {
    console.log('[ADMIN] Listando usuários com permissões individuais');
    
    db.all(`
        SELECT 
            id, 
            firstName, 
            lastName, 
            nickname, 
            email, 
            canPostDownloads,
            canManageDownloads,
            canOrderFixedRanks,
            canAccessAdminPanel,
            canUseAnimatedProfile,
            canChangeRankColor,
            animatedProfileEnabled,
            animatedProfileTheme,
            (SELECT COUNT(*) FROM downloads WHERE userId = users.id) as downloadCount,
            createdAt 
        FROM users 
        WHERE canPostDownloads = 1
           OR canManageDownloads = 1
           OR canOrderFixedRanks = 1
           OR canAccessAdminPanel = 1
           OR canUseAnimatedProfile = 1
           OR canChangeRankColor = 1
        ORDER BY nickname ASC
    `, [], (err, users) => {
        if (err) {
            console.error('[ADMIN] Erro ao listar usuários:', err);
            return res.status(500).json({ success: false, message: 'Erro ao listar usuários' });
        }
        
        console.log(`[ADMIN] ${users ? users.length : 0} usuários com permissões individuais`);
        res.json({ success: true, users: users || [] });
    });
});

// Definir permissões individuais de usuário (postagens/downloads/perfil/admin)
router.post('/set-user-permissions', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userIdentifier, permissions } = req.body || {};

    if (!userIdentifier) {
        return res.status(400).json({ success: false, message: 'userIdentifier é obrigatório' });
    }

    const nextPermissions = {
        canPostDownloads: toFlag(permissions?.canPostDownloads),
        canManageDownloads: toFlag(permissions?.canManageDownloads),
        canOrderFixedRanks: toFlag(permissions?.canOrderFixedRanks),
        canAccessAdminPanel: toFlag(permissions?.canAccessAdminPanel),
        canUseAnimatedProfile: toFlag(permissions?.canUseAnimatedProfile),
        canChangeRankColor: toFlag(permissions?.canChangeRankColor)
    };

    db.get(
        `SELECT id, nickname, email, animatedProfileEnabled, animatedProfileTheme
         FROM users
         WHERE nickname = ? OR email = ?`,
        [userIdentifier, userIdentifier],
        async (findErr, user) => {
        if (findErr) {
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        if (!user) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const hierarchyCheck = await canManageTargetUser(req.user?.id, user.id);
        if (!hierarchyCheck.allowed) {
            return res.status(403).json({ success: false, message: hierarchyCheck.message });
        }

        const isOwner = String(user.email || '').toLowerCase() === OWNER_EMAIL;
        if (isOwner) {
            nextPermissions.canOrderFixedRanks = true;
            nextPermissions.canAccessAdminPanel = true;
        }

        const canUseAnimatedProfile = nextPermissions.canUseAnimatedProfile ? 1 : 0;
        const animatedProfileEnabled = nextPermissions.canUseAnimatedProfile
            ? (Number(user.animatedProfileEnabled) === 1 ? 1 : 0)
            : 0;
        const animatedProfileTheme = nextPermissions.canUseAnimatedProfile
            ? String(user.animatedProfileTheme || 'auto')
            : 'auto';

        db.run(
            `UPDATE users
             SET canPostDownloads = ?,
                 canManageDownloads = ?,
                 canOrderFixedRanks = ?,
                 canAccessAdminPanel = ?,
                 canUseAnimatedProfile = ?,
                 canChangeRankColor = ?,
                 animatedProfileEnabled = ?,
                 animatedProfileTheme = ?
             WHERE id = ?`,
            [
                nextPermissions.canPostDownloads ? 1 : 0,
                nextPermissions.canManageDownloads ? 1 : 0,
                nextPermissions.canOrderFixedRanks ? 1 : 0,
                nextPermissions.canAccessAdminPanel ? 1 : 0,
                canUseAnimatedProfile,
                nextPermissions.canChangeRankColor ? 1 : 0,
                animatedProfileEnabled,
                animatedProfileTheme,
                user.id
            ],
            function(updateErr) {
                if (updateErr) {
                    return res.status(500).json({ success: false, message: updateErr.message });
                }

                return res.json({
                    success: true,
                    message: `Permissões atualizadas para ${user.nickname}`,
                    permissions: {
                        canPostDownloads: nextPermissions.canPostDownloads,
                        canManageDownloads: nextPermissions.canManageDownloads,
                        canOrderFixedRanks: nextPermissions.canOrderFixedRanks,
                        canAccessAdminPanel: nextPermissions.canAccessAdminPanel,
                        canUseAnimatedProfile: nextPermissions.canUseAnimatedProfile,
                        canChangeRankColor: nextPermissions.canChangeRankColor
                    }
                });
            }
        );
    });
});

// Dar permissao para ordenar conquistas fixos (isVisible = 0)
router.post('/grant-fixed-rank-order', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userIdentifier } = req.body;
    if (!userIdentifier) {
        auditAdminAction(req, 'admin_grant_fixed_order_rejected', {
            success: false,
            metadata: { reason: 'missing_user_identifier' }
        });
        return res.status(400).json({ success: false, message: 'userIdentifier é obrigatório' });
    }

    db.get(`SELECT id, nickname, email FROM users WHERE nickname = ? OR email = ?`, [userIdentifier, userIdentifier], (err, user) => {
        if (err) {
            auditAdminAction(req, 'admin_grant_fixed_order_error', {
                success: false,
                metadata: { userIdentifier, stage: 'find_user', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        if (!user) {
            auditAdminAction(req, 'admin_grant_fixed_order_rejected', {
                success: false,
                metadata: { userIdentifier, reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        db.run(`UPDATE users SET canOrderFixedRanks = 1 WHERE id = ?`, [user.id], function(updateErr) {
            if (updateErr) {
                auditAdminAction(req, 'admin_grant_fixed_order_error', {
                    success: false,
                    targetUserId: user.id,
                    metadata: { userIdentifier, stage: 'update_user', message: updateErr.message }
                });
                return res.status(500).json({ success: false, message: updateErr.message });
            }
            auditAdminAction(req, 'admin_grant_fixed_order_success', {
                targetUserId: user.id,
                metadata: { userIdentifier, nickname: user.nickname }
            });
            return res.json({ success: true, message: `Permissão de ordenar conquistas fixos concedida a ${user.nickname}` });
        });
    });
});

// Remover permissao para ordenar conquistas fixos
router.post('/revoke-fixed-rank-order', protect, isAdminOrHasAdminRank, (req, res) => {
    const { userIdentifier } = req.body;
    if (!userIdentifier) {
        auditAdminAction(req, 'admin_revoke_fixed_order_rejected', {
            success: false,
            metadata: { reason: 'missing_user_identifier' }
        });
        return res.status(400).json({ success: false, message: 'userIdentifier é obrigatório' });
    }

    db.get(`SELECT id, nickname, email FROM users WHERE nickname = ? OR email = ?`, [userIdentifier, userIdentifier], (err, user) => {
        if (err) {
            auditAdminAction(req, 'admin_revoke_fixed_order_error', {
                success: false,
                metadata: { userIdentifier, stage: 'find_user', message: err.message }
            });
            return res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
        }
        if (!user) {
            auditAdminAction(req, 'admin_revoke_fixed_order_rejected', {
                success: false,
                metadata: { userIdentifier, reason: 'target_not_found' }
            });
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }
        if (String(user.email || '').toLowerCase() === OWNER_EMAIL) {
            auditAdminAction(req, 'admin_revoke_fixed_order_rejected', {
                success: false,
                targetUserId: user.id,
                targetEmail: user.email,
                metadata: { userIdentifier, reason: 'owner_permission_is_fixed' }
            });
            return res.status(400).json({ success: false, message: 'Permissão do dono da conta é fixa e não pode ser removida' });
        }

        db.run(`UPDATE users SET canOrderFixedRanks = 0 WHERE id = ?`, [user.id], function(updateErr) {
            if (updateErr) {
                auditAdminAction(req, 'admin_revoke_fixed_order_error', {
                    success: false,
                    targetUserId: user.id,
                    metadata: { userIdentifier, stage: 'update_user', message: updateErr.message }
                });
                return res.status(500).json({ success: false, message: updateErr.message });
            }
            auditAdminAction(req, 'admin_revoke_fixed_order_success', {
                targetUserId: user.id,
                metadata: { userIdentifier, nickname: user.nickname }
            });
            return res.json({ success: true, message: `Permissão de ordenar conquistas fixos removida de ${user.nickname}` });
        });
    });
});

// Upload de imagem/GIF para fundo de conquistas (admin)
router.post('/achievement-backgrounds/upload', protect, isAdminOrHasAdminRank, (req, res) => {
    uploadAchievementBackground.single('backgroundImage')(req, res, (err) => {
        if (err?.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Arquivo muito grande. Limite de 20MB.'
            });
        }

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Erro no upload da imagem.'
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
            backgroundImageUrl: `/uploads/achievement-backgrounds/${req.file.filename}`
        });
    });
});

// Buscar fundos de conquistas (publico)
router.get('/achievement-backgrounds', async (req, res) => {
    try {
        const rows = await dbAllAsync(
            `SELECT settingKey, settingValue
             FROM site_settings
             WHERE settingKey IN (?, ?, ?)`,
            [
                ACHIEVEMENT_BACKGROUND_SETTING_KEYS.like_achievement,
                ACHIEVEMENT_BACKGROUND_SETTING_KEYS.post_achievement,
                ACHIEVEMENT_BACKGROUND_SETTING_KEYS.animation_modes
            ]
        );

        const rankRows = await dbAllAsync(
            `SELECT name, rankGroup, backgroundImage
             FROM custom_ranks
             WHERE rankGroup IN (?, ?)
               AND COALESCE(TRIM(backgroundImage), '') <> ''`,
            ['like_achievement', 'post_achievement']
        );

        const rankCards = {
            like_achievement: {},
            post_achievement: {}
        };
        rankRows.forEach((row) => {
            const group = String(row?.rankGroup || '').trim();
            if (group !== 'like_achievement' && group !== 'post_achievement') return;
            const nameKey = normalizeAchievementNameKey(row?.name || '');
            const bgValue = String(row?.backgroundImage || '').trim();
            if (!nameKey || !bgValue) return;
            rankCards[group][nameKey] = bgValue;
        });

        const mapped = mapAchievementBackgroundRows(rows);
        mapped.rankCards = rankCards;

        return res.json({
            success: true,
            backgrounds: mapped
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao carregar fundos de conquistas:', error);
        return res.status(500).json({ success: false, message: 'Erro ao carregar fundos de conquistas' });
    }
});

// Atualizar fundo por categoria de conquistas (admin)
router.put('/achievement-backgrounds/group', protect, isAdminOrHasAdminRank, async (req, res) => {
    const groupKey = String(req.body?.groupKey || '').trim();
    const normalizedBackgroundUrl = normalizeAchievementBackgroundUrl(req.body?.backgroundImageUrl);

    if (!ALLOWED_ACHIEVEMENT_TARGET_GROUPS.has(groupKey)) {
        return res.status(400).json({ success: false, message: 'Categoria de conquista inválida.' });
    }

    const settingKey = ACHIEVEMENT_BACKGROUND_SETTING_KEYS[groupKey];
    if (!settingKey) {
        return res.status(400).json({ success: false, message: 'Categoria não suportada.' });
    }

    try {
        await dbRunAsync(
            `INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [settingKey, normalizedBackgroundUrl]
        );

        if (groupKey === 'post_achievement' || groupKey === 'like_achievement') {
            await dbRunAsync(
                `UPDATE custom_ranks
                 SET backgroundImage = ?
                 WHERE rankGroup = ?`,
                [normalizedBackgroundUrl || null, groupKey]
            );
        }

        auditAdminAction(req, 'admin_update_achievement_group_background', {
            metadata: { groupKey, hasBackground: Boolean(normalizedBackgroundUrl) }
        });

        return res.json({
            success: true,
            message: 'Fundo da categoria atualizado com sucesso.',
            groupKey,
            backgroundImageUrl: normalizedBackgroundUrl
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao atualizar fundo de categoria:', error);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar fundo da categoria.' });
    }
});

// Atualizar modo de animação de card específico (admin)
router.put('/achievement-backgrounds/animation-mode', protect, isAdminOrHasAdminRank, async (req, res) => {
    const groupKey = String(req.body?.groupKey || '').trim();
    const rankName = String(req.body?.rankName || '').trim();
    const rankNameKey = normalizeAchievementNameKey(rankName);
    const animationMode = normalizeAchievementCardAnimationMode(req.body?.animationMode);

    if (!ALLOWED_ACHIEVEMENT_CARD_ANIMATION_GROUPS.has(groupKey)) {
        return res.status(400).json({ success: false, message: 'Categoria de conquista inválida.' });
    }
    if (!rankNameKey) {
        return res.status(400).json({ success: false, message: 'Conquista inválida.' });
    }
    if (!animationMode) {
        return res.status(400).json({ success: false, message: 'Modo de animação inválido.' });
    }

    const animationKey = buildAchievementCardAnimationModeKey(groupKey, rankNameKey);
    if (!animationKey) {
        return res.status(400).json({ success: false, message: 'Configuração de animação inválida.' });
    }

    try {
        if (groupKey === 'general' && isFounderAchievementKey(rankNameKey)) {
            const requester = await dbGetAsync(
                `SELECT email
                 FROM users
                 WHERE id = ?
                 LIMIT 1`,
                [req.user.id]
            );
            if (!isOwnerEmail(requester?.email)) {
                return res.status(403).json({ success: false, message: 'Apenas o fundador pode editar esta conquista.' });
            }
        }

        const row = await dbGetAsync(
            `SELECT settingValue
             FROM site_settings
             WHERE settingKey = ?
             LIMIT 1`,
            [ACHIEVEMENT_BACKGROUND_SETTING_KEYS.animation_modes]
        );

        const currentModes = mapAchievementBackgroundRows([
            {
                settingKey: ACHIEVEMENT_BACKGROUND_SETTING_KEYS.animation_modes,
                settingValue: String(row?.settingValue || '')
            }
        ]).animationModes;

        if (animationMode === 'hover') {
            delete currentModes[animationKey];
        } else {
            currentModes[animationKey] = animationMode;
        }

        await dbRunAsync(
            `INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [
                ACHIEVEMENT_BACKGROUND_SETTING_KEYS.animation_modes,
                JSON.stringify(currentModes)
            ]
        );

        auditAdminAction(req, 'admin_update_achievement_card_animation_mode', {
            metadata: {
                groupKey,
                rankName,
                rankNameKey,
                animationMode
            }
        });

        return res.json({
            success: true,
            message: 'Modo de animação atualizado com sucesso.',
            groupKey,
            rankName,
            animationMode,
            animationModes: currentModes
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao atualizar modo de animação da conquista:', error);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar modo de animação da conquista.' });
    }
});

// Atualizar fundo de conquista personalizada especifica (admin)
router.put('/achievement-backgrounds/custom/:rankId', protect, isAdminOrHasAdminRank, async (req, res) => {
    const rankId = Number(req.params?.rankId);
    const normalizedBackgroundUrl = normalizeAchievementBackgroundUrl(req.body?.backgroundImageUrl);

    if (!Number.isInteger(rankId) || rankId <= 0) {
        return res.status(400).json({ success: false, message: 'ID de conquista inválido.' });
    }

    try {
        const rank = await dbGetAsync(
            `SELECT id, name, rankGroup, isDefault
             FROM custom_ranks
             WHERE id = ?
             LIMIT 1`,
            [rankId]
        );

        if (!rank || Number(rank.isDefault) === 1) {
            return res.status(404).json({ success: false, message: 'Conquista personalizada não encontrada.' });
        }

        await dbRunAsync(
            `UPDATE custom_ranks
             SET backgroundImage = ?
             WHERE id = ? AND isDefault = 0`,
            [normalizedBackgroundUrl || null, rankId]
        );

        auditAdminAction(req, 'admin_update_custom_achievement_background', {
            metadata: { rankId, rankName: rank.name, hasBackground: Boolean(normalizedBackgroundUrl) }
        });

        return res.json({
            success: true,
            message: 'Fundo da conquista personalizada atualizado com sucesso.',
            rankId,
            backgroundImageUrl: normalizedBackgroundUrl
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao atualizar fundo de conquista personalizada:', error);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar fundo da conquista personalizada.' });
    }
});

// Buscar overrides de conquistas manuais (ex.: Fundador)
router.get('/manual-rank-overrides', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const row = await dbGetAsync(
            `SELECT settingValue
             FROM site_settings
             WHERE settingKey = ?
             LIMIT 1`,
            [MANUAL_RANK_OVERRIDES_SETTING_KEY]
        );

        const parsed = safeJsonParse(row?.settingValue);
        const overrides = parsed && typeof parsed === 'object' ? parsed : {};
        return res.json({ success: true, overrides });
    } catch (error) {
        console.error('[ADMIN] Erro ao buscar overrides de conquistas manuais:', error);
        return res.status(500).json({ success: false, message: 'Erro ao buscar overrides.' });
    }
});

// Atualizar override de conquista manual (apenas fundador)
router.put('/manual-rank-overrides', protect, isAdminOrHasAdminRank, async (req, res) => {
    try {
        const requester = await dbGetAsync(
            `SELECT email
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [req.user.id]
        );
        if (!isOwnerEmail(requester?.email)) {
            return res.status(403).json({ success: false, message: 'Apenas o fundador pode editar esta conquista.' });
        }

        const targetRankName = String(req.body?.rankName || '').trim();
        const targetRankKey = normalizeAchievementNameKey(targetRankName);
        if (!targetRankKey || !isFounderAchievementKey(targetRankKey)) {
            return res.status(400).json({ success: false, message: 'Conquista manual inválida.' });
        }

        const payload = sanitizeManualRankOverridePayload(req.body);
        if (!payload.name || !payload.description || !payload.customText) {
            return res.status(400).json({ success: false, message: 'Nome, descrição e texto customizável são obrigatórios.' });
        }
        if (req.body?.color !== undefined && !payload.color) {
            return res.status(400).json({ success: false, message: 'Cor inválida. Use formato HEX (#RRGGBB).' });
        }
        if (req.body?.backgroundImage !== undefined && String(req.body.backgroundImage || '').trim().length > 2048) {
            return res.status(400).json({ success: false, message: 'O endereço do fundo é inválido.' });
        }
        const payloadNameKey = normalizeAchievementNameKey(payload.name);
        if (!isFounderAchievementKey(payloadNameKey)) {
            return res.status(400).json({ success: false, message: 'O nome precisa conter "Fundador".' });
        }

        const row = await dbGetAsync(
            `SELECT settingValue
             FROM site_settings
             WHERE settingKey = ?
             LIMIT 1`,
            [MANUAL_RANK_OVERRIDES_SETTING_KEY]
        );
        const parsed = safeJsonParse(row?.settingValue);
        const overrides = parsed && typeof parsed === 'object' ? parsed : {};

        const currentOverride = overrides[FOUNDER_ACHIEVEMENT_NAME_KEY]
            && typeof overrides[FOUNDER_ACHIEVEMENT_NAME_KEY] === 'object'
            ? overrides[FOUNDER_ACHIEVEMENT_NAME_KEY]
            : {};
        overrides[FOUNDER_ACHIEVEMENT_NAME_KEY] = {
            ...currentOverride,
            name: payload.name,
            description: payload.description,
            customText: payload.customText,
            ...(payload.color ? { color: payload.color } : {}),
            ...(payload.backgroundImage !== undefined ? { backgroundImage: payload.backgroundImage } : {})
        };

        await dbRunAsync(
            `INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [MANUAL_RANK_OVERRIDES_SETTING_KEY, JSON.stringify(overrides)]
        );

        auditAdminAction(req, 'admin_update_manual_rank_override', {
            metadata: {
                rankKey: FOUNDER_ACHIEVEMENT_NAME_KEY,
                hasBackground: Boolean(overrides[FOUNDER_ACHIEVEMENT_NAME_KEY].backgroundImage),
                hasCustomColor: Boolean(overrides[FOUNDER_ACHIEVEMENT_NAME_KEY].color)
            }
        });

        return res.json({
            success: true,
            message: 'Conquista manual atualizada com sucesso.',
            overrides
        });
    } catch (error) {
        console.error('[ADMIN] Erro ao atualizar override de conquista manual:', error);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar override.' });
    }
});

// Buscar links da comunidade (publico)
router.get('/social-links', (req, res) => {
    ensureSocialLinksDefaults(() => {
        db.all(`
            SELECT settingKey, settingValue
            FROM site_settings
            WHERE settingKey IN ('whatsapp_url', 'discord_url', 'whatsapp_tooltip', 'discord_tooltip', 'whatsapp_enabled', 'discord_enabled', 'navbar_buttons')
        `, [], (err, rows) => {
            if (err) {
                console.error('[ADMIN] Erro ao buscar links sociais:', err);
                return res.status(500).json({ success: false, message: 'Erro ao carregar links da comunidade' });
            }

            const settings = Object.fromEntries((rows || []).map((row) => [row.settingKey, row.settingValue]));
            const links = buildSocialLinks(settings);
            if (!Array.isArray(links.navbarButtons)) {
                links.navbarButtons = [];
            }
            return res.json({
                success: true,
                links
            });
        });
    });
});

// Atualizar links da comunidade (admin)
router.put('/social-links', protect, isAdminOrHasAdminRank, (req, res) => {
    const whatsappUrl = normalizeCommunityUrl(req.body?.whatsappUrl, DEFAULT_WHATSAPP_URL);
    const discordUrl = normalizeCommunityUrl(req.body?.discordUrl, DEFAULT_DISCORD_URL);
    const whatsappTooltip = typeof req.body?.whatsappTooltip === 'string' ? String(req.body.whatsappTooltip).trim() : null;
    console.log('[ADMIN] Received social-links update payload:', {
        whatsappUrl,
        discordUrl,
        whatsappTooltip,
        discordTooltip: req.body?.discordTooltip,
        whatsappEnabled: req.body?.whatsappEnabled,
        discordEnabled: req.body?.discordEnabled,
        navbarButtons: req.body?.navbarButtons
    });
    const discordTooltip = typeof req.body?.discordTooltip === 'string' ? String(req.body.discordTooltip).trim() : null;
    const whatsappEnabled = req.body?.whatsappEnabled === false || req.body?.whatsappEnabled === '0' || req.body?.whatsappEnabled === 0 ? false : (req.body?.whatsappEnabled === true || req.body?.whatsappEnabled === '1' || req.body?.whatsappEnabled === 1 ? true : null);
    const discordEnabled = req.body?.discordEnabled === false || req.body?.discordEnabled === '0' || req.body?.discordEnabled === 0 ? false : (req.body?.discordEnabled === true || req.body?.discordEnabled === '1' || req.body?.discordEnabled === 1 ? true : null);
    const navbarButtons = Array.isArray(req.body?.navbarButtons)
        ? req.body.navbarButtons.map((button) => {
            return {
                label: String(button?.label || '').trim(),
                url: normalizeCommunityUrl(button?.url, '') || '',
                icon: typeof button?.icon === 'string' ? String(button.icon).trim() : '',
                description: typeof button?.description === 'string' ? String(button.description).trim() : '',
                position: typeof button?.position === 'string' ? String(button.position).trim() : 'beforeLogin',
                enabled: button?.enabled !== false && button?.enabled !== '0' && button?.enabled !== 0
            };
        }).filter((button) => button.label && button.url)
        : null;

    console.log('[ADMIN] Normalized navbarButtons before save:', navbarButtons);

    const hasInvalidNavbarButtons = Array.isArray(req.body?.navbarButtons)
        ? req.body.navbarButtons.some((button) => {
            const label = String(button?.label || '').trim();
            const rawUrl = String(button?.url || '').trim();
            const url = normalizeCommunityUrl(rawUrl, '') || '';
            const icon = typeof button?.icon === 'string' ? String(button.icon).trim() : '';
            const enabled = button?.enabled !== false && button?.enabled !== '0' && button?.enabled !== 0;
            const isActive = Boolean(label || rawUrl || icon || enabled === false);
            return isActive && (!label || !url);
        })
        : false;

    if (hasInvalidNavbarButtons) {
        auditAdminAction(req, 'admin_update_social_links_rejected', {
            success: false,
            metadata: { reason: 'invalid_navbar_buttons' }
        });
        return res.status(400).json({ success: false, message: 'Existem botões extras incompletos ou com URLs inválidas.' });
    }

    if (!whatsappUrl || !discordUrl) {
        auditAdminAction(req, 'admin_update_social_links_rejected', {
            success: false,
            metadata: { reason: 'invalid_urls' }
        });
        return res.status(400).json({ success: false, message: 'Informe URLs válidas para WhatsApp e Discord' });
    }

    db.all(`
        SELECT settingKey, settingValue
        FROM site_settings
        WHERE settingKey IN ('whatsapp_tooltip', 'discord_tooltip', 'whatsapp_enabled', 'discord_enabled')
    `, [], (settingsErr, settingsRows) => {
        if (settingsErr) {
            console.error('[ADMIN] Erro ao ler configurações de tooltip:', settingsErr);
            return res.status(500).json({ success: false, message: 'Erro interno ao atualizar links da comunidade' });
        }

        const settings = Object.fromEntries((settingsRows || []).map((row) => [row.settingKey, row.settingValue]));
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run(`
                INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                VALUES ('whatsapp_url', ?, CURRENT_TIMESTAMP)
            `, [whatsappUrl], (whatsErr) => {
                if (whatsErr) {
                    console.error('[ADMIN] Erro ao salvar whatsapp_url:', whatsErr);
                    auditAdminAction(req, 'admin_update_social_links_error', {
                        success: false,
                        metadata: { stage: 'save_whatsapp', message: whatsErr.message }
                    });
                    db.run('ROLLBACK');
                    return res.status(500).json({ success: false, message: 'Erro ao salvar link do WhatsApp' });
                }

                db.run(`
                    INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                    VALUES ('discord_url', ?, CURRENT_TIMESTAMP)
                `, [discordUrl], (discordErr) => {
                    if (discordErr) {
                        console.error('[ADMIN] Erro ao salvar discord_url:', discordErr);
                        auditAdminAction(req, 'admin_update_social_links_error', {
                            success: false,
                            metadata: { stage: 'save_discord', message: discordErr.message }
                        });
                        db.run('ROLLBACK');
                        return res.status(500).json({ success: false, message: 'Erro ao salvar link do Discord' });
                    }

                    const saveTooltips = (next) => {
                        if (whatsappTooltip !== null) {
                            db.run(`
                                INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                                VALUES ('whatsapp_tooltip', ?, CURRENT_TIMESTAMP)
                            `, [whatsappTooltip], (tooltipErr) => {
                                if (tooltipErr) {
                                    console.error('[ADMIN] Erro ao salvar whatsapp_tooltip:', tooltipErr);
                                    auditAdminAction(req, 'admin_update_social_links_error', {
                                        success: false,
                                        metadata: { stage: 'save_whatsapp_tooltip', message: tooltipErr.message }
                                    });
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ success: false, message: 'Erro ao salvar descrição do WhatsApp' });
                                }
                                next();
                            });
                        } else {
                            next();
                        }
                    };

                    const saveDiscordTooltip = (next) => {
                        if (discordTooltip !== null) {
                            db.run(`
                                INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                                VALUES ('discord_tooltip', ?, CURRENT_TIMESTAMP)
                            `, [discordTooltip], (tooltipErr) => {
                                if (tooltipErr) {
                                    console.error('[ADMIN] Erro ao salvar discord_tooltip:', tooltipErr);
                                    auditAdminAction(req, 'admin_update_social_links_error', {
                                        success: false,
                                        metadata: { stage: 'save_discord_tooltip', message: tooltipErr.message }
                                    });
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ success: false, message: 'Erro ao salvar descrição do Discord' });
                                }
                                next();
                            });
                        } else {
                            next();
                        }
                    };

                    const saveEnabledFlags = (next) => {
                        const saveWhatsappEnabled = (callback) => {
                            if (whatsappEnabled !== null) {
                                db.run(`
                                    INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                                    VALUES ('whatsapp_enabled', ?, CURRENT_TIMESTAMP)
                                `, [whatsappEnabled ? '1' : '0'], (enabledErr) => {
                                    if (enabledErr) {
                                        console.error('[ADMIN] Erro ao salvar whatsapp_enabled:', enabledErr);
                                        auditAdminAction(req, 'admin_update_social_links_error', {
                                            success: false,
                                            metadata: { stage: 'save_whatsapp_enabled', message: enabledErr.message }
                                        });
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ success: false, message: 'Erro ao salvar estado do WhatsApp' });
                                    }
                                    callback();
                                });
                            } else {
                                callback();
                            }
                        };

                        const saveDiscordEnabled = (callback) => {
                            if (discordEnabled !== null) {
                                db.run(`
                                    INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                                    VALUES ('discord_enabled', ?, CURRENT_TIMESTAMP)
                                `, [discordEnabled ? '1' : '0'], (enabledErr) => {
                                    if (enabledErr) {
                                        console.error('[ADMIN] Erro ao salvar discord_enabled:', enabledErr);
                                        auditAdminAction(req, 'admin_update_social_links_error', {
                                            success: false,
                                            metadata: { stage: 'save_discord_enabled', message: enabledErr.message }
                                        });
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ success: false, message: 'Erro ao salvar estado do Discord' });
                                    }
                                    callback();
                                });
                            } else {
                                callback();
                            }
                        };

                        saveWhatsappEnabled(() => {
                            saveDiscordEnabled(next);
                        });
                    };

                    saveTooltips(() => {
                        saveDiscordTooltip(() => {
                            saveEnabledFlags(() => {
                            const saveNavbarButtons = (next) => {
                                if (navbarButtons !== null) {
                                    db.run(`
                                        INSERT OR REPLACE INTO site_settings (settingKey, settingValue, updatedAt)
                                        VALUES ('navbar_buttons', ?, CURRENT_TIMESTAMP)
                                    `, [JSON.stringify(navbarButtons)], (buttonsErr) => {
                                        if (buttonsErr) {
                                            console.error('[ADMIN] Erro ao salvar navbar_buttons:', buttonsErr);
                                            auditAdminAction(req, 'admin_update_social_links_error', {
                                                success: false,
                                                metadata: { stage: 'save_navbar_buttons', message: buttonsErr.message }
                                            });
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ success: false, message: 'Erro ao salvar botões da navbar' });
                                        }
                                        next();
                                    });
                                } else {
                                    next();
                                }
                            };

                            saveNavbarButtons(() => {
                                db.run('COMMIT', (commitErr) => {
                                    if (commitErr) {
                                        console.error('[ADMIN] Erro ao finalizar atualização de links:', commitErr);
                                        auditAdminAction(req, 'admin_update_social_links_error', {
                                            success: false,
                                            metadata: { stage: 'commit', message: commitErr.message }
                                        });
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ success: false, message: 'Erro ao salvar links da comunidade' });
                                    }

                                    db.all(`
                                        SELECT settingKey, settingValue
                                        FROM site_settings
                                        WHERE settingKey IN ('whatsapp_url', 'discord_url', 'whatsapp_tooltip', 'discord_tooltip', 'whatsapp_enabled', 'discord_enabled', 'navbar_buttons')
                                    `, [], (updatedErr, updatedRows) => {
                                        if (updatedErr) {
                                            console.error('[ADMIN] Erro ao ler links atualizados:', updatedErr);
                                            auditAdminAction(req, 'admin_update_social_links_error', {
                                                success: false,
                                                metadata: { stage: 'read_updated_links', message: updatedErr.message }
                                            });
                                            return res.status(500).json({ success: false, message: 'Erro ao ler links atualizados' });
                                        }

                                        const updatedSettings = Object.fromEntries((updatedRows || []).map((row) => [row.settingKey, row.settingValue]));
                                        const updatedLinks = buildSocialLinks(updatedSettings);
                                        if (!Array.isArray(updatedLinks.navbarButtons)) {
                                            updatedLinks.navbarButtons = [];
                                        }

                                        auditAdminAction(req, 'admin_update_social_links_success', {
                                            metadata: { whatsappUrl, discordUrl, whatsappTooltip, discordTooltip, whatsappEnabled, discordEnabled, navbarButtons }
                                        });
                                        return res.json({
                                            success: true,
                                            message: 'Links da comunidade atualizados com sucesso',
                                            links: updatedLinks
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
});

// ====== ENDPOINTS DE SUSPENSÃO DE POSTAGENS ======

// Suspender uma postagem
router.post('/suspend-download/:downloadId', protect, isAdminOrHasAdminRank, async (req, res) => {
    const adminId = req.user.id;
    const { downloadId } = req.params;
    const { reason } = req.body;

    if (!downloadId || !reason) {
        return res.status(400).json({ success: false, message: 'downloadId e reason são obrigatórios' });
    }

    try {
        // Obter hierarquia do usuário admin
        const adminRole = await getUserHighestStaffRole(adminId);
        const adminHierarchyLevel = adminRole?.level || 0;
        const ticketColor = '#F97316'; // Laranja para suspensão

        // Verificar se o download existe
        db.get(`SELECT userId FROM downloads WHERE id = ?`, [downloadId], (err, download) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar download:', err);
            return res.status(500).json({ success: false, message: 'Erro ao buscar download' });
        }

        if (!download) {
            return res.status(404).json({ success: false, message: 'Download não encontrado' });
        }

        const userId = download.userId;

        // Verificar se já existe uma suspensão para esta postagem
        db.get(`SELECT id, userTicketId FROM download_suspensions WHERE downloadId = ?`, [downloadId], (checkErr, existingSuspension) => {
            if (checkErr) {
                console.error('[ADMIN] Erro ao verificar suspensão existente:', checkErr);
                return res.status(500).json({ success: false, message: 'Erro ao verificar suspensão' });
            }

            if (existingSuspension) {
                // Já existe suspensão - atualizar apenas o motivo e data
                db.run(
                    `UPDATE download_suspensions 
                     SET reason = ?, suspendedBy = ?, createdAt = CURRENT_TIMESTAMP, status = 'suspended'
                     WHERE downloadId = ?`,
                    [reason, adminId, downloadId],
                    (updateSuspErr) => {
                        if (updateSuspErr) {
                            console.error('[ADMIN] Erro ao atualizar suspensão:', updateSuspErr);
                            return res.status(500).json({ success: false, message: 'Erro ao atualizar suspensão' });
                        }

                        // Atualizar status no downloads
                        db.run(
                            `UPDATE downloads SET suspensionStatus = 'suspended', suspendedAt = CURRENT_TIMESTAMP, suspensionReason = ? WHERE id = ?`,
                            [reason, downloadId],
                            (updateErr) => {
                                if (updateErr) {
                                    console.error('[ADMIN] Erro ao atualizar download:', updateErr);
                                    return res.status(500).json({ success: false, message: 'Erro ao atualizar status do download' });
                                }

                                auditAdminAction(req, 'admin_suspend_download_success', {
                                    targetDownloadId: downloadId,
                                    targetUserId: userId,
                                    metadata: { reason, updated: true }
                                });

                                res.json({ success: true, message: 'Suspensão atualizada com sucesso', ticketId: existingSuspension.userTicketId });
                            }
                        );
                    }
                );
            } else {
                // Novo caso - criar ticket, suspensão e notificação
                // Criar ticket para o usuário
                db.run(
                    `INSERT INTO admin_tickets (userId, fromUserId, title, message, ticketColor, fromUserHierarchyLevel)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [userId, adminId, 'Postagem Suspensa', `**Sua postagem foi suspendida**\n\n**Motivo:** ${reason}\n\n**O que fazer agora?**\n• Você pode editar sua postagem para fazer as alterações necessárias\n• Após editar, você pode solicitar uma revisão da nossa equipe\n• Enquanto a postagem estiver suspensa, seus seguidores não conseguirão visualizá-la\n• Se você tiver dúvidas sobre a suspensão, entre em contato com nosso suporte imediatamente\n\nTemos certeza que você consegue resolver isso!`, ticketColor, adminHierarchyLevel],
                    function(ticketErr) {
                        if (ticketErr) {
                            console.error('[ADMIN] Erro ao criar ticket:', ticketErr);
                            return res.status(500).json({ success: false, message: 'Erro ao criar ticket para usuário' });
                        }

                        const ticketId = this.lastID;

                        // Registrar suspensão
                        db.run(
                            `INSERT INTO download_suspensions (downloadId, userId, suspendedBy, reason, status, userTicketId)
                             VALUES (?, ?, ?, ?, 'suspended', ?)`,
                            [downloadId, userId, adminId, reason, ticketId],
                            (suspensionErr) => {
                                if (suspensionErr) {
                                    console.error('[ADMIN] Erro ao registrar suspensão:', suspensionErr);
                                    return res.status(500).json({ success: false, message: 'Erro ao suspender postagem' });
                                }

                                // Criar uma notificação normal também (para aparecer na caixa de entrada)
                                db.run(
                                    `INSERT INTO notifications (userId, fromUserId, downloadId, type, isRead, createdAt)
                                     VALUES (?, ?, ?, 'suspension', 0, CURRENT_TIMESTAMP)`,
                                    [userId, adminId, downloadId],
                                    (notifErr) => {
                                        if (notifErr) {
                                            console.log('[ADMIN] Aviso - Notificação normal não foi criada:', notifErr.message);
                                            // Continuar mesmo se falhar
                                        }
                                        
                                        // Atualizar status no downloads
                                        db.run(
                                            `UPDATE downloads SET suspensionStatus = 'suspended', suspendedAt = CURRENT_TIMESTAMP, suspensionReason = ? WHERE id = ?`,
                                            [reason, downloadId],
                                            (updateErr) => {
                                                if (updateErr) {
                                                    console.error('[ADMIN] Erro ao atualizar download:', updateErr);
                                                    return res.status(500).json({ success: false, message: 'Erro ao atualizar status do download' });
                                                }

                                                auditAdminAction(req, 'admin_suspend_download_success', {
                                                    targetDownloadId: downloadId,
                                                    targetUserId: userId,
                                                    metadata: { reason }
                                                });

                                                res.json({ success: true, message: 'Postagem suspensa com sucesso', ticketId });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        });
    });
    } catch (err) {
        console.error('[ADMIN] Erro ao suspender download:', err);
        res.status(500).json({ success: false, message: 'Erro ao suspender postagem' });
    }
});

// Listar postagens suspensas
router.get('/suspended-downloads', protect, isAdminOrHasAdminRank, (req, res) => {
    db.all(
        `SELECT 
            ds.id,
            ds.downloadId,
            ds.userId,
            ds.suspendedBy,
            ds.reason,
            ds.status,
            ds.userMessage,
            ds.createdAt,
            ds.resolvedAt,
            d.name,
            d.description,
            u.nickname,
            u.email,
            au.nickname as suspendedByNickname
        FROM download_suspensions ds
        JOIN downloads d ON ds.downloadId = d.id
        JOIN users u ON ds.userId = u.id
        LEFT JOIN users au ON ds.suspendedBy = au.id
        WHERE ds.status != 'resolved'
        ORDER BY ds.createdAt DESC`,
        [],
        (err, suspensions) => {
            if (err) {
                console.error('[ADMIN] Erro ao listar postagens suspensas:', err);
                return res.status(500).json({ success: false, message: 'Erro ao listar postagens suspensas' });
            }

            console.log('[ADMIN] Postagens suspensas ativas encontradas:', suspensions?.length || 0);
            if (suspensions && suspensions.length > 0) {
                console.log('[ADMIN] Primeira suspensão:', suspensions[0]);
            }

            res.json({ success: true, suspensions: suspensions || [] });
        }
    );
});

// Desuspender postagem (reabrir para edição - aprova imediatamente)
router.post('/unsuspend-download/:downloadId', protect, isAdminOrHasAdminRank, (req, res) => {
    const { downloadId } = req.params;
    const downloadIdNum = Number(downloadId);
    console.log('[ADMIN] POST /unsuspend-download - downloadId:', downloadId, 'parsed:', downloadIdNum);

    if (!downloadIdNum || downloadIdNum === 0) {
        return res.status(400).json({ success: false, message: 'ID de download inválido' });
    }

    db.get(`SELECT userId, status FROM download_suspensions WHERE downloadId = ?`, [downloadIdNum], (err, suspension) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar suspensão:', err);
            return res.status(500).json({ success: false, message: 'Erro ao buscar suspensão' });
        }

        if (!suspension) {
            console.warn('[ADMIN] Suspensão não encontrada para downloadId:', downloadIdNum);
            return res.status(404).json({ success: false, message: 'Suspensão não encontrada' });
        }

        console.log('[ADMIN] Suspensão encontrada, status:', suspension.status);

        // IMPORTANTE: Marcar como RESOLVIDO - suspensão foi aprovada
        db.run(
            `UPDATE download_suspensions SET status = 'resolved', resolvedAt = CURRENT_TIMESTAMP WHERE downloadId = ?`,
            [downloadIdNum],
            (updateErr) => {
                if (updateErr) {
                    console.error('[ADMIN] Erro ao marcar como resolvido:', updateErr);
                    return res.status(500).json({ success: false, message: 'Erro ao resolver suspensão' });
                }

                console.log('[ADMIN] Suspensão marcada como resolvida');

                // Limpar o status de suspensão do download (desbloquear)
                db.run(
                    `UPDATE downloads SET suspensionStatus = NULL, suspendedAt = NULL, suspensionReason = NULL WHERE id = ?`,
                    [downloadIdNum],
                    (restoreErr) => {
                        if (restoreErr) {
                            console.error('[ADMIN] Erro ao desbloquear download:', restoreErr);
                            return res.status(500).json({ success: false, message: 'Erro ao desbloquear' });
                        }

                        console.log('[ADMIN] Download desbloqueado - suspensão resolvida:', downloadIdNum);

                        auditAdminAction(req, 'admin_unsuspend_download_success', {
                            targetDownloadId: downloadIdNum,
                            targetUserId: suspension.userId,
                            action: 'approved'
                        });

                        res.json({ success: true, message: 'Postagem aprovada e desbloqueada!' });
                    }
                );
            }
        );
    });
});

// Remover postagem suspensa
router.delete('/delete-suspended-download/:downloadId', protect, isAdminOrHasAdminRank, (req, res) => {
    const adminId = req.user.id;
    const { downloadId } = req.params;
    console.log('[ADMIN] DELETE /delete-suspended-download - downloadId:', downloadId, 'tipo:', typeof downloadId);

    db.get(`SELECT userId FROM download_suspensions WHERE downloadId = ?`, [downloadId], (err, suspension) => {
        if (err) {
            console.error('[ADMIN] Erro ao buscar suspensão:', err);
            return res.status(500).json({ success: false, message: 'Erro ao buscar suspensão' });
        }

        if (!suspension) {
            console.warn('[ADMIN] Suspensão não encontrada para downloadId:', downloadId);
            return res.status(404).json({ success: false, message: 'Suspensão não encontrada' });
        }

        console.log('[ADMIN] Suspensão encontrada, userId:', suspension.userId);

        const userId = suspension.userId;

        // Criar ticket informando sobre remoção
        db.run(
            `INSERT INTO admin_tickets (userId, fromUserId, title, message, isRead)
             VALUES (?, ?, ?, ?, 0)`,
            [userId, adminId, 'Postagem Removida', 'Sua postagem suspensa foi removida pela equipe de moderação.'],
            function(ticketErr) {
                if (ticketErr) {
                    console.error('[ADMIN] Erro ao criar ticket de removação:', ticketErr);
                    return res.status(500).json({ success: false, message: 'Erro ao notificar usuário' });
                }

                console.log('[ADMIN] Ticket criado com sucesso');

                // Atualizar status para resolved
                db.run(
                    `UPDATE download_suspensions SET status = 'resolved', resolvedAt = CURRENT_TIMESTAMP WHERE downloadId = ?`,
                    [downloadId],
                    (updateErr) => {
                        if (updateErr) {
                            console.error('[ADMIN] Erro ao atualizar suspensão:', updateErr);
                            return res.status(500).json({ success: false, message: 'Erro ao atualizar suspensão' });
                        }

                        console.log('[ADMIN] Download_suspensions atualizado para resolved');

                        // Deletar download
                        db.run(
                            `DELETE FROM downloads WHERE id = ?`,
                            [downloadId],
                            (deleteErr) => {
                                if (deleteErr) {
                                    console.error('[ADMIN] Erro ao deletar download:', deleteErr);
                                    return res.status(500).json({ success: false, message: 'Erro ao deletar download' });
                                }

                                console.log('[ADMIN] Download deletado com sucesso:', downloadId);

                                auditAdminAction(req, 'admin_delete_suspended_download_success', {
                                    targetDownloadId: downloadId,
                                    targetUserId: userId
                                });

                                res.json({ success: true, message: 'Postagem removida com sucesso' });
                            }
                        );
                    }
                );
            }
        );
    });
});

// Enviar postagem suspensa para revisão
router.post('/request-download-review/:downloadId', protect, (req, res) => {
    const userId = req.user.id;
    const { downloadId } = req.params;
    const { message } = req.body;

    if (!downloadId || !message) {
        return res.status(400).json({ success: false, message: 'downloadId e message são obrigatórios' });
    }

    // Verificar se o download existe e pertence ao usuário
    db.get(`SELECT userId, suspensionStatus FROM downloads WHERE id = ? AND userId = ?`, [downloadId, userId], (err, download) => {
        if (err) {
            console.error('[REVIEW] Erro ao buscar download:', err);
            return res.status(500).json({ success: false, message: 'Erro ao buscar download' });
        }

        if (!download) {
            return res.status(404).json({ success: false, message: 'Download não encontrado' });
        }

        if (download.suspensionStatus !== 'suspended') {
            return res.status(400).json({ success: false, message: 'Esta postagem não está suspensa' });
        }

        // Atualizar status para under_review
        db.run(
            `UPDATE download_suspensions SET status = 'under_review' WHERE downloadId = ? AND userId = ?`,
            [downloadId, userId],
            (updateErr) => {
                if (updateErr) {
                    console.error('[REVIEW] Erro ao atualizar suspensão:', updateErr);
                    return res.status(500).json({ success: false, message: 'Erro ao atualizar status' });
                }

                // Atualizar downloads
                db.run(
                    `UPDATE downloads SET suspensionStatus = 'under_review' WHERE id = ?`,
                    [downloadId],
                    (downloadErr) => {
                        if (downloadErr) {
                            console.error('[REVIEW] Erro ao atualizar download:', downloadErr);
                            return res.status(500).json({ success: false, message: 'Erro ao atualizar download' });
                        }

                        // Buscar todos os admins e staff com hierarquia >= 100
                        db.all(
                            `SELECT DISTINCT u.id FROM users u
                             WHERE u.id = 1 OR EXISTS (
                                SELECT 1 FROM user_custom_ranks ucr
                                JOIN custom_ranks cr ON ucr.rankId = cr.id
                                WHERE ucr.userId = u.id
                                AND cr.hierarchyLevel >= 100
                             )`,
                            [],
                            (hierarchyErr, admins) => {
                                if (hierarchyErr) {
                                    console.error('[REVIEW] Erro ao buscar admins:', hierarchyErr);
                                    admins = [{id: 1}]; // Fallback para admin padrão
                                }

                                if (!admins || admins.length === 0) {
                                    admins = [{id: 1}]; // Fallback para admin padrão
                                }

                                let ticketIds = [];
                                let processedCount = 0;

                                // Criar ticket para cada admin/staff
                                admins.forEach((admin) => {
                                    db.run(
                                        `INSERT INTO admin_tickets (userId, fromUserId, title, message)
                                         VALUES (?, ?, ?, ?)`,
                                        [admin.id, userId, 'Solicitação de Revisão de Postagem', `Alterações descritas: ${message}`],
                                        function(ticketErr) {
                                            processedCount++;
                                            
                                            if (!ticketErr && ticketIds.length === 0) {
                                                ticketIds.push(this.lastID);
                                            }

                                            if (processedCount === admins.length) {
                                                // Atualizar a suspensão com a mensagem do usuário
                                                db.run(
                                                    `UPDATE download_suspensions SET userMessage = ?, reviewTicketId = ? WHERE downloadId = ?`,
                                                    [message, ticketIds[0] || null, downloadId],
                                                    (msgErr) => {
                                                        if (msgErr) {
                                                            console.error('[REVIEW] Erro ao atualizar mensagem da suspensão:', msgErr);
                                                        }
                                                        res.json({ success: true, message: 'Postagem enviada para revisão da equipe de moderação' });
                                                    }
                                                );
                                            }
                                        }
                                    );
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

export default router;
