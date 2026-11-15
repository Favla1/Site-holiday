let allMembers = [];
let filteredMembers = [];
let currentPage = 1;
const MEMBERS_PER_PAGE = 20;

function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
}

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
}

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR');
}

function resolveMediaUrl(value, fallback = '') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) {
        const base = String(window.HOLIDAY_API_URL || '').replace(/\/+$/, '').replace(/\/api$/i, '');
        return base ? `${base}${raw}` : raw;
    }
    return raw;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const TAG_STYLE_OPTIONS = new Set([
    'none',
    'aurora',
    'neon',
    'pulse',
    'wave',
    'galaxy',
    'angle',
    'angle2',
    'double-angle',
    'chevron',
    'brackets',
    'square',
    'corner',
    'round',
    'ornate',
    'spark',
    'flare',
    'crystal',
    'laurel',
    'aura',
    'mist',
    'ember',
    'frost',
    'nova',
    'prism',
    'vortex',
    'halo',
    'ripple',
    'comet',
    'lava',
    'ice',
    'thunder',
    'mint',
    'sunset',
    'ocean',
    'jade',
    'candy',
    'rose',
    'dusk',
    'mosaic',
    'digital',
    'quilt',
    'circuit',
    'blocks',
    'gold',
    'violet',
    'poly',
    'royal',
    'sand',
    'wings',
    'blades',
    'orb',
    'sigil',
    'crown'
]);
const TAG_SYMBOL_OPTIONS = new Set([
    'none',
    'wings',
    'heart',
    'star',
    'sun',
    'youtube',
    'cat',
    'garry',
    'anime',
    'loading'
]);
const TAG_BANNER_OPTIONS = new Set([
    'pill',
    'round',
    'soft',
    'square',
    'slab',
    'banner',
    'banner-cut',
    'ticket',
    'tag',
    'tag-cut',
    'chevron',
    'chevron-soft',
    'hex',
    'octagon',
    'diamond',
    'shield',
    'bracket',
    'capsule',
    'plaque',
    'ribbon'
]);

const PROFILE_TAG_DEFAULT_TEXT_COLOR = '#FFFFFF';

function normalizeProfileTagStyle(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'none';
    return TAG_STYLE_OPTIONS.has(raw) ? raw : 'none';
}

function normalizeProfileTagSymbolStyle(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'none';
    return TAG_SYMBOL_OPTIONS.has(raw) ? raw : 'none';
}

function normalizeProfileTagBannerStyle(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'pill';
    return TAG_BANNER_OPTIONS.has(raw) ? raw : 'pill';
}

function parseRgbColor(value) {
    const match = String(value || '').trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i);
    if (!match) return null;
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    const a = match[4] !== undefined ? Number(match[4]) : null;
    if ([r, g, b].some((v) => Number.isNaN(v) || v < 0 || v > 255)) return null;
    if (a !== null && (Number.isNaN(a) || a < 0 || a > 1)) return null;
    return a === null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
}

function normalizeProfileTagColor(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(raw)) {
        return raw.toUpperCase();
    }
    const rgb = parseRgbColor(raw);
    return rgb || '';
}

function normalizeProfileTagBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const raw = String(value || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
}

function getProfileTagSymbolGlyphs(style) {
    switch (style) {
        case 'angle': return { left: '<', right: '>' };
        case 'angle2': return { left: '⟨', right: '⟩' };
        case 'double-angle': return { left: '《', right: '》' };
        case 'chevron': return { left: '❮', right: '❯' };
        case 'brackets': return { left: '[', right: ']' };
        case 'square': return { left: '【', right: '】' };
        case 'corner': return { left: '『', right: '』' };
        case 'round': return { left: '(', right: ')' };
        case 'ornate': return { left: '✦', right: '✦' };
        case 'spark': return { left: '✦', right: '✦' };
        case 'flare': return { left: '✶', right: '✶' };
        case 'crystal': return { left: '◆', right: '◆' };
        case 'laurel': return { left: '❧', right: '❧' };
        case 'aura': return { left: '✧', right: '✧' };
        case 'wings': return { left: '༺', right: '༻' };
        case 'blades': return { left: '⟦', right: '⟧' };
        case 'orb': return { left: '◯', right: '◯' };
        case 'sigil': return { left: '✵', right: '✵' };
        case 'crown': return { left: '♔', right: '♔' };
        default: return { left: '', right: '' };
    }
}

function buildTagSymbolHtml(symbolStyle, text) {
    const normalized = normalizeProfileTagSymbolStyle(symbolStyle);
    const safeText = escapeHtml(text || '');

    if (normalized === 'none') {
        return `<span class="tag-text">${safeText}</span>`;
    }

    const safeStyle = escapeHtml(normalized);
    return `
        <span class="tag-gif tag-gif-${safeStyle} center" aria-hidden="true"></span>
        <span class="tag-gif tag-gif-${safeStyle} left" aria-hidden="true"></span>
        <span class="tag-text">${safeText}</span>
        <span class="tag-gif tag-gif-${safeStyle} right" aria-hidden="true"></span>
    `;
}
function resolveProfileTagTheme({
    color,
    gradientStart,
    gradientEnd,
    useGradient,
    textColor
} = {}) {
    const base = normalizeProfileTagColor(color) || '#EC4899';
    const start = normalizeProfileTagColor(gradientStart) || base;
    const end = normalizeProfileTagColor(gradientEnd) || '#8B5CF6';
    const text = normalizeProfileTagColor(textColor) || PROFILE_TAG_DEFAULT_TEXT_COLOR;
    if (!normalizeProfileTagBool(useGradient)) {
        return { color1: base, color2: base, textColor: text };
    }
    return { color1: start, color2: end, textColor: text };
}

const TAG_STYLE_PALETTES = {
    mosaic: ['#0B2D6B', '#113B8A', '#1E5AA8', '#3C7ED1'],
    digital: ['#061334', '#0B2A6F', '#1C4CCF', '#52A0FF'],
    quilt: ['#FFFFFF', '#E8E8E8', '#D9D9D9', '#F7F7F7'],
    circuit: ['#0B0F1A', '#1F2937', '#F97316', '#EF4444'],
    blocks: ['#0F172A', '#F59E0B', '#F97316', '#9CA3AF'],
    gold: ['#0B0A08', '#5A3E0E', '#D6A046', '#F8E3A1'],
    violet: ['#2A0B45', '#5B167A', '#A855F7', '#F472B6'],
    poly: ['#0E2A1A', '#2E7D32', '#7CB342', '#A3E635'],
    royal: ['#3B0A0A', '#991B1B', '#F59E0B', '#FDE68A'],
    sand: ['#8B5E34', '#C89B63', '#E7C592', '#F4E0B7']
};

function applyFixedTagPalette(style, theme) {
    const palette = TAG_STYLE_PALETTES[style];
    if (!palette || palette.length === 0) return theme;
    return {
        ...theme,
        color1: palette[0],
        color2: palette[palette.length - 1]
    };
}

function getDisplayName(member) {
    const nickname = String(member.nickname || '').trim();
    const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
    return nickname || fullName || 'Membro';
}

function buildAchievementBadges(achievements) {
    if (!Array.isArray(achievements) || achievements.length === 0) {
        return '<span class="member-meta">Sem conquistas exibidas</span>';
    }

    return achievements.map((rank) => {
        const color = String(rank?.color || '#EC4899');
        const name = escapeHtml(rank?.name || 'Conquista');
        return `<span class="member-achievement" style="border-color:${color};color:${color};background:${color}22;">${name}</span>`;
    }).join('');
}

function buildMemberCard(member) {
    const name = getDisplayName(member);
    const avatarUrl = resolveMediaUrl(member.avatar, '');
    const joined = formatDate(member.createdAt);
    const stats = member.stats || {};

    return `
        <article class="member-card">
            <div class="member-header">
                <div class="member-avatar-wrap">
                    <img class="member-avatar" src="${escapeHtml(avatarUrl)}" alt="Avatar de ${escapeHtml(name)}" loading="lazy">
                </div>
                <div>
                    <h3 class="member-name">${escapeHtml(name)}</h3>
                    <div class="member-meta">Membro desde: ${escapeHtml(joined || '--')}</div>
                </div>
            </div>
            <div class="member-stats">
                <div class="member-stat">
                    <span>Postagens</span>
                    <strong>${formatNumber(stats.totalPostages)}</strong>
                </div>
                <div class="member-stat">
                    <span>Likes</span>
                    <strong>${formatNumber(stats.totalLikes)}</strong>
                </div>
                <div class="member-stat">
                    <span>Favoritos</span>
                    <strong>${formatNumber(stats.totalFavoritesReceived)}</strong>
                </div>
                <div class="member-stat">
                    <span>Corações</span>
                    <strong>${formatNumber(stats.totalHearts)}</strong>
                </div>
            </div>
            <div class="member-achievements">
                ${buildAchievementBadges(member.achievements)}
            </div>
        </article>
    `;
}

function buildMemberRow(member) {
    const nickname = String(member.nickname || '').trim();
    const display = nickname ? `@${nickname.replace(/^@+/, '')}` : getDisplayName(member);
    const joined = formatDate(member.createdAt);
    const userId = Number(member?.id);

    return `
        <button type="button" class="members-row" data-user-id="${Number.isFinite(userId) ? userId : ''}">
            <span class="members-row-name">${escapeHtml(display)}</span>
            <span class="members-row-meta">${joined ? `Membro desde: ${escapeHtml(joined)}` : ''}</span>
        </button>
    `;
}

function closeMemberProfileModal() {
    document.getElementById('memberProfileModal')?.remove();
}

function formatPlainTextAsHtml(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    return escapeHtml(value).replace(/\n/g, '<br>');
}

function normalizeProfileTaglineHref(value) {
    const raw = String(value || '').trim();
    const normalized = /^https?:\/\//i.test(raw)
        ? raw
        : (/^www\./i.test(raw) ? `https://${raw}` : '');
    if (!normalized) return '';

    try {
        const url = new URL(normalized);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
    } catch {
        return '';
    }
}

function splitTrailingUrlPunctuation(value) {
    let url = String(value || '');
    let punctuation = '';
    while (url && /[),.!?:;]$/.test(url)) {
        punctuation = url.slice(-1) + punctuation;
        url = url.slice(0, -1);
    }
    return { url, punctuation };
}

function formatProfileTaglineAsHtml(text) {
    const value = String(text || '').trim();
    if (!value) return '';

    const linkPattern = /(\[([^\]\r\n]{1,100})\]\(((?:https?:\/\/|www\.)[^\s)]+)\))|(([^()\s\r\n<[\]]{1,100})\(((?:https?:\/\/|www\.)[^\s)]+)\))|((?:https?:\/\/|www\.)[^\s<]+)/gi;
    return value.split('\n').map((line) => {
        let html = '';
        let cursor = 0;
        let match;

        while ((match = linkPattern.exec(line)) !== null) {
            const rawMatch = match[0];
            html += escapeHtml(line.slice(cursor, match.index));

            const label = match[2] || match[5];
            const rawUrl = match[3] || match[6] || match[7] || rawMatch;
            const { url, punctuation } = splitTrailingUrlPunctuation(rawUrl);
            const href = normalizeProfileTaglineHref(url);
            if (href && label) {
                html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
            } else if (href) {
                html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
            } else {
                html += escapeHtml(rawMatch);
            }
            html += escapeHtml(punctuation);
            cursor = match.index + rawMatch.length;
        }

        html += escapeHtml(line.slice(cursor));
        return html;
    }).join('<br>');
}

async function openMemberProfileModal(userId) {
    const numericUserId = Number(userId);
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) return;

    closeMemberProfileModal();

    const modal = document.createElement('div');
    modal.id = 'memberProfileModal';
    modal.className = 'members-profile-modal';

    const content = document.createElement('div');
    content.className = 'members-profile-modal-content';
    content.innerHTML = `
        <button type="button" class="members-profile-close" aria-label="Fechar perfil">&times;</button>
        <div class="members-profile-loading">Carregando perfil...</div>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    const bindClose = () => {
        const closeBtn = content.querySelector('.members-profile-close');
        if (closeBtn) closeBtn.addEventListener('click', closeMemberProfileModal);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeMemberProfileModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMemberProfileModal();
        }, { once: true });
    };

    bindClose();

    try {
        const response = await AuthAPI.getUserMiniProfile(numericUserId);
        if (!response?.success || !response?.profile) {
            throw new Error(response?.message || 'Não foi possível carregar o perfil.');
        }

        const profile = response.profile;
        const nickname = String(profile.nickname || '').replace(/^@+/, '').trim() || 'usuario';
        const avatarUrl = resolveMediaUrl(profile.avatar, '');

        const rawShowFullName = profile.showFullNameInMiniProfile;
        const showFullNameInMiniProfile = rawShowFullName === undefined
            ? true
            : (rawShowFullName === true || rawShowFullName === 1 || rawShowFullName === '1' || rawShowFullName === 'true');
        const fullName = `${String(profile.firstName || '').trim()} ${String(profile.lastName || '').trim()}`.trim();

        const memberRow = allMembers.find((m) => Number(m?.id) === numericUserId);
        const joined = formatDate(memberRow?.createdAt);

        const stats = profile.stats || {};
        const displayRanks = Array.isArray(profile.displayRanks) ? profile.displayRanks : [];
        const ranksHtml = displayRanks.length > 0
            ? `<div class="members-profile-ranks">
                ${displayRanks.map((rank) => {
                    const color = String(rank?.color || '#EC4899');
                    const name = escapeHtml(rank?.name || 'Conquista');
                    return `<span class="members-profile-rank" style="border-color:${escapeHtml(color)}; color:${escapeHtml(color)}; background:${escapeHtml(color)}22;">${name}</span>`;
                }).join('')}
              </div>`
            : '';

        const taglineHtml = formatProfileTaglineAsHtml(profile.profileTagline);
        const bioHtml = formatPlainTextAsHtml(profile.bio);

        content.innerHTML = `
            <button type="button" class="members-profile-close" aria-label="Fechar perfil">&times;</button>
            <div class="members-profile-header">
                <div class="members-profile-avatar-wrap">
                    ${avatarUrl ? `<img class="members-profile-avatar" src="${escapeHtml(avatarUrl)}" alt="Avatar de ${escapeHtml(nickname)}" loading="lazy">` : '<div class="members-profile-avatar placeholder"></div>'}
                </div>
                <div class="members-profile-ident">
                    <h3 class="members-profile-nickname">@${escapeHtml(nickname)}</h3>
                    ${showFullNameInMiniProfile && fullName ? `<div class="members-profile-fullname">${escapeHtml(fullName)}</div>` : ''}
                    ${joined ? `<div class="members-profile-meta">Membro desde: ${escapeHtml(joined)}</div>` : ''}
                </div>
            </div>

            ${taglineHtml ? `<div class="members-profile-block"><div class="members-profile-block-title">Frase do Perfil</div><div class="members-profile-block-body">${taglineHtml}</div></div>` : ''}
            ${bioHtml ? `<div class="members-profile-block"><div class="members-profile-block-title">Bio</div><div class="members-profile-block-body">${bioHtml}</div></div>` : ''}
            ${ranksHtml}

            <div class="members-profile-stats">
                <div class="members-profile-stat"><span>Postagens</span><strong>${formatNumber(stats.postCount)}</strong></div>
                <div class="members-profile-stat"><span>Likes</span><strong>${formatNumber(stats.totalLikes)}</strong></div>
                <div class="members-profile-stat"><span>Corações</span><strong>${formatNumber(stats.totalHearts)}</strong></div>
            </div>
        `;

        bindClose();
    } catch (error) {
        console.error('Erro ao abrir perfil do membro:', error);
        content.innerHTML = `
            <button type="button" class="members-profile-close" aria-label="Fechar perfil">&times;</button>
            <div class="members-profile-error">Erro ao carregar perfil.</div>
        `;
        bindClose();
    }
}

function applyFilters() {
    const query = normalizeText(document.getElementById('membersSearch')?.value);
    const sort = String(document.getElementById('membersSort')?.value || 'recent');

    filteredMembers = allMembers.filter((member) => {
        if (!query) return true;
        const name = normalizeText(getDisplayName(member));
        return name.includes(query);
    });

    filteredMembers.sort((a, b) => {
        if (sort === 'name') {
            return normalizeText(getDisplayName(a)).localeCompare(normalizeText(getDisplayName(b)));
        }
        if (sort === 'posts') {
            return (b.stats?.totalPostages || 0) - (a.stats?.totalPostages || 0);
        }
        if (sort === 'likes') {
            return (b.stats?.totalLikes || 0) - (a.stats?.totalLikes || 0);
        }
        if (sort === 'favorites') {
            return (b.stats?.totalFavoritesReceived || 0) - (a.stats?.totalFavoritesReceived || 0);
        }
        if (sort === 'hearts') {
            return (b.stats?.totalHearts || 0) - (a.stats?.totalHearts || 0);
        }
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
}

function renderMembers() {
    const list = document.getElementById('membersList');
    const empty = document.getElementById('membersEmpty');
    const loadMore = document.getElementById('membersLoadMore');
    const summary = document.getElementById('membersSummary');
    if (!list || !empty || !loadMore || !summary) return;

    const visibleCount = MEMBERS_PER_PAGE * currentPage;
    const visible = filteredMembers.slice(0, visibleCount);

    list.innerHTML = visible.map(buildMemberRow).join('');

    empty.style.display = visible.length === 0 ? 'block' : 'none';
    loadMore.style.display = filteredMembers.length > visible.length ? 'inline-flex' : 'none';
    summary.textContent = `${filteredMembers.length} membros`;
}

async function loadMembers() {
    const loading = document.getElementById('membersLoading');
    if (loading) loading.style.display = 'block';

    try {
        const result = await AuthAPI.getMembers();
        if (!result?.success) {
            throw new Error(result?.message || 'Erro ao carregar membros');
        }
        allMembers = Array.isArray(result.members) ? result.members : [];
        currentPage = 1;
        applyFilters();
        renderMembers();
    } catch (error) {
        console.error('Erro ao carregar membros:', error);
        const empty = document.getElementById('membersEmpty');
        if (empty) {
            empty.textContent = 'Erro ao carregar membros.';
            empty.style.display = 'block';
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const allowed = await RouteGuard.requireAuth({
        loginMessage: 'Faça login para acessar a lista de membros.'
    });
    if (!allowed) return;

    const profileResult = await AuthAPI.getProfile();
    if (!profileResult?.success || !profileResult?.user) {
        window.location.href = 'profile.html?message=' + encodeURIComponent('NÃ£o foi possÃ­vel validar seu acesso Ã  lista de membros.');
        return;
    }

    if (!profileResult.user.canAccessMembersPage) {
        window.location.href = 'profile.html?message=' + encodeURIComponent('A pÃ¡gina de membros Ã© restrita para administradores e moderadores.');
        return;
    }

    const searchInput = document.getElementById('membersSearch');
    const sortSelect = document.getElementById('membersSort');
    const loadMoreBtn = document.getElementById('membersLoadMore');
    const membersList = document.getElementById('membersList');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            applyFilters();
            renderMembers();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentPage = 1;
            applyFilters();
            renderMembers();
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage += 1;
            renderMembers();
        });
    }

    if (membersList) {
        membersList.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            const row = target?.closest?.('.members-row');
            if (!row) return;
            const userId = row.getAttribute('data-user-id');
            if (!userId) return;
            openMemberProfileModal(userId);
        });
    }

    await loadMembers();
});
