import jwt from 'jsonwebtoken';
import db from '../config/database.js';
import { getJwtSecret } from '../config/jwt-secret.js';
import {
    getAdminTabAccess,
    getAdminTabAccessRequirements,
    getAdminTabAccessRow
} from '../utils/admin-tab-access.js';
import { isOwnerEmail } from '../utils/staff-hierarchy.js';

const JWT_SECRET = getJwtSecret();

export const protect = (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Token inválido' });
    }
};

export const checkBanStatus = (req, res, next) => {
    const userId = req.user?.id;
    
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Não autorizado' });
    }
    
    db.get(`
        SELECT id, banType, suspensionDays, reason, createdAt, expiresAt 
        FROM bans 
        WHERE userId = ? AND isActive = 1
        LIMIT 1
    `, [userId], (err, ban) => {
        if (err) {
            console.error('[AUTH] Erro ao verificar banimento:', err);
            return res.status(500).json({ success: false, message: 'Erro ao verificar status' });
        }
        
        if (!ban) {
            return next();
        }
        
        // Verificar se é banimento permanente
        if (ban.banType === 'permanent') {
            return res.status(403).json({ 
                success: false, 
                message: 'Sua conta foi banida permanentemente',
                banned: true,
                banType: 'permanent'
            });
        }
        
        // Verificar se suspensão expirou
        if (ban.banType === 'suspension' && ban.expiresAt) {
            const expiryDate = new Date(ban.expiresAt);
            if (new Date() > expiryDate) {
                // Remover banimento expirado
                db.run(`UPDATE bans SET isActive = 0 WHERE id = ?`, [ban.id], (err) => {
                    if (err) console.error('[AUTH] Erro ao remover ban expirado:', err);
                });
                return next();
            }
            
            // Suspensão ainda ativa
            const daysRemaining = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
            return res.status(403).json({ 
                success: false, 
                message: `Sua conta foi suspensa por ${daysRemaining} dia(s). Motivo: ${ban.reason}`,
                banned: true,
                banType: 'suspension',
                daysRemaining: daysRemaining
            });
        }
        
        next();
    });
};

export const isAdminOrHasAdminRank = (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    const tabRequirements = getAdminTabAccessRequirements(req);
    getAdminTabAccessRow(userId).then((user) => {
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuário autenticado não encontrado' });
        }
        const isOwner = Number(user.id) === 1 || isOwnerEmail(user.email);
        const tabAccess = getAdminTabAccess(user);
        const hasTabPermission = tabRequirements.length === 0
            || isOwner
            || tabRequirements.some((key) => tabAccess[key]);
        if (!hasTabPermission) {
            return res.status(403).json({ success: false, message: 'Você não tem permissão para acessar esta aba do painel.' });
        }

        if (isOwner) {
            req.isAdmin = true;
            return next();
        }

        db.get(`
            SELECT cr.id, cr.name, cr.enableAdminPanel, COALESCE(cr.isStaffRole, 0) AS isStaffRole
            FROM user_custom_ranks ucr
            JOIN custom_ranks cr ON ucr.customRankId = cr.id
            WHERE ucr.userId = ? AND COALESCE(cr.enableAdminPanel, 0) = 1
            ORDER BY COALESCE(cr.hierarchyLevel, 0) DESC, ucr.assignedAt ASC
            LIMIT 1
        `, [userId], (err, rank) => {
            if (err) {
                console.error('[AUTH] Erro ao verificar cargo de staff do painel admin:', err);
                return res.status(500).json({ success: false, message: 'Erro ao verificar permissões' });
            }

            if (rank) {
                req.isAdmin = false;
                req.adminRank = rank.name;
                return next();
            }

            return res.status(403).json({ success: false, message: 'Sem permissão para acessar painel admin' });
        });
    }).catch((error) => {
        console.error('[AUTH] Erro ao carregar permissões do painel:', error);
        return res.status(500).json({ success: false, message: 'Erro ao verificar permissões' });
    });
};

export default protect;

