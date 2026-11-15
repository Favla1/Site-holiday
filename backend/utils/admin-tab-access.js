import db from '../config/database.js';

export const ADMIN_TAB_ACCESS_COLUMNS = Object.freeze({
    ranks: 'adminTabRanks',
    events: 'adminTabEvents',
    appearance: 'adminTabAppearance',
    users: 'adminTabUsers',
    account: 'adminTabAccount',
    sendmail: 'adminTabSendmail',
    staffHierarchy: 'adminTabStaffHierarchy',
    postPermissions: 'adminTabPostPermissions',
    navbar: 'adminTabNavbar',
    bans: 'adminTabBans',
    suspendedPosts: 'adminTabSuspendedPosts'
});

export const ADMIN_PANEL_TAB_COLUMNS = Object.freeze({
    ranks: 'adminPanelTabRanks',
    events: 'adminPanelTabEvents',
    appearance: 'adminPanelTabAppearance',
    users: 'adminPanelTabUsers',
    account: 'adminPanelTabAccount',
    sendmail: 'adminPanelTabSendmail',
    staffHierarchy: 'canViewStaffHierarchy',
    postPermissions: 'adminPanelTabPostPermissions',
    navbar: 'adminPanelTabNavbar',
    bans: 'adminPanelTabBans',
    suspendedPosts: 'adminPanelTabSuspendedPosts'
});

export function getAdminTabAccess(row = {}) {
    return Object.fromEntries(
        Object.entries(ADMIN_PANEL_TAB_COLUMNS).map(([key, roleColumn]) => {
            const userColumn = ADMIN_TAB_ACCESS_COLUMNS[key];
            const roleAccess = Number(row[`roleTab_${key}`] ?? row[roleColumn] ?? 0) === 1;
            const userAccess = userColumn ? Number(row[userColumn] || 0) === 1 : false;
            return [key, roleAccess || userAccess];
        })
    );
}

export function getDirectAdminTabAccess(row = {}) {
    return Object.fromEntries(
        Object.entries(ADMIN_TAB_ACCESS_COLUMNS).map(([key, column]) => [
            key,
            Number(row[column] || 0) === 1
        ])
    );
}

export function getFullAdminTabAccess() {
    return Object.fromEntries(Object.keys(ADMIN_PANEL_TAB_COLUMNS).map((key) => [key, true]));
}

export async function getAdminTabAccessRow(userId) {
    const roleAccessColumns = Object.entries(ADMIN_PANEL_TAB_COLUMNS).map(([key, column]) => (
        `EXISTS (
            SELECT 1
            FROM user_custom_ranks ucr
            JOIN custom_ranks cr ON cr.id = ucr.customRankId
            WHERE ucr.userId = u.id
              AND COALESCE(cr.enableAdminPanel, 0) = 1
              AND COALESCE(cr.${column}, 0) = 1
        ) AS roleTab_${key}`
    ));
    const directAccessColumns = Object.values(ADMIN_TAB_ACCESS_COLUMNS).map((column) => (
        `COALESCE(u.${column}, 0) AS ${column}`
    ));
    const sql = `
        SELECT u.id, u.email, ${directAccessColumns.join(', ')}, ${roleAccessColumns.join(', ')}
        FROM users u
        WHERE u.id = ?
    `;

    return new Promise((resolve, reject) => {
        db.get(sql, [Number(userId)], (error, row) => {
            if (error) return reject(error);
            resolve(row || null);
        });
    });
}

export function getAdminTabAccessRequirements(req) {
    const baseUrl = String(req.baseUrl || '').replace(/\/+$/, '');
    const routePath = String(req.path || '').split('?')[0];
    const method = String(req.method || '').toUpperCase();

    if (baseUrl === '/api/ranks') {
        if (routePath === '/custom/all' || /^\/custom\/group\/[^/]+$/.test(routePath)) {
            return ['ranks', 'appearance'];
        }
        if (
            /^\/custom(?:\/\d+)?$/.test(routePath) ||
            /^\/custom\/upload-background$/.test(routePath) ||
            routePath === '/cust-upload-background' ||
            routePath === '/cust_upload_background'
        ) {
            return ['ranks'];
        }
        if (/^\/user\/\d+\/(?:add|add-default|remove\/\d+|hide-fixed-rank|full)$/.test(routePath)) {
            return ['users'];
        }
        return [];
    }

    if (baseUrl !== '/api/admin') return [];

    if (/^\/events(?:\/|$)/.test(routePath)) return ['events'];
    if (
        /^\/achievement-backgrounds\/(?:upload|group|animation-mode|custom\/)/.test(routePath) ||
        /^\/manual-rank-overrides(?:\/|$)/.test(routePath)
    ) {
        return ['appearance'];
    }
    if (/^\/staff-hierarchy(?:\/|$)/.test(routePath)) return ['staffHierarchy'];
    if (method === 'PUT' && routePath === '/social-links') return ['navbar'];
    if (
        routePath === '/users/google-login' ||
        /^\/users\/\d+\/(?:password-login|google-login)$/.test(routePath)
    ) {
        return ['account'];
    }
    if (
        /^\/emails(?:\/|$)/.test(routePath) ||
        /^\/users\/\d+\/(?:send-email|email-status|approve-email-change|cancel-email-change-request)$/.test(routePath)
    ) {
        return ['sendmail'];
    }
    if (routePath === '/users') return ['users', 'sendmail'];
    if (
        /^\/users(?:\/|$)/.test(routePath) ||
        routePath === '/set-rank' ||
        routePath === '/remove-rank' ||
        routePath === '/tickets/send-to-all'
    ) {
        return ['users'];
    }
    if (
        routePath === '/users-with-post-permission' ||
        routePath === '/set-user-permissions' ||
        routePath === '/grant-post-permission' ||
        routePath === '/revoke-post-permission' ||
        routePath === '/grant-fixed-rank-order' ||
        routePath === '/revoke-fixed-rank-order'
    ) {
        return ['postPermissions'];
    }
    if (
        routePath === '/ban-user' ||
        routePath === '/bans' ||
        /^\/unban\/\d+$/.test(routePath)
    ) {
        return ['bans'];
    }
    if (
        routePath === '/suspended-downloads' ||
        /^\/suspend-download\/\d+$/.test(routePath) ||
        /^\/(?:unsuspend|delete-suspended-download)\/\d+$/.test(routePath)
    ) {
        return ['suspendedPosts'];
    }

    return [];
}
