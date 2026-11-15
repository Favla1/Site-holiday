import db from '../config/database.js';

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) return reject(error);
            resolve(row || null);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) return reject(error);
            resolve(rows || []);
        });
    });
}

export function isOwnerEmail(email) {
    return String(email || '').trim().toLowerCase() === 'sustmanrft@hotmail.com';
}

export async function getUserHighestStaffRole(userId) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return null;

    const user = await dbGet(
        'SELECT id, email, isAdmin FROM users WHERE id = ?',
        [id]
    );
    if (!user) return null;

    if (id === 1 || isOwnerEmail(user.email) || Number(user.isAdmin) === 1) {
        return { id: null, rankName: 'Fundador', level: Number.MAX_SAFE_INTEGER };
    }

    const role = await dbGet(
        `SELECT cr.id,
                cr.name AS rankName,
                COALESCE(cr.hierarchyLevel, 0) AS level
         FROM user_custom_ranks ucr
         JOIN custom_ranks cr ON cr.id = ucr.customRankId
         WHERE ucr.userId = ?
           AND COALESCE(cr.isStaffRole, 0) = 1
           AND COALESCE(cr.enableAdminPanel, 0) = 1
         ORDER BY COALESCE(cr.hierarchyLevel, 0) DESC, ucr.assignedAt ASC
         LIMIT 1`,
        [id]
    );

    return role || { id: null, rankName: '', level: 0 };
}

export async function canManageTargetUser(actorUserId, targetUserId) {
    const actorId = Number(actorUserId);
    const targetId = Number(targetUserId);

    if (!Number.isInteger(actorId) || actorId <= 0 ||
        !Number.isInteger(targetId) || targetId <= 0) {
        return { allowed: false, message: 'Usuário inválido.' };
    }

    const [actor, target] = await Promise.all([
        dbGet('SELECT id, email, isAdmin FROM users WHERE id = ?', [actorId]),
        dbGet('SELECT id, email, isAdmin FROM users WHERE id = ?', [targetId])
    ]);

    if (!actor) return { allowed: false, message: 'Usuário autenticado não encontrado.' };
    if (!target) return { allowed: false, message: 'Usuário não encontrado.' };

    const actorIsOwner = actorId === 1 || isOwnerEmail(actor.email);
    const targetIsOwner = targetId === 1 || isOwnerEmail(target.email);

    if (actorIsOwner) return { allowed: true };
    if (targetIsOwner) {
        return { allowed: false, message: 'A conta do dono não pode ser alterada por esta ação.' };
    }
    if (actorId === targetId) {
        return { allowed: false, message: 'Você não pode alterar sua própria conta por esta ação.' };
    }
    if (Number(target.isAdmin) === 1) {
        return { allowed: false, message: 'A conta de administrador não pode ser alterada por esta ação.' };
    }

    const [actorRole, targetRole] = await Promise.all([
        getUserHighestStaffRole(actorId),
        getUserHighestStaffRole(targetId)
    ]);
    if (!actorRole || Number(actorRole.level || 0) <= Number(targetRole?.level || 0)) {
        return {
            allowed: false,
            message: 'Você só pode gerenciar usuários abaixo do seu nível hierárquico.'
        };
    }

    return { allowed: true };
}

export async function canAccessMembersDirectory(userId) {
    const id = Number(userId);
    if (!Number.isInteger(id) || id <= 0) return false;
    if (id === 1) return true;

    const user = await dbGet(
        'SELECT email, isAdmin FROM users WHERE id = ?',
        [id]
    );
    if (isOwnerEmail(user?.email)) return true;
    if (Number(user?.isAdmin || 0) === 1) return true;

    const role = await dbGet(
        `SELECT 1
         FROM user_custom_ranks ucr
         JOIN custom_ranks cr ON cr.id = ucr.customRankId
         WHERE ucr.userId = ?
           AND COALESCE(cr.isStaffRole, 0) = 1
           AND COALESCE(cr.canViewMembersPage, 0) = 1
         LIMIT 1`,
        [id]
    );

    return Boolean(role);
}

export async function canAssignOrRemoveRole(actorUserId, targetUserId, customRankId) {
    const actorId = Number(actorUserId);
    const targetId = Number(targetUserId);
    const rankId = Number(customRankId);

    if (!Number.isInteger(actorId) || actorId <= 0 ||
        !Number.isInteger(targetId) || targetId <= 0 ||
        !Number.isInteger(rankId) || rankId <= 0) {
        return { allowed: false, message: 'Usuário ou cargo inválido.' };
    }

    if (actorId === 1) return { allowed: true };

    const [actorUser, targetUser, actor, targetRank, requestedRank] = await Promise.all([
        dbGet('SELECT id, email FROM users WHERE id = ?', [actorId]),
        dbGet('SELECT email FROM users WHERE id = ?', [targetId]),
        dbGet(
            `SELECT MAX(COALESCE(cr.hierarchyLevel, 0)) AS level
             FROM user_custom_ranks ucr
             JOIN custom_ranks cr ON cr.id = ucr.customRankId
             WHERE ucr.userId = ?
               AND COALESCE(cr.isStaffRole, 0) = 1
               AND COALESCE(cr.enableAdminPanel, 0) = 1`,
            [actorId]
        ),
        dbGet(
            `SELECT MAX(COALESCE(cr.hierarchyLevel, 0)) AS level
             FROM user_custom_ranks ucr
             JOIN custom_ranks cr ON cr.id = ucr.customRankId
             WHERE ucr.userId = ?
               AND COALESCE(cr.isStaffRole, 0) = 1`,
            [targetId]
        ),
        dbGet(
            `SELECT COALESCE(isStaffRole, 0) AS isStaffRole,
                    COALESCE(hierarchyLevel, 0) AS hierarchyLevel
             FROM custom_ranks
             WHERE id = ?`,
            [rankId]
        )
    ]);

    if (!actorUser) {
        return { allowed: false, message: 'Usuário autenticado não encontrado.' };
    }
    if (!targetUser) {
        return { allowed: false, message: 'Usuário não encontrado.' };
    }

    if (isOwnerEmail(actorUser?.email)) return { allowed: true };
    if (targetId === 1 || isOwnerEmail(targetUser?.email)) {
        return { allowed: false, message: 'O cargo do fundador não pode ser alterado.' };
    }

    const actorLevel = Number(actor?.level || 0);
    if (!actor || actorLevel <= 0) {
        return { allowed: false, message: 'Você não possui permissão para alterar cargos.' };
    }

    if (Number(targetRank?.level || 0) >= actorLevel) {
        return {
            allowed: false,
            message: 'Você não pode alterar cargos de usuários com nível igual ou superior ao seu.'
        };
    }

    if (!requestedRank) {
        return { allowed: false, message: 'Cargo não encontrado.' };
    }

    if (Number(requestedRank.isStaffRole) === 1 &&
        Number(requestedRank.hierarchyLevel || 0) >= actorLevel) {
        return {
            allowed: false,
            message: 'Você só pode atribuir cargos abaixo do seu nível hierárquico.'
        };
    }

    return { allowed: true };
}

export function listStaffHierarchyRanks() {
    return dbAll(
        `SELECT cr.*,
                COUNT(ucr.userId) AS assignedUsers
         FROM custom_ranks cr
         LEFT JOIN user_custom_ranks ucr ON ucr.customRankId = cr.id
         GROUP BY cr.id
         ORDER BY COALESCE(cr.hierarchyLevel, 0) DESC, cr.name COLLATE NOCASE ASC`
    );
}
