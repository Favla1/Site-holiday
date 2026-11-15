// ============================================
// SISTEMA CENTRALIZADO DE AUTENTICACAO
// ============================================
// Este arquivo gerencia todo o estado de autentica??o do site

class AuthManager {
    static TOKEN_KEY = 'token';
    static STORAGE_EVENT = 'auth-state-changed';

    static getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    static setToken(token) {
        localStorage.setItem(this.TOKEN_KEY, token);
        this.notifyStateChange();
    }

    static removeToken() {
        localStorage.removeItem(this.TOKEN_KEY);
        this.notifyStateChange();
    }

    static isLoggedIn() {
        return !!this.getToken();
    }

    static notifyStateChange() {
        window.dispatchEvent(new Event(this.STORAGE_EVENT));
    }

    static onAuthStateChange(callback) {
        window.addEventListener(this.STORAGE_EVENT, callback);
        window.addEventListener('storage', callback);
    }
}

// ============================================
// GERENCIADOR DE NAVBAR GLOBAL
// ============================================

class NavbarManager {
    static notificationUpdateInterval = null;
    static socialLinksLoaded = false;
    static defaultWhatsappUrl = 'https://chat.whatsapp.com/EDqaY8udJmFCTVCTex3b5p';
    static defaultDiscordUrl = 'https://discord.gg/KEc4ZdR3';
    static profileCache = null;

    static getApiBase() {
        if (typeof API_URL === 'string' && API_URL.trim()) {
            return API_URL.replace(/\/$/, '');
        }
        const configured = typeof window !== 'undefined'
            ? String(window.HOLIDAY_API_URL || '').trim().replace(/\/+$/, '')
            : '';
        if (configured) {
            return /\/api$/i.test(configured) ? configured : `${configured}/api`;
        }

        if (typeof window === 'undefined' || !window.location) {
            return 'https://guildaholiday.discloud.dev/api';
        }

        const hostname = String(window.location.hostname || '').toLowerCase();
        const protocol = String(window.location.protocol || '').toLowerCase();
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isLocalFile = protocol === 'file:';

        if (isLocalhost || isLocalFile) {
            return 'http://localhost:8080/api';
        }

        return `${window.location.origin}/api`;
    }

    static async apiRequest(path, options = {}) {
        const token = AuthManager.getToken();
        if (!token) return null;

        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        };

        const response = await fetch(`${this.getApiBase()}${path}`, {
            ...options,
            headers
        });

        if (!response.ok) return null;
        return response.json();
    }

    static async isSessionValid() {
        const token = AuthManager.getToken();
        if (!token) return false;

        try {
            const response = await fetch(`${this.getApiBase()}/auth/profile`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    static async getCurrentProfile(forceRefresh = false) {
        const token = AuthManager.getToken();
        if (!token) {
            this.profileCache = null;
            return null;
        }

        if (!forceRefresh && this.profileCache) {
            return this.profileCache;
        }

        try {
            const response = await fetch(`${this.getApiBase()}/auth/profile`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                this.profileCache = null;
                return null;
            }

            const data = await response.json();
            this.profileCache = data;
            return data;
        } catch {
            this.profileCache = null;
            return null;
        }
    }

    static async init() {
        await this.loadCommunityLinks();

        let isLoggedIn = AuthManager.isLoggedIn();
        if (isLoggedIn) {
            const valid = await this.isSessionValid();
            if (!valid) {
                AuthManager.removeToken();
                isLoggedIn = false;
            }
        }
        this.updateNavbar(isLoggedIn);

        AuthManager.onAuthStateChange(async () => {
            let logged = AuthManager.isLoggedIn();
            if (logged) {
                const valid = await this.isSessionValid();
                if (!valid) {
                    AuthManager.removeToken();
                    return;
                }
            }
            this.updateNavbar(logged);
        });
    }

    static applyCommunityLinks(links = {}) {
        const whatsappUrl = links.whatsappUrl || this.defaultWhatsappUrl;
        const discordUrl = links.discordUrl || this.defaultDiscordUrl;
        const whatsappTooltip = String(links.whatsappTooltip || 'WhatsApp').trim();
        const discordTooltip = String(links.discordTooltip || 'Discord').trim();

        const whatsappEnabled = links.whatsappEnabled !== false && links.whatsappEnabled !== '0' && links.whatsappEnabled !== 0;
        const discordEnabled = links.discordEnabled !== false && links.discordEnabled !== '0' && links.discordEnabled !== 0;

        document.querySelectorAll('.btn-whatsapp').forEach((el) => {
            if (el.tagName !== 'A') return;
            if (!whatsappEnabled) {
                el.style.display = 'none';
                return;
            }
            el.style.display = '';
            el.setAttribute('href', whatsappUrl);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
            el.setAttribute('data-tooltip', whatsappTooltip);
            el.setAttribute('aria-label', whatsappTooltip);
            el.removeAttribute('title');
        });

        document.querySelectorAll('.btn-discord').forEach((el) => {
            if (el.tagName !== 'A') return;
            if (!discordEnabled) {
                el.style.display = 'none';
                return;
            }
            el.style.display = '';
            el.setAttribute('href', discordUrl);
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
            el.setAttribute('data-tooltip', discordTooltip);
            el.setAttribute('aria-label', discordTooltip);
            el.removeAttribute('title');
        });

        this.applyNavbarButtons(Array.isArray(links.navbarButtons) ? links.navbarButtons : []);
    }

    static applyNavbarButtons(buttons = []) {
        const container = document.querySelector('.navbar-buttons');
        if (!container) return;

        container.querySelectorAll('.btn-custom-generated').forEach((existing) => existing.remove());

        const whatsappButton = container.querySelector('a.btn-whatsapp');
        const discordButton = container.querySelector('a.btn-discord');
        const notificationBell = container.querySelector('#notificationBell');
        const loginButton = container.querySelector('a.btn-login');
        const logoutButton = container.querySelector('#logoutBtn');

        const findInsertBeforeNode = (referenceElement) => {
            if (!referenceElement) return null;
            let current = referenceElement.nextElementSibling;
            while (current && current.classList.contains('btn-custom-generated')) {
                current = current.nextElementSibling;
            }
            return current;
        };

        const getInsertBeforeNodeByPosition = (position) => {
            switch (position) {
                case 'beforeWhatsapp':
                    return whatsappButton || discordButton || notificationBell || loginButton || logoutButton || null;
                case 'afterWhatsapp':
                    return findInsertBeforeNode(whatsappButton) || discordButton || notificationBell || loginButton || logoutButton || null;
                case 'beforeDiscord':
                    return discordButton || notificationBell || loginButton || logoutButton || null;
                case 'afterDiscord':
                    return findInsertBeforeNode(discordButton) || notificationBell || loginButton || logoutButton || null;
                case 'beforeNotifications':
                    return notificationBell || loginButton || logoutButton || null;
                case 'afterNotifications':
                    return findInsertBeforeNode(notificationBell) || loginButton || logoutButton || null;
                case 'beforeLogin':
                    return loginButton || notificationBell || logoutButton || null;
                case 'afterLogin':
                    return findInsertBeforeNode(loginButton) || logoutButton || null;
                case 'beforeLogout':
                    return logoutButton || null;
                case 'afterLogout':
                    return findInsertBeforeNode(logoutButton) || null;
                case 'end':
                    return null;
                default:
                    return loginButton || notificationBell || logoutButton || null;
            }
        };

        buttons
            .filter((button) => button && button.enabled !== false && typeof button.label === 'string' && button.label.trim() && typeof button.url === 'string' && button.url.trim())
            .slice(0, 5)
            .forEach((button) => {
                const buttonNode = document.createElement('a');
                buttonNode.className = 'btn-navbar btn-custom btn-custom-generated tooltip-theme';
                buttonNode.href = button.url;
                buttonNode.target = '_blank';
                buttonNode.rel = 'noopener noreferrer';
                const tooltipText = String(button.description || button.label || '').trim();
                buttonNode.setAttribute('aria-label', tooltipText || button.label);
                if (tooltipText) {
                    buttonNode.setAttribute('data-tooltip', tooltipText);
                }
                buttonNode.style.textDecoration = 'none';
                buttonNode.style.whiteSpace = 'nowrap';
                buttonNode.style.display = 'inline-flex';
                buttonNode.style.alignItems = 'center';
                buttonNode.style.gap = '8px';

                const hasIcon = Boolean(button.icon);
                if (hasIcon) {
                    buttonNode.classList.add('icon-btn');
                    if (/^(https?:)?\//.test(button.icon) || button.icon.startsWith('/')) {
                        const iconImg = document.createElement('img');
                        iconImg.className = 'navbar-custom-icon';
                        iconImg.src = button.icon;
                        iconImg.alt = button.label;
                        iconImg.width = 16;
                        iconImg.height = 16;
                        buttonNode.appendChild(iconImg);
                    } else {
                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'navbar-custom-icon-text';
                        iconSpan.textContent = button.icon;
                        buttonNode.appendChild(iconSpan);
                    }
                }

                if (!hasIcon) {
                    const labelSpan = document.createElement('span');
                    labelSpan.textContent = button.label;
                    buttonNode.appendChild(labelSpan);
                }

                const position = String(button.position || 'beforeLogin');
                const insertBeforeNode = getInsertBeforeNodeByPosition(position);

                if (insertBeforeNode) {
                    container.insertBefore(buttonNode, insertBeforeNode);
                } else {
                    container.appendChild(buttonNode);
                }
            });
    }

    static async loadCommunityLinks() {
        if (this.socialLinksLoaded) return;

        try {
            const response = await fetch(`${this.getApiBase()}/admin/social-links`, {
                method: 'GET'
            });

            if (!response.ok) {
                this.applyCommunityLinks();
                this.socialLinksLoaded = true;
                return;
            }

            const data = await response.json();
            if (data?.success && data.links) {
                this.applyCommunityLinks(data.links);
            } else {
                this.applyCommunityLinks();
            }
        } catch (error) {
            this.applyCommunityLinks();
        } finally {
            this.socialLinksLoaded = true;
        }
    }

    static updateNavbar(isLoggedIn = AuthManager.isLoggedIn()) {

        const loginBtn = document.querySelector('.navbar a.btn-login[href="login.html"]');
        const logoutBtn = document.getElementById('logoutBtn');
        const profileLink = document.querySelector('.navbar .nav-link[href="profile.html"]');
        const membersLink = document.querySelector('.navbar .nav-link[href="members.html"]');

        const notificationBell = document.getElementById('notificationBell');
        const notificationBadge = document.getElementById('notificationBadge');

        if (isLoggedIn) {
            if (loginBtn) loginBtn.style.display = 'none';

            if (logoutBtn) {
                logoutBtn.style.display = 'inline-flex';
                logoutBtn.onclick = (e) => {
                    e.preventDefault();
                    this.logout();
                };
            }

            if (profileLink) profileLink.style.display = 'block';
            if (membersLink) membersLink.style.display = 'none';

            if (notificationBell) {
                notificationBell.style.display = 'inline-flex';
                notificationBell.onclick = (e) => {
                    e.preventDefault();
                    this.showNotifications();
                };
            }

            this.startNotificationUpdates();
            this.updateMembersLinkVisibility();
        } else {
            this.profileCache = null;
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (membersLink) membersLink.style.display = 'none';
            if (profileLink) profileLink.style.display = 'none';

            if (notificationBell) notificationBell.style.display = 'none';
            if (notificationBadge) notificationBadge.style.display = 'none';

            this.stopNotificationUpdates();
        }
    }

    static async updateMembersLinkVisibility() {
        const membersLink = document.querySelector('.navbar .nav-link[href="members.html"]');
        if (!membersLink) return;

        if (!AuthManager.isLoggedIn()) {
            membersLink.style.display = 'none';
            return;
        }

        const profile = await this.getCurrentProfile(true);
        const canAccessMembersPage = Boolean(profile?.user?.canAccessMembersPage);
        membersLink.style.display = canAccessMembersPage ? 'block' : 'none';
    }

    static logout() {
        this.profileCache = null;
        AuthManager.removeToken();
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 100);
    }

    static startNotificationUpdates() {
        if (this.notificationUpdateInterval) return;

        this.updateNotificationBadge();
        this.notificationUpdateInterval = setInterval(() => {
            this.updateNotificationBadge();
        }, 30000);
    }

    static stopNotificationUpdates() {
        if (!this.notificationUpdateInterval) return;
        clearInterval(this.notificationUpdateInterval);
        this.notificationUpdateInterval = null;
    }

    static async updateNotificationBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        try {
            const data = await this.apiRequest('/downloads/notifications/count', {
                method: 'GET'
            });
            if (!data) return;

            const unreadCount = Number(data.unreadCount || 0);

            if (unreadCount > 0) {
                badge.textContent = String(unreadCount);
                badge.style.display = 'flex';
                badge.style.alignItems = 'center';
                badge.style.justifyContent = 'center';
            } else {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('[NavbarManager] Error updating notification badge:', error);
        }
    }

    static formatNotificationText(notif) {
        const from = `@${notif.nickname || (notif.type === 'achievement' ? 'Sistema' : 'Administração')}`;
        const post = notif.downloadName || 'seu post';

        if (notif.type === 'like') return `${from} curtiu "${post}"`;
        if (notif.type === 'heart') return `${from} enviou coração em "${post}"`;
        if (notif.type === 'comment') return `${from} comentou em "${post}"`;
        if (notif.type === 'achievement') {
            const rankName = String(notif.rankName || '').trim() || 'Conquista';
            const rawMessage = String(notif.achievementMessage || notif.message || '').trim();
            const normalizedMessage = rawMessage.toLowerCase();
            if (rawMessage && !normalizedMessage.includes('conquista automática de evento') && !normalizedMessage.includes('conquista de postagem')) {
                return rawMessage;
            }
            if (rankName) return `Você recebeu a conquista especial "${rankName}".`;
            if (notif.fromUserId) return `${from} te concedeu a conquista "${rankName}"`;
            return `Você desbloqueou a conquista "${rankName}"`;
        }
        if (notif.type === 'ticket') {
            const ticketTitle = String(notif.ticketTitle || '').trim();
            if (ticketTitle) return `${ticketTitle}`;
            return `${from} enviou uma mensagem`;
        }
        return `${from} enviou uma notifica\u00e7\u00e3o em \"${post}\"`;
    }

    static async markNotificationAsRead(notificationId) {
        if (!notificationId) return;

        try {
            await this.apiRequest(`/downloads/notifications/${notificationId}/read`, {
                method: 'POST'
            });
            await this.updateNotificationBadge();
            
            // Atualizar modal de notificações se estiver aberto
            this.refreshNotificationsModal();
        } catch (error) {
            console.error('[NavbarManager] Error marking notification as read:', error);
        }
    }

    static async markAllNotificationsAsRead() {
        try {
            await this.apiRequest('/downloads/notifications/mark-all-read', {
                method: 'POST'
            });
            await this.updateNotificationBadge();
            
            // Atualizar modal
            this.refreshNotificationsModal();
        } catch (error) {
            console.error('[NavbarManager] Error marking all notifications as read:', error);
        }
    }

    static refreshNotificationsModal() {
        const modal = document.querySelector('.notifications-modal');
        if (modal) {
            // Recarregar notificações no modal
            this.showNotifications();
        }
    }

    static notifyNotificationDeleted(notificationId) {
        console.log('[NavbarManager] Notification deleted:', notificationId);
        // Atualizar badge
        this.updateNotificationBadge();
        // Atualizar modal se estiver aberto
        this.refreshNotificationsModal();
    }

    static async openNotificationTarget(notificationId, downloadId, openComments = false) {
        if (!downloadId) return;

        if (notificationId) {
            await this.markNotificationAsRead(notificationId);
        }

        const params = new URLSearchParams();
        params.set('downloadId', String(downloadId));
        if (openComments) {
            params.set('openComments', '1');
        }

        window.location.href = `downloads.html?${params.toString()}`;
    }

    static async showNotifications() {
        if (!AuthManager.getToken()) return;

        try {
            const data = await this.apiRequest('/downloads/notifications/unread', {
                method: 'GET'
            });
            if (!data) return;

            const notifications = data.notifications || [];

            const existingModal = document.querySelector('.notifications-modal');
            if (existingModal) existingModal.remove();

            const modal = document.createElement('div');
            modal.className = 'notifications-modal';
            modal.style.cssText = `
                position: fixed;
                top: 70px;
                right: 20px;
                background: #1a1a2e;
                border: 2px solid #EC4899;
                border-radius: 12px;
                padding: 0;
                max-width: 420px;
                width: calc(100vw - 40px);
                max-height: 520px;
                overflow-y: auto;
                z-index: 10000;
                box-shadow: 0 10px 40px rgba(236, 72, 153, 0.3);
            `;

            let html = `
                <div style="padding: 15px; border-bottom: 1px solid rgba(236, 72, 153, 0.2); display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; color: #EC4899;">Notifica\u00e7\u00f5es</h3>
                    <button type="button" class="notifications-close-btn" style="background: none; border: none; color: #EC4899; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
            `;

            if (notifications.length === 0) {
                html += '<div style="padding: 30px; text-align: center; color: #999;">Nenhuma notifica\u00e7\u00e3o</div>';
            } else {
                html += notifications.slice(0, 20).map(notif => {
                    const notifId = String(notif.id || '').trim(); // Manter como string para suportar "ticket:123"
                    const downloadId = Number(notif.downloadId) || 0;
                    const isComment = notif.type === 'comment';
                    const isTicket = notif.type === 'ticket';
                    const hasDownloadTarget = downloadId > 0;
                    const avatar = notif.avatar || '/imagens/login.png';
                    const text = this.formatNotificationText(notif);
                    const time = new Date(notif.createdAt).toLocaleString('pt-BR');
                    
                    // Determinar cor da notificação
                    let borderColor = 'rgba(236, 72, 153, 0.5)';
                    let bgColor = 'rgba(236, 72, 153, 0.12)';
                    
                    if (isTicket) {
                        // Ticket em vermelho (punição)
                        borderColor = '#EF4444';
                        bgColor = 'rgba(239, 68, 68, 0.2)';
                        
                        // Se admin com hierarquia alta, mostrar em dourado
                        if (notif.fromUserHierarchyLevel && notif.fromUserHierarchyLevel > 60) {
                            borderColor = '#FFD700';
                            bgColor = 'rgba(255, 215, 0, 0.15)';
                        }
                    } else if (notif.type === 'achievement') {
                        // Conquistas: verificar se é personalizada (dourada) ou de ganho (azul)
                        const isCustomAchievement = String(notif.rankName || '').trim().startsWith('fixed:manual');
                        if (isCustomAchievement) {
                            // Dourada para personalizada
                            borderColor = '#D97706';
                            bgColor = 'rgba(217, 119, 6, 0.15)';
                        } else {
                            // Azul para ganho automático
                            borderColor = '#3B82F6';
                            bgColor = 'rgba(59, 130, 246, 0.15)';
                        }
                    }

                    const styleAttrs = borderColor && bgColor 
                        ? `style="padding: 12px 15px; border: 1px solid ${borderColor}; background: ${bgColor}; border-radius: 6px; margin: 8px; border-bottom: none;"`
                        : `style="padding: 12px 15px; border-radius: 6px; margin: 8px; border-bottom: none;"`;

                    return `
                        <div class="notif-item ${isTicket ? 'notif-item-ticket' : ''}" data-notif-id="${notifId}" ${styleAttrs}>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <div>
                                    <p style="margin: 0; color: #F9A8D4; font-size: 13px; line-height: 1.45;">${text}</p>
                                    <p style="margin: 6px 0 0; color: #8B8B9E; font-size: 11px;">${time}</p>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap;">
                                ${hasDownloadTarget ? `<button type="button" class="notif-open-post" data-notif-id="${notifId}" data-download-id="${downloadId}" style="flex: 1; min-width: 70px; padding: 8px 10px; border: 1px solid #6B46C1; border-radius: 6px; background: rgba(107, 70, 193, 0.2); color: #E9D5FF; cursor: pointer; font-size: 12px; font-weight: 600;">Ir ao post</button>` : ''}
                                ${(isComment && hasDownloadTarget) ? `<button type="button" class="notif-open-comments" data-notif-id="${notifId}" data-download-id="${downloadId}" style="flex: 1; min-width: 70px; padding: 8px 10px; border: 1px solid #EC4899; border-radius: 6px; background: rgba(236, 72, 153, 0.2); color: #FBCFE8; cursor: pointer; font-size: 12px; font-weight: 600;">Responder</button>` : ''}
                                <button type="button" class="notif-mark-read" data-notif-id="${notifId}" style="padding: 8px 10px; border: 1px solid #374151; border-radius: 6px; background: rgba(55, 65, 81, 0.35); color: #D1D5DB; cursor: pointer; font-size: 12px; font-weight: 600;">Lida</button>
                                <button type="button" class="notif-delete" data-notif-id="${notifId}" style="padding: 8px 10px; border: 1px solid #EF4444; border-radius: 6px; background: rgba(239, 68, 68, 0.2); color: #FECACA; cursor: pointer; font-size: 12px; font-weight: 600;">Excluir</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            html += `
                <div style="padding: 15px; border-top: 1px solid rgba(236, 72, 153, 0.2);">
                    <button type="button" class="notif-mark-all-read" style="width: 100%; padding: 10px; background: linear-gradient(135deg, #EC4899, #6B46C1); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Marcar tudo como lido
                    </button>
                </div>
            `;

            modal.innerHTML = html;
            document.body.appendChild(modal);
            const noNotificationsState = '<div class="notif-empty" style="padding: 30px; text-align: center; color: #999;">Nenhuma notifica\u00e7\u00e3o</div>';

            const syncModalAfterRead = async (row) => {
                if (row) row.remove();
                await this.updateNotificationBadge();

                const hasRows = modal.querySelector('.notif-item');
                if (!hasRows && !modal.querySelector('.notif-empty')) {
                    const footer = modal.querySelector('.notif-mark-all-read')?.closest('div');
                    if (footer) {
                        footer.insertAdjacentHTML('beforebegin', noNotificationsState);
                    }
                }
            };

            const closeBtn = modal.querySelector('.notifications-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => modal.remove());
            }

            modal.querySelectorAll('.notif-mark-read').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const notificationId = String(btn.dataset.notifId || '').trim(); // Manter como string
                    await this.markNotificationAsRead(notificationId);

                    const row = btn.closest('.notif-item');
                    await syncModalAfterRead(row);
                });
            });

            modal.querySelectorAll('.notif-delete').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const notificationId = String(btn.dataset.notifId || '').trim(); // Manter como string
                    
                    try {
                        const response = await this.apiRequest(`/downloads/notifications/${notificationId}`, {
                            method: 'DELETE'
                        });
                        
                        if (response.success) {
                            const row = btn.closest('.notif-item');
                            await syncModalAfterRead(row);
                            console.log('[NavbarManager] Notificação deletada:', notificationId);
                        }
                    } catch (error) {
                        console.error('[NavbarManager] Erro ao deletar notificação:', error);
                    }
                });
            });

            // Não marcar notificação como lida ao clicar no item inteiro —
            // ações explícitas devem ser feitas pelos botões 'Lida' ou 'Excluir'.
            // Isso evita que um clique acidental fora dos botões remova a notificação.

            modal.querySelectorAll('.notif-open-post').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const notificationId = String(btn.dataset.notifId || '').trim(); // Manter como string
                    const downloadId = Number(btn.dataset.downloadId);
                    await this.openNotificationTarget(notificationId, downloadId, false);
                });
            });

            modal.querySelectorAll('.notif-open-comments').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const notificationId = String(btn.dataset.notifId || '').trim(); // Manter como string
                    const downloadId = Number(btn.dataset.downloadId);
                    await this.openNotificationTarget(notificationId, downloadId, true);
                });
            });

            const markAllBtn = modal.querySelector('.notif-mark-all-read');
            if (markAllBtn) {
                markAllBtn.addEventListener('click', async () => {
                    await this.markAllNotificationsAsRead();
                    await this.updateNotificationBadge();
                    modal.remove();
                });
            }

            setTimeout(() => {
                document.addEventListener('click', function closeModal(e) {
                    if (!e.target.closest('.notifications-modal') && !e.target.closest('#notificationBell')) {
                        modal.remove();
                        document.removeEventListener('click', closeModal);
                    }
                });
            }, 0);
        } catch (error) {
            console.error('[NavbarManager] Error showing notifications:', error);
        }
    }
}

class RouteGuard {
    static redirectToLogin(message) {
        const loginMessage = String(message || 'Faea login para continuar');
        window.location.href = `login.html?message=${encodeURIComponent(loginMessage)}`;
    }

    static async requireAuth(options = {}) {
        const {
            loginMessage = 'Faea login para acessar esta pegina',
            invalidSessionMessage = 'Sesseo invelida. Faea login novamente.',
            validateSession = true
        } = options;

        const token = AuthManager.getToken();
        if (!token) {
            this.redirectToLogin(loginMessage);
            return false;
        }

        if (!validateSession) {
            return true;
        }

        const isValid = await NavbarManager.isSessionValid();
        if (!isValid) {
            AuthManager.removeToken();
            this.redirectToLogin(invalidSessionMessage);
            return false;
        }

        return true;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    NavbarManager.init();
});









