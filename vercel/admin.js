// Script para Painel Admin - Nova Versão com conquistas Customizáveis

const MAX_ACHIEVEMENT_BG_FILE_BYTES = 20 * 1024 * 1024;
const MAX_RANK_BACKGROUND_FILE_BYTES = 500 * 1024 * 1024;
const MAX_INLINE_RANK_BACKGROUND_FILE_BYTES = 35 * 1024 * 1024;
const ALLOWED_RANK_BACKGROUND_FILE_TYPES = new Set(['image/gif', 'image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_RANK_BACKGROUND_FILE_EXT = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp']);

document.addEventListener('DOMContentLoaded', async function() {
    try {
        console.log('Admin pages loaded');

        // Verificar token primeiro
        const token = AuthAPI.getToken();
        if (!token) {
            console.log('[ADMIN] Token não encontrado, redirecionando para login');
            window.location.href = 'login.html?message=' + encodeURIComponent('Faça login para acessar o painel administrativo');
            return;
        }

        // Validar permissões de admin
        console.log('[ADMIN] Verificando permissões de admin...');
        const adminPermission = await AuthAPI.checkAdminPermission();
        console.log('[ADMIN] Resposta de permissão:', adminPermission);
        
        if (!adminPermission?.success || !adminPermission?.hasAccess) {
            console.log('[ADMIN] Sem permissão de admin, redirecionando para perfil', {
                success: adminPermission?.success,
                hasAccess: adminPermission?.hasAccess,
                isAdmin: adminPermission?.isAdmin
            });
            window.location.href = 'profile.html?message=' + encodeURIComponent('Você não tem permissão para acessar o painel administrativo');
            return;
        }
        
        console.log('[ADMIN] Permissão confirmada! Configurando painel...');
        const ADMIN_ACTIVE_TAB_STORAGE_KEY = 'admin-active-tab';
        const loadedTabs = new Set();
        let currentUsersSearchTerm = '';
        let currentUsersPage = 1;
        let cachedUsers = [];
        let filteredUsers = [];
        let usersSearchDebounceTimeout = null;
        let messageTimeoutId = null;
        const rawEmailByUserId = new Map();
        const userLabelByUserId = new Map();
        let canRevealEmails = false;
        let adminCanViewStaffHierarchy = false;
        let adminIsOwnerAccount = false;
        let manualRankOverridesCache = {};
        let currentAdminProfilePromise = null;
        let themedRankSelectGlobalHandlersBound = false;
        const OWNER_EMAIL_VIEWER = 'sustmanrft@hotmail.com';
        const ADMIN_TAB_ACCESS_OPTIONS = [
            { key: 'ranks', label: 'Conquistas' },
            { key: 'events', label: 'Eventos' },
            { key: 'appearance', label: 'Aparência' },
            { key: 'users', label: 'Usuários' },
            { key: 'account', label: 'Conta do usuário' },
            { key: 'sendmail', label: 'Sendmail' },
            { key: 'staffHierarchy', label: 'Hierarquia' },
            { key: 'postPermissions', label: 'Permissões' },
            { key: 'navbar', label: 'Navbar' },
            { key: 'bans', label: 'Moderação' },
            { key: 'suspendedPosts', label: 'Postagens Suspensas' }
        ];
        const ADMIN_PANEL_TAB_OPTIONS = [
            { key: 'ranks', field: 'adminPanelTabRanks', label: 'Conquistas' },
            { key: 'postPermissions', field: 'adminPanelTabPostPermissions', label: 'Permissões' },
            { key: 'bans', field: 'adminPanelTabBans', label: 'Moderação' },
            { key: 'suspendedPosts', field: 'adminPanelTabSuspendedPosts', label: 'Postagens Suspensas' },
            { key: 'events', field: 'adminPanelTabEvents', label: 'Eventos' },
            { key: 'appearance', field: 'adminPanelTabAppearance', label: 'Aparência' },
            { key: 'users', field: 'adminPanelTabUsers', label: 'Usuários' },
            { key: 'account', field: 'adminPanelTabAccount', label: 'Conta do usuário' },
            { key: 'sendmail', field: 'adminPanelTabSendmail', label: 'Sendmail' },
            { key: 'staffHierarchy', field: 'canViewStaffHierarchy', label: 'Hierarquia' },
            { key: 'navbar', field: 'adminPanelTabNavbar', label: 'Navbar' }
        ];
        const FOUNDER_ACHIEVEMENT_NAME = 'Fundador';
        const FOUNDER_ACHIEVEMENT_DESCRIPTION = 'Conquista do Fundador';
        const FOUNDER_ACHIEVEMENT_COLOR = '#ff0066';
        const USERS_PER_PAGE = 20;
        const achievementHoverGifStaticPreviewCache = new Map();
        adminCanViewStaffHierarchy = adminPermission?.adminTabAccess?.staffHierarchy === true
            || adminPermission?.isAdmin === true;
        await configureOwnerOnlyAdminUI();

        // ===== MODAIS CUSTOMIZADOS COM TEMA =====
        async function showThemedConfirm(message) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
                
                const modal = document.createElement('div');
                modal.style.cssText = 'background:linear-gradient(135deg, #1a0f2e 0%, #16213e 100%);border:2px solid #EC4899;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(236,72,153,0.3);';
                
                const title = document.createElement('h3');
                title.textContent = 'Confirmação';
                title.style.cssText = 'color:#EC4899;margin:0 0 12px 0;font-size:18px;font-weight:700;';
                
                const msgEl = document.createElement('p');
                msgEl.textContent = message;
                msgEl.style.cssText = 'color:#E2E8F0;margin:0 0 20px 0;font-size:14px;line-height:1.5;';
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
                
                const btnNo = document.createElement('button');
                btnNo.textContent = 'Cancelar';
                btnNo.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid rgba(236,72,153,0.4);background:transparent;color:#E2E8F0;cursor:pointer;font-weight:600;transition:all 0.2s;';
                btnNo.onmouseover = () => btnNo.style.background = 'rgba(236,72,153,0.1)';
                btnNo.onmouseout = () => btnNo.style.background = 'transparent';
                btnNo.onclick = () => { document.body.removeChild(overlay); resolve(false); };
                
                const btnYes = document.createElement('button');
                btnYes.textContent = 'Confirmar';
                btnYes.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid #EC4899;background:linear-gradient(135deg, #EC4899, #8B5CF6);color:#fff;cursor:pointer;font-weight:700;transition:all 0.2s;';
                btnYes.onmouseover = () => btnYes.style.boxShadow = '0 4px 16px rgba(236,72,153,0.4)';
                btnYes.onmouseout = () => btnYes.style.boxShadow = 'none';
                btnYes.onclick = () => { document.body.removeChild(overlay); resolve(true); };
                
                btnContainer.appendChild(btnNo);
                btnContainer.appendChild(btnYes);
                
                modal.appendChild(title);
                modal.appendChild(msgEl);
                modal.appendChild(btnContainer);
                overlay.appendChild(modal);
                
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                        resolve(false);
                    }
                };
                
                document.body.appendChild(overlay);
                btnYes.focus();
            });
        }

        async function showThemedPrompt(message, defaultValue = '') {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
                
                const modal = document.createElement('div');
                modal.style.cssText = 'background:linear-gradient(135deg, #1a0f2e 0%, #16213e 100%);border:2px solid #EC4899;border-radius:12px;padding:24px;max-width:400px;width:90%;box-shadow:0 10px 40px rgba(236,72,153,0.3);';
                
                const title = document.createElement('h3');
                title.textContent = 'Entrada de Dados';
                title.style.cssText = 'color:#EC4899;margin:0 0 12px 0;font-size:18px;font-weight:700;';
                
                const msgEl = document.createElement('p');
                msgEl.textContent = message;
                msgEl.style.cssText = 'color:#E2E8F0;margin:0 0 16px 0;font-size:14px;line-height:1.5;';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.value = defaultValue;
                input.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #EC4899;border-radius:6px;background:rgba(0,0,0,0.3);color:#E2E8F0;font-size:14px;box-sizing:border-box;margin-bottom:20px;';
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') { document.body.removeChild(overlay); resolve(input.value); }
                    if (e.key === 'Escape') { document.body.removeChild(overlay); resolve(null); }
                };
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';
                
                const btnCancel = document.createElement('button');
                btnCancel.textContent = 'Cancelar';
                btnCancel.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid rgba(236,72,153,0.4);background:transparent;color:#E2E8F0;cursor:pointer;font-weight:600;transition:all 0.2s;';
                btnCancel.onmouseover = () => btnCancel.style.background = 'rgba(236,72,153,0.1)';
                btnCancel.onmouseout = () => btnCancel.style.background = 'transparent';
                btnCancel.onclick = () => { document.body.removeChild(overlay); resolve(null); };
                
                const btnOk = document.createElement('button');
                btnOk.textContent = 'OK';
                btnOk.style.cssText = 'padding:10px 16px;border-radius:6px;border:1px solid #EC4899;background:linear-gradient(135deg, #EC4899, #8B5CF6);color:#fff;cursor:pointer;font-weight:700;transition:all 0.2s;';
                btnOk.onmouseover = () => btnOk.style.boxShadow = '0 4px 16px rgba(236,72,153,0.4)';
                btnOk.onmouseout = () => btnOk.style.boxShadow = 'none';
                btnOk.onclick = () => { document.body.removeChild(overlay); resolve(input.value); };
                
                btnContainer.appendChild(btnCancel);
                btnContainer.appendChild(btnOk);
                
                modal.appendChild(title);
                modal.appendChild(msgEl);
                modal.appendChild(input);
                modal.appendChild(btnContainer);
                overlay.appendChild(modal);
                
                overlay.onclick = (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                        resolve(null);
                    }
                };
                
                document.body.appendChild(overlay);
                input.focus();
                input.select();
            });
        }

        console.log('[ADMIN] Anexando event listeners...');
// ------------------
// Email Broadcast Tab (simplified)
// ------------------
function initSendEmailForm() {
    const recipientTypeSelect = document.getElementById('emailRecipientType');
    const specificUserContainer = document.getElementById('specificUserContainer');
    const specificUserEmail = document.getElementById('specificUserEmail');
    const sendBtn = document.getElementById('sendEmailBtn');
    const clearBtn = document.getElementById('clearEmailFormBtn');
    const messageDiv = document.getElementById('emailFormMessage');
    const messageDivEditable = document.getElementById('emailMessage');
    const attachmentsInput = document.getElementById('emailAttachments');
    const toolbar = document.querySelector('.rich-editor-toolbar');

    if (!recipientTypeSelect) return;

    // local message helper for this form
    function localShow(msg, type = 'info') {
        if (!messageDiv) return;
        messageDiv.textContent = msg;
        messageDiv.className = 'message ' + String(type || 'info');
        messageDiv.style.display = 'block';
        setTimeout(() => { if (messageDiv) messageDiv.style.display = 'none'; }, 5000);
    }

    // Show/hide specific user email input based on recipient type
    recipientTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'specific') {
            specificUserContainer.style.display = 'block';
            specificUserEmail.required = true;
        } else {
            specificUserContainer.style.display = 'none';
            specificUserEmail.required = false;
        }
    });

    // Rich text toolbar
    if (toolbar && messageDivEditable) {
        toolbar.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-cmd]');
            if (!btn) return;
            const cmd = btn.getAttribute('data-cmd');
            document.execCommand(cmd, false, null);
            messageDivEditable.focus();
        });

        const insertLinkBtn = document.getElementById('insertLinkBtn');
        if (insertLinkBtn) {
            insertLinkBtn.addEventListener('click', () => {
                const url = prompt('Insira o URL do link (inclua http:// ou https://):');
                if (url) document.execCommand('createLink', false, url.trim());
                messageDivEditable.focus();
            });
        }

        // Insert image button - allows embedding images inline
        const insertImageBtn = document.getElementById('insertImageBtn');
        const imageUploadInput = document.getElementById('imageUploadInput');
        if (insertImageBtn && imageUploadInput) {
            insertImageBtn.addEventListener('click', () => {
                imageUploadInput.click();
            });

            imageUploadInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0];
                if (file && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target?.result;
                        if (base64) {
                            const img = `<img src="${base64}" alt="Imagem" style="max-width:100%;height:auto;border-radius:8px;margin:10px 0;">`;
                            document.execCommand('insertHTML', false, img);
                        }
                    };
                    reader.readAsDataURL(file);
                }
                // Reset input
                imageUploadInput.value = '';
                messageDivEditable.focus();
            });
        }
    }

    // Send email button
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            const subject = document.getElementById('emailSubject').value.trim();
            const message = (messageDivEditable && messageDivEditable.innerHTML) ? messageDivEditable.innerHTML.trim() : '';
            const recipientType = recipientTypeSelect.value;

            if (!subject || !message || message === '<br>' || message === '') {
                localShow('Assunto e mensagem são obrigatórios', 'error');
                return;
            }

            if (recipientType === 'specific' && !specificUserEmail.value.trim()) {
                    localShow('Email do usuário é obrigatório', 'error');
                return;
            }

            sendBtn.disabled = true;
            sendBtn.textContent = 'Enviando...';

            try {
                // Always send as FormData to support multiple attachments and HTML message
                const fd = new FormData();
                fd.append('subject', subject);
                fd.append('message', message);
                fd.append('mediaUrl', '');
                fd.append('mediaType', '');
                if (recipientType === 'specific') fd.append('email', specificUserEmail.value.trim());

                if (attachmentsInput && attachmentsInput.files && attachmentsInput.files.length) {
                    Array.from(attachmentsInput.files).forEach((f) => fd.append('attachments', f));
                }

                const endpoint = recipientType === 'all' ? `${API_URL}/admin/emails/send-to-all` : `${API_URL}/admin/emails/send-to-user`;

                // When sending FormData do NOT set Content-Type header; the browser
                // will set the proper multipart boundary. Only send the Authorization
                // header if present.
                const token = AuthAPI.getToken();
                const headers = token ? { Authorization: `Bearer ${token}` } : {};

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: fd
                });

                const result = await res.json();

                if (result?.success) {
                    localShow(result.message || `Email enviado para ${result.sent || 1} usuário(s)`, 'success');
                    // Clear form after success
                    document.getElementById('emailSubject').value = '';
                    if (messageDivEditable) messageDivEditable.innerHTML = '';
                    specificUserEmail.value = '';
                    recipientTypeSelect.value = 'all';
                    specificUserContainer.style.display = 'none';
                } else {
                    localShow(result?.message || 'Erro ao enviar email', 'error');
                }
            } catch (err) {
                console.error('Erro ao enviar email:', err);
                localShow('Erro ao enviar email', 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Enviar E-mail';
            }
        });
    }

    // Clear form button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            document.getElementById('emailSubject').value = '';
            if (messageDivEditable) messageDivEditable.innerHTML = '';
            specificUserEmail.value = '';
            recipientTypeSelect.value = 'all';
            specificUserContainer.style.display = 'none';
            if (attachmentsInput) attachmentsInput.value = null;
            messageDiv.style.display = 'none';
        });
    }
}


const ACHIEVEMENT_EDITOR_GROUP_KEYS = ['like_achievement', 'post_achievement', 'progression', 'general'];
const ACHIEVEMENT_CARD_ANIMATION_MODES = new Set(['hover', 'always']);

const achievementBackgroundState = {
    like_achievement: '',
    post_achievement: '',
    progression: ''
};

const achievementEditorState = {
    like_achievement: [],
    post_achievement: [],
    progression: [],
    general: [],
    selected: {
        like_achievement: '',
        post_achievement: '',
        progression: '',
        general: ''
    },
    animationModes: {}
};

function normalizeEmailValue(value) {
    return String(value || '').trim().toLowerCase();
}

async function isCurrentAdminOwnerAccount() {
    if (!currentAdminProfilePromise) {
        currentAdminProfilePromise = (async () => {
            try {
                const result = await AuthAPI.getProfile();
                const email = normalizeEmailValue(result?.user?.email || '');
                return email === normalizeEmailValue(OWNER_EMAIL_VIEWER);
            } catch (error) {
                console.warn('Não foi possível verificar conta do admin atual:', error);
                return false;
            }
        })();
    }

    return currentAdminProfilePromise;
}

async function configureOwnerOnlyAdminUI() {
    adminIsOwnerAccount = adminPermission?.isOwner === true
        || adminPermission?.isAdmin === true
        || await isCurrentAdminOwnerAccount();

    document.querySelectorAll('[data-owner-only="1"]').forEach((element) => {
        element.hidden = !adminIsOwnerAccount;
    });

    document.querySelectorAll('[data-admin-tab-access]').forEach((element) => {
        const permissionKey = String(element.dataset.adminTabAccess || '');
        element.hidden = !adminIsOwnerAccount && adminPermission?.adminTabAccess?.[permissionKey] !== true;
    });

    document.querySelectorAll('[data-hierarchy-view="1"]').forEach((element) => {
        element.hidden = !adminCanViewStaffHierarchy;
    });
}

function normalizeAdminTabName(tabName) {
    const value = String(tabName || '').trim();
    if (!value) return '';
    const buttonEl = document.querySelector(`.tab-btn[data-tab="${value}"]`);
    const contentEl = document.getElementById(`${value}-tab`);
    const hasButton = Boolean(buttonEl) && !buttonEl.hidden;
    const hasContent = Boolean(contentEl) && !contentEl.hidden;
    return hasButton && hasContent ? value : '';
}

function resolveInitialAdminTab() {
    try {
        const storedTab = sessionStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY);
        const normalizedStoredTab = normalizeAdminTabName(storedTab);
        if (normalizedStoredTab) {
            return normalizedStoredTab;
        }
    } catch (error) {
        console.warn('Não foi possível ler aba salva do admin:', error);
    }

    const htmlDefault = document.querySelector('.tab-btn.active')?.dataset?.tab;
    const firstVisibleTab = [...document.querySelectorAll('.tab-btn')]
        .find((button) => !button.hidden)?.dataset?.tab;
    return normalizeAdminTabName(htmlDefault) || normalizeAdminTabName(firstVisibleTab) || 'ranks';
}

function persistAdminTab(tabName) {
    try {
        sessionStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, tabName);
    } catch (error) {
        console.warn('Não foi possível salvar aba ativa do admin:', error);
    }
}

// Vincula clique dos botões de aba ao ativador de abas
function bindAdminTabClicks() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        if (btn.dataset.boundTabClick === '1') return;
        btn.dataset.boundTabClick = '1';
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const target = String(btn.getAttribute('data-tab') || '').trim();
            if (!target) return;
            try {
                await setActiveAdminTab(target, { persist: true, load: true });
            } catch (err) {
                console.error('[ADMIN] Erro ao ativar aba via clique:', err);
            }
        });
    });
}

async function setActiveAdminTab(tabName, { persist = true, load = true } = {}) {
    const firstVisibleTab = [...document.querySelectorAll('.tab-btn')]
        .find((button) => !button.hidden)?.dataset?.tab;
    const normalizedTab = normalizeAdminTabName(tabName)
        || normalizeAdminTabName(firstVisibleTab)
        || 'ranks';
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach((btn) => {
        const btnTabName = String(btn.getAttribute('data-tab') || '').trim();
        btn.classList.toggle('active', btnTabName === normalizedTab);
    });

    tabContents.forEach((content) => {
        content.classList.toggle('active', content.id === `${normalizedTab}-tab`);
    });

    if (persist) {
        persistAdminTab(normalizedTab);
    }

    if (load) {
        await loadTabData(normalizedTab);
    }

    return normalizedTab;
}

const EN_TO_PT_PROGRESSION = new Map([
    ['adept', 'Membro Adepto'],
    ['alpha', 'Membro Experiente'],
    ['apprentice', 'Membro Aprendiz'],
    ['beta', 'Membro Inicial'],
    ['eternal', 'Membro Eterno'],
    ['expert', 'Membro Especialista'],
    ['master', 'Membro Mestre'],
    ['grand master', 'Grande Mestre'],
    ['grandmaster', 'Grande Mestre'],
    ['legend', 'Membro Lendário'],
    ['legendary', 'Membro Lendário'],
    ['mythic', 'Membro Mítico'],
    ['transcendent', 'Membro Transcendente'],
    ['immortal', 'Membro Imortal'],
    ['novice', 'Membro Novato'],
    ['initiated', 'Membro Iniciado'],
    ['initiate', 'Membro Iniciado']
]);

function normalizeAchievementNameKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

const PROGRESSION_RANK_NAME_KEYS = new Set([
    'membro inicial','membro novato','membro iniciado','membro aprendiz','membro experiente','membro adepto',
    'membro especialista','membro mestre','grande mestre','membro lendario','membro mitico','membro transcendente',
    'membro eterno','membro imortal','membro beta','membro ativo',
    'beta','alpha','initiate','initiated','apprentice','expert','adept','master','grand master','grandmaster',
    'legend','legendary','mythic','transcendent','eternal','immortal','novice'
]);

function localizeRankName(rawName) {
    if (!rawName) return '';
    const normalized = normalizeAchievementNameKey(rawName);
    const stripped = normalized.replace(/\(.+?\)/g, '').trim();
    const knownPortuguese = [
        'membro novato','membro iniciado','membro aprendiz','membro experiente','membro adepto',
        'membro especialista','membro mestre','grande mestre','membro lendario','membro mitico',
        'membro transcendente','membro eterno','membro imortal','membro inicial','membro beta','membro ativo'
    ];

    if (knownPortuguese.includes(normalized) || knownPortuguese.includes(stripped)) {
        return String(rawName || '').trim();
    }

    if (EN_TO_PT_PROGRESSION.has(normalized)) return EN_TO_PT_PROGRESSION.get(normalized);
    if (EN_TO_PT_PROGRESSION.has(stripped)) return EN_TO_PT_PROGRESSION.get(stripped);

    for (const [enKey, ptValue] of EN_TO_PT_PROGRESSION.entries()) {
        if (
            stripped === enKey ||
            stripped.startsWith(`${enKey} `) ||
            stripped.endsWith(` ${enKey}`) ||
            stripped.includes(` ${enKey} `)
        ) {
            return ptValue;
        }
    }

    return String(rawName || '').trim();
}

function resolveRankBackgroundUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
    if (!raw.startsWith('/')) return raw;

    const baseFromApi = typeof API_URL === 'string'
        ? API_URL.replace(/\/api\/?$/i, '').replace(/\/+$/, '')
        : '';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const fallbackBase = isLocalhost ? 'http://localhost:3000' : 'https://guildaholiday.discloud.dev';
    return `${baseFromApi || fallbackBase}${raw}`;
}

function isExampleEmail(userOrEmail) {
    if (typeof userOrEmail === 'object' && userOrEmail !== null) {
        if (typeof userOrEmail.isExampleEmail === 'boolean') {
            return userOrEmail.isExampleEmail;
        }
        return String(userOrEmail.email || '').trim().toLowerCase().endsWith('@example.com');
    }
    return String(userOrEmail || '').trim().toLowerCase().endsWith('@example.com');
}

function maskEmail(email) {
    const raw = String(email || '').trim();
    const atIndex = raw.indexOf('@');
    if (atIndex <= 0 || atIndex === raw.length - 1) return '***';

    const local = raw.slice(0, atIndex);
    const domain = raw.slice(atIndex + 1);

    const localStart = local.slice(0, 2);
    const localEnd = local.length > 2 ? local.slice(-1) : '';
    const domainParts = domain.split('.');
    const mainDomain = domainParts[0] || '';
    const tld = domainParts.slice(1).join('.') || '';

    const maskedLocal = `${localStart}${'*'.repeat(Math.max(2, local.length - 3))}${localEnd}`;
    const maskedDomain = mainDomain.length > 2
        ? `${mainDomain[0]}${'*'.repeat(mainDomain.length - 2)}${mainDomain.slice(-1)}`
        : `${mainDomain[0] || '*'}*`;

    return `${maskedLocal}@${maskedDomain}${tld ? '.' + tld : ''}`;
}

function setCreateRankSubmitting(isSubmitting) {
    const createRankForm = document.getElementById('createRankForm');
    if (!createRankForm) return;

    const submitButton = createRankForm.querySelector('button[type="submit"]');
    if (!submitButton) return;

    if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent || 'Criar conquista';
    }

    if (isSubmitting) {
        submitButton.disabled = true;
        submitButton.textContent = 'Criando...';
        submitButton.style.opacity = '0.72';
        submitButton.style.cursor = 'not-allowed';
        return;
    }

    submitButton.disabled = false;
    submitButton.textContent = submitButton.dataset.originalText;
    submitButton.style.opacity = '';
    submitButton.style.cursor = '';
}

function setCreateManualEventSubmitting(isSubmitting) {
    const form = document.getElementById('createManualEventForm');
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;

    if (!submitButton.dataset.originalText) {
        submitButton.dataset.originalText = submitButton.textContent || 'Criar evento manual';
    }

    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Criando evento...' : submitButton.dataset.originalText;
    submitButton.style.opacity = isSubmitting ? '0.75' : '';
    submitButton.style.cursor = isSubmitting ? 'not-allowed' : '';
}

async function loadTabData(tabName, { force = false } = {}) {
    const key = String(tabName || '').trim();
    if (!key) return;
    const shouldBypassCache = key === 'achievement-editor';
    if (!force && loadedTabs.has(key) && !shouldBypassCache) return;

    if (key === 'ranks') {
        await Promise.all([loadDefaultRanks(), loadCustomRanks(), loadSocialLinks()]);
        loadedTabs.add(key);
        return;
    }

    if (key === 'navbar') {
        await loadSocialLinks();
        loadedTabs.add(key);
        return;
    }

    if (key === 'events') {
        await loadManualEvents();
        loadedTabs.add(key);
        return;
    }

    if (key === 'achievement-editor') {
        await loadAchievementEditorData();
        loadedTabs.add(key);
        return;
    }

    if (key === 'users') {
        await loadUsers();
        loadedTabs.add(key);
        return;
    }
    if (key === 'account') {
        const message = document.getElementById('googleLoginAccountsMessage');
        if (message) message.textContent = 'Pesquise pelo menos 2 caracteres do nickname ou e-mail da conta Google.';
        loadedTabs.add(key);
        return;
    }
    if (key === 'sendmail') {
        await loadSendmailTab();
        loadedTabs.add(key);
        return;
    }

    if (key === 'staff-hierarchy') {
        if (!adminCanViewStaffHierarchy) return;
        await loadStaffHierarchy();
        loadedTabs.add(key);
        return;
    }

    if (key === 'post-permissions') {
        await Promise.all([loadPostPermissions(), loadPostageRanks()]);
        loadedTabs.add(key);
        return;
    }

    if (key === 'bans') {
        await loadBans();
        loadedTabs.add(key);
        return;
    }

    if (key === 'suspended-posts') {
        await loadSuspendedPosts();
        loadedTabs.add(key);
        return;
    }
}

async function searchGoogleLoginAccounts() {
    const searchInput = document.getElementById('googleLoginAccountSearch');
    const message = document.getElementById('googleLoginAccountsMessage');
    const results = document.getElementById('googleLoginAccountsResults');
    if (!searchInput || !message || !results) return;

    const query = String(searchInput.value || '').trim();
    if (query.length < 2) {
        message.textContent = 'Digite pelo menos 2 caracteres para buscar.';
        results.replaceChildren();
        return;
    }

    message.textContent = 'Buscando contas vinculadas ao Google...';
    results.replaceChildren();
    const response = await AuthAPI.searchGoogleLoginUsers(query);
    if (!response?.success) {
        message.textContent = response?.message || 'Não foi possível buscar contas Google.';
        return;
    }

    const users = Array.isArray(response.users) ? response.users : [];
    if (users.length === 0) {
        message.textContent = 'Nenhuma conta vinculada ao Google foi encontrada.';
        return;
    }

    message.textContent = `${users.length} conta(s) encontrada(s).`;
    results.innerHTML = `
        <div style="overflow-x:auto;">
            <table class="users-table">
                <thead><tr><th>Nickname</th><th>E-mail</th><th>Status</th><th>Ação</th></tr></thead>
                <tbody>
                    ${users.map((user) => {
                        const verified = user.emailVerified === true;
                        const googleEnabled = user.googleLoginEnabled !== false;
                        const controls = !verified
                            ? '<button type="button" disabled style="padding:8px 12px;border:0;border-radius:6px;opacity:.55;">E-mail não verificado</button>'
                            : `${googleEnabled
                                ? `<button type="button" class="account-access-action-btn" data-action="disable-google" data-user-id="${Number(user.id)}" style="padding:8px 12px;border:0;border-radius:6px;background:linear-gradient(135deg,#6B46C1,#EC4899);color:#fff;font-weight:600;cursor:pointer;">Desativar Google + enviar senha</button>`
                                : `<button type="button" class="account-access-action-btn" data-action="enable-google" data-user-id="${Number(user.id)}" style="padding:8px 12px;border:0;border-radius:6px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer;">Ativar Google</button>`}
                            <button type="button" class="account-access-action-btn" data-action="send-password" data-user-id="${Number(user.id)}" style="margin-left:6px;padding:8px 12px;border:1px solid rgba(236,72,153,.65);border-radius:6px;background:transparent;color:#fff;cursor:pointer;">Enviar nova senha</button>`;
                        return `<tr>
                            <td>${escapeHtmlAdmin(user.nickname)}</td>
                            <td>${escapeHtmlAdmin(user.email)}</td>
                            <td>${verified ? 'E-mail verificado' : 'E-mail não verificado'}<br>Google ${googleEnabled ? 'ativo' : 'desativado'}</td>
                            <td>${controls}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

async function searchAdminTabAccessUsers() {
    const searchInput = document.getElementById('adminTabAccessSearch');
    const message = document.getElementById('adminTabAccessMessage');
    const results = document.getElementById('adminTabAccessResults');
    if (!searchInput || !message || !results) return;

    const query = String(searchInput.value || '').trim();
    if (query.length < 2) {
        message.textContent = 'Digite pelo menos 2 caracteres para buscar.';
        results.replaceChildren();
        return;
    }

    message.textContent = 'Buscando usuários...';
    results.replaceChildren();
    const response = await AuthAPI.searchAdminTabAccessUsers(query);
    if (!response?.success) {
        message.textContent = response?.message || 'Não foi possível buscar usuários.';
        return;
    }

    const users = Array.isArray(response.users) ? response.users : [];
    if (users.length === 0) {
        message.textContent = 'Nenhum usuário encontrado.';
        return;
    }

    message.textContent = `${users.length} usuário(s) encontrado(s).`;
    results.innerHTML = users.map((user) => {
        const userId = Number(user.id);
        const displayName = escapeHtmlAdmin(user.fullName || user.nickname || `ID ${userId}`);
        const nickname = escapeHtmlAdmin(user.nickname || '');
        const email = escapeHtmlAdmin(user.maskedEmail || '');
        const userIdentity = `
            <strong>${displayName}</strong>
            ${nickname ? `<div style="font-size:12px;opacity:.8;">Nickname: ${nickname}</div>` : ''}
            <div style="font-size:12px;opacity:.75;">${email}</div>
        `;
        if (user.isOwnerAccount) {
            return `<div class="admin-section" style="margin-top:12px;">
                ${userIdentity}
                <span style="opacity:.75;">Owner (acesso total permanente)</span>
            </div>`;
        }

        const permissionControls = ADMIN_TAB_ACCESS_OPTIONS.map(({ key, label }) => {
            const isInherited = user.inheritedPermissions?.[key] === true;
            const isEnabled = user.effectivePermissions?.[key] === true;
            const hasIndividualGrant = user.permissions?.[key] === true;
            return `
                <label style="display:flex;align-items:center;gap:8px;color:#F8FAFC;font-size:13px;">
                    <input type="checkbox" class="admin-tab-permission-checkbox" data-permission-key="${key}" data-direct-permission="${hasIndividualGrant}" ${isEnabled ? 'checked' : ''} ${isInherited ? 'disabled' : ''}>
                    <span>${label}${isInherited ? ' <small style="opacity:.75;">(pelo cargo)</small>' : ''}</span>
                </label>
            `;
        }).join('');
        const adminStatus = user.hasAdminPanelAccess
            ? 'Acesso ao painel ativo'
            : 'Sem acesso ao painel (as permissões ficam prontas para quando virar admin/moderador)';

        return `<div class="admin-section admin-tab-access-card" data-user-id="${userId}" style="margin-top:12px;">
            <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>${userIdentity}</div>
                <span style="font-size:12px;color:#F9A8D4;">${adminStatus}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0;">
                ${permissionControls}
            </div>
            <button type="button" class="admin-tab-access-save-btn account-search-button" data-user-id="${userId}">Salvar permissões</button>
        </div>`;
    }).join('');
}

// ===================== EVENT LISTENERS =====================
function attachEventListeners() {
    // Voltar para o perfil sem encerrar sessao
    const backToProfileBtn = document.getElementById('backToProfileBtn');
    if (backToProfileBtn) {
        backToProfileBtn.addEventListener('click', () => {
            window.location.href = 'profile.html';
        });
    }

    const createManualEventForm = document.getElementById('createManualEventForm');
    if (createManualEventForm) {
        createManualEventForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = String(document.getElementById('manualEventName')?.value || '').trim();
            const color = String(document.getElementById('manualEventColor')?.value || '#F59E0B').trim();
            const description = String(document.getElementById('manualEventDescription')?.value || '').trim();
            const customText = String(document.getElementById('manualEventCustomText')?.value || '').trim();
            const eventStartDate = String(document.getElementById('manualEventStartDate')?.value || '').trim();
            const eventEndDate = String(document.getElementById('manualEventEndDate')?.value || '').trim();
            const autoAwardOnLogin = Boolean(document.getElementById('manualEventAutoAwardOnLogin')?.checked);

            if (!name) {
                showMessage('Informe o nome do evento manual.', 'error');
                return;
            }

            setCreateManualEventSubmitting(true);
            try {
                const formData = new FormData();
                formData.append('name', name);
                formData.append('color', color);
                formData.append('icon', 'star');
                formData.append('description', description || customText);
                formData.append('isSpecial', 'true');
                if (eventStartDate) formData.append('eventStartDate', eventStartDate);
                if (eventEndDate) formData.append('eventEndDate', eventEndDate);
                formData.append('autoAwardOnLogin', autoAwardOnLogin ? 'true' : 'false');
                formData.append('eventCategory', 'manual');

                const result = await AuthAPI.createSpecialEvent(formData);
                if (result?.success) {
                    showMessage('Evento manual criado com sucesso.', 'success');
                    createManualEventForm.reset();
                    document.getElementById('manualEventColor').value = '#F59E0B';
                    await Promise.all([loadCustomRanks(), loadManualEvents()]);
                } else {
                    showMessage(result?.message || 'Não foi possível criar o evento manual.', 'error');
                }
            } catch (error) {
                console.error('Erro ao criar evento manual:', error);
                showMessage('Erro ao criar evento manual: ' + (error?.message || 'Erro desconhecido'), 'error');
            } finally {
                setCreateManualEventSubmitting(false);
            }
        });
    }

    // Criar novo conquista
    const createRankForm = document.getElementById('createRankForm');
    if (createRankForm) {
        createRankForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rankNameInput = document.getElementById('rankName');
            const rankColorInput = document.getElementById('rankColor');
            const rankDescriptionInput = document.getElementById('rankDescription');
            const rankCustomTextInput = document.getElementById('rankCustomText');

            const name = String(rankNameInput?.value || '').trim();
            const color = String(rankColorInput?.value || '').trim();
            const description = String(rankDescriptionInput?.value || '').trim();
            const customText = String(rankCustomTextInput?.value || '').trim();
            const backgroundImageUrl = document.getElementById('rankBackgroundImage').value.trim();
            const backgroundImageFile = document.getElementById('rankBackgroundImageFile').files[0];
            const enableAdminPanel = document.getElementById('rankEnableAdminPanel').checked;
            const isVisible = document.getElementById('rankIsVisible').checked;
            const canManageDownloads = document.getElementById('rankCanManageDownloads').checked;
            const canOrderAllRanks = document.getElementById('rankCanOrderAllRanks')?.checked || false;
            const canUseAnimatedProfile = document.getElementById('rankCanUseAnimatedProfile')?.checked || false;
            const canChangeOwnColor = document.getElementById('rankCanChangeOwnColor')?.checked || false;

            if (!name || !color || !description || !customText) {
                showMessage('Preencha todos os campos obrigaterios', 'error');
                return;
            }

            setCreateRankSubmitting(true);
            try {
                const normalizedName = String(name || '').trim().toLowerCase();
                const existingRanks = await AuthAPI.getAllCustomRanks();
                if (existingRanks?.success && Array.isArray(existingRanks.ranks)) {
                    const hasDuplicateName = existingRanks.ranks.some((rank) => {
                        return String(rank?.name || '').trim().toLowerCase() === normalizedName;
                    });
                    if (hasDuplicateName) {
                        showMessage('Já existe uma conquista com esse nome. Use um nome diferente.', 'error');
                        rankNameInput?.focus();
                        rankNameInput?.select();
                        return;
                    }
                }

                const resolvedBackgroundImageUrl = await resolveImageUrlFromInputs(backgroundImageUrl, backgroundImageFile);
                const result = await AuthAPI.createCustomRank(
                    name,
                    color,
                    description,
                    customText,
                    resolvedBackgroundImageUrl,
                    backgroundImageFile,
                    enableAdminPanel,
                    isVisible,
                    canManageDownloads,
                    canOrderAllRanks,
                    canUseAnimatedProfile,
                    canChangeOwnColor
                );
                if (result.success) {
                    showMessage('Conquista criada com sucesso!', 'success');
                    rankNameInput.value = '';
                    document.getElementById('rankColor').value = '#6B46C1';
                    rankDescriptionInput.value = '';
                    rankCustomTextInput.value = '';
                    document.getElementById('rankBackgroundImage').value = '';
                    document.getElementById('rankBackgroundImageFile').value = '';
                    document.getElementById('rankEnableAdminPanel').checked = false;
                    document.getElementById('rankCanManageDownloads').checked = false;
                    const canOrderAllRanksInput = document.getElementById('rankCanOrderAllRanks');
                    if (canOrderAllRanksInput) canOrderAllRanksInput.checked = false;
                    const canUseAnimatedProfileInput = document.getElementById('rankCanUseAnimatedProfile');
                    if (canUseAnimatedProfileInput) canUseAnimatedProfileInput.checked = false;
                    const canChangeOwnColorInput = document.getElementById('rankCanChangeOwnColor');
                    if (canChangeOwnColorInput) canChangeOwnColorInput.checked = false;
                    document.getElementById('rankIsVisible').checked = true;
                    loadCustomRanks();
                } else {
                    const rawMessage = String(result?.message || '').trim();
                    const duplicateName = /ja existe|já existe|unique/i.test(rawMessage);
                    showMessage(
                        duplicateName
                            ? 'Já existe uma conquista com esse nome. Use um nome diferente.'
                            : 'Erro: ' + (rawMessage || 'Falha ao criar conquista'),
                        'error'
                    );
                    if (duplicateName) {
                        rankNameInput?.focus();
                        rankNameInput?.select();
                    }
                }
            } catch (error) {
                showMessage('Erro ao criar conquista: ' + error.message, 'error');
            } finally {
                setCreateRankSubmitting(false);
            }
        });
    }

    // Salvar links do WhatsApp/Discord e descrições dos botões
    const socialLinksForm = document.getElementById('socialLinksForm');
    if (socialLinksForm) {
        socialLinksForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const whatsappUrl = document.getElementById('adminWhatsappUrl')?.value?.trim();
            const discordUrl = document.getElementById('adminDiscordUrl')?.value?.trim();
            const whatsappTooltip = document.getElementById('adminWhatsappTooltip')?.value?.trim() || 'WhatsApp';
            const discordTooltip = document.getElementById('adminDiscordTooltip')?.value?.trim() || 'Discord';
            const whatsappEnabled = document.getElementById('adminWhatsappEnabled')?.checked === true;
            const discordEnabled = document.getElementById('adminDiscordEnabled')?.checked === true;
            const navbarButtonData = getNavbarButtonsFromUi();

            if (!whatsappUrl || !discordUrl) {
                showMessage('Preencha as duas URLs da comunidade', 'error');
                return;
            }

            if (navbarButtonData.rowCount > navbarButtonData.buttons.length) {
                showMessage('Alguns botões extras têm título ou URL inválido. Preencha ou remova essas linhas antes de salvar.', 'error');
                return;
            }

            try {
                console.debug('[ADMIN] Navbar button payload before save:', navbarButtonData);
                const result = await AuthAPI.updateSocialLinks(
                    whatsappUrl,
                    discordUrl,
                    whatsappTooltip,
                    discordTooltip,
                    whatsappEnabled,
                    discordEnabled,
                    navbarButtonData.buttons
                );
                if (result.success) {
                    showMessage('Configurações de navbar atualizadas com sucesso!', 'success');
                    if (typeof NavbarManager !== 'undefined' && result.links) {
                        NavbarManager.applyCommunityLinks(result.links);
                    }
                    await loadSocialLinks();
                } else {
                    showMessage('Erro: ' + (result.message || 'Falha ao salvar links'), 'error');
                }
            } catch (error) {
                showMessage('Erro ao salvar links: ' + error.message, 'error');
            }
        });
    }

    const addNavbarButtonBtn = document.getElementById('addNavbarButtonBtn');
    if (addNavbarButtonBtn) {
        addNavbarButtonBtn.addEventListener('click', () => {
            addNavbarButton();
        });
    }

    const sendTicketToAllBtn = document.getElementById('sendTicketToAllBtn');
    if (sendTicketToAllBtn) {
        sendTicketToAllBtn.addEventListener('click', () => {
            openSendTicketModal(null, { broadcast: true });
        });
    }

    const sendmailUserSelect = document.getElementById('sendmailUserSelect');
    if (sendmailUserSelect) {
        sendmailUserSelect.addEventListener('change', () => {
            updateSendmailSelectedUserInfo();
        });
    }

    const markEmailVerifiedBtn = document.getElementById('markEmailVerifiedBtn');
    if (markEmailVerifiedBtn) {
        markEmailVerifiedBtn.addEventListener('click', () => {
            markSelectedUserEmailStatus(true);
        });
    }

    const markEmailInvalidBtn = document.getElementById('markEmailInvalidBtn');
    if (markEmailInvalidBtn) {
        markEmailInvalidBtn.addEventListener('click', () => {
            markSelectedUserEmailStatus(false);
        });
    }

    const sendEmailToUserBtn = document.getElementById('sendEmailToUserBtn');
    if (sendEmailToUserBtn) {
        sendEmailToUserBtn.addEventListener('click', () => {
            sendEmailToSelectedUser();
        });
    }

    const sendEmailToAllBtn = document.getElementById('sendEmailToAllBtn');
    if (sendEmailToAllBtn) {
        sendEmailToAllBtn.addEventListener('click', () => {
            sendEmailToAllUsers();
        });
    }

    // Banimento de usuários
    const banForm = document.getElementById('banForm');
    if (banForm) {
        banForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userToBan = document.getElementById('userToBan').value;
            const banType = document.getElementById('banType').value;
            const banDays = parseInt(document.getElementById('banDays').value);
            const banReason = document.getElementById('banReason').value;
            
            if (!userToBan || !banReason) {
                showMessage('Preencha todos os campos', 'error');
                return;
            }
            
            if (banType === 'suspension' && !banDays) {
                showMessage('Especifique os dias de suspenseo', 'error');
                return;
            }

            const banDescription = banType === 'suspension'
                ? `suspender "${userToBan}" por ${banDays} dia(s)`
                : `banir permanentemente "${userToBan}"`;
            const keyword = banType === 'suspension' ? 'SUSPENDER' : 'BANIR';
            const confirmed = await confirmCriticalAction({
                title: 'Confirmar banimento',
                message: `Você est\u00e1 prestes a ${banDescription}.`,
                keyword,
                confirmText: banType === 'suspension' ? 'Suspender usuário' : 'Banir usuário'
            });
            if (!confirmed) {
                showMessage('Operação cancelada', 'error');
                return;
            }
            
            try {
                const result = await AuthAPI.banUser(userToBan, banType, banDays, banReason);
                if (result.success) {
                    showMessage(`Usuário ${banType === 'suspension' ? 'suspenso' : 'banido'} com sucesso!`, 'success');
                    document.getElementById('userToBan').value = '';
                    document.getElementById('banDays').value = '';
                    document.getElementById('banReason').value = '';
                    loadBans();
                } else {
                    showMessage('Erro: ' + result.message, 'error');
                }
            } catch (error) {
                showMessage('Erro ao banir: ' + error.message, 'error');
            }
        });

        // Alterar UI quando mudar o tipo de ban
        document.getElementById('banType').addEventListener('change', (e) => {
            const daysDiv = document.getElementById('daysDiv');
            const banDaysInput = document.getElementById('banDays');
            if (e.target.value === 'suspension') {
                daysDiv.style.display = 'block';
                banDaysInput.required = true;
            } else {
                daysDiv.style.display = 'none';
                banDaysInput.required = false;
            }
        });
        
        // Checar e desbanir inline a partir do formulário de ban
        const checkBanBtn = document.getElementById('checkBanBtn');
        const inlineUnbanBtn = document.getElementById('inlineUnbanBtn');
        const userToBanInput = document.getElementById('userToBan');

        if (checkBanBtn && inlineUnbanBtn && userToBanInput) {
            checkBanBtn.addEventListener('click', async () => {
                const identifier = String(userToBanInput.value || '').trim();
                if (!identifier) {
                    showMessage('Digite um nickname ou e-mail para checar.', 'error');
                    return;
                }
                try {
                    const res = await AuthAPI.getBans();
                    if (!res.success || !Array.isArray(res.bans)) {
                        showMessage('Erro ao buscar banimentos', 'error');
                        return;
                    }
                    const found = res.bans.find(b => (b.nickname && b.nickname.toLowerCase() === identifier.toLowerCase()) || (b.email && b.email.toLowerCase() === identifier.toLowerCase()));
                    if (!found) {
                        showMessage('Usuário não está banido', 'success');
                        inlineUnbanBtn.style.display = 'none';
                        return;
                    }
                    // show inline unban button and store ban id on dataset
                    inlineUnbanBtn.dataset.banId = found.id;
                    inlineUnbanBtn.style.display = 'inline-block';
                    showMessage(`Ban encontrado (${found.banType}). Clique em Desbanir para remover.`, 'info');
                } catch (err) {
                    console.error('Erro ao checar ban:', err);
                    showMessage('Erro ao checar ban', 'error');
                }
            });

            inlineUnbanBtn.addEventListener('click', async () => {
                const banId = inlineUnbanBtn.dataset.banId;
                if (!banId) return;
                const confirmed = await confirmCriticalAction({
                    title: 'Desbanir usuário',
                    message: 'Tem certeza que deseja remover este banimento?',
                    confirmText: 'Desbanir',
                    keyword: 'DESBANIR'
                });
                if (!confirmed) return;
                try {
                    const result = await AuthAPI.unbanUser(banId);
                    if (result.success) {
                        showMessage('Usuário desbanido com sucesso!', 'success');
                        inlineUnbanBtn.style.display = 'none';
                        inlineUnbanBtn.dataset.banId = '';
                        loadBans();
                    } else {
                        showMessage('Erro: ' + result.message, 'error');
                    }
                } catch (error) {
                    showMessage('Erro ao desbanir: ' + error.message, 'error');
                }
            });
        }
    }

    // Gerenciar permissões de postagem
    const globalDownloadUploadsEnabled = document.getElementById('globalDownloadUploadsEnabled');
    const saveGlobalDownloadUploadsEnabled = document.getElementById('saveGlobalDownloadUploadsEnabled');
    if (globalDownloadUploadsEnabled) {
        AuthAPI.getDownloadUploadSettings().then((settings) => {
            if (settings.success) {
                globalDownloadUploadsEnabled.checked = settings.enabled === true;
            }
        }).catch((error) => {
            console.error('[ADMIN] Erro ao carregar configuração global de arquivos:', error);
        });
    }
    if (saveGlobalDownloadUploadsEnabled) {
        saveGlobalDownloadUploadsEnabled.addEventListener('click', async () => {
            saveGlobalDownloadUploadsEnabled.disabled = true;
            try {
                const settings = await AuthAPI.updateDownloadUploadSettings(globalDownloadUploadsEnabled?.checked === true);
                showMessage(
                    settings.success ? settings.message : (settings.message || 'Não foi possível salvar a configuração global.'),
                    settings.success ? 'success' : 'error'
                );
            } finally {
                saveGlobalDownloadUploadsEnabled.disabled = false;
            }
        });
    }

    const grantPermissionForm = document.getElementById('grantPermissionForm');
    if (grantPermissionForm) {
        grantPermissionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('userForPermission').value;
            
            if (!username) {
                showMessage('Digite um nickname ou e-mail', 'error');
                return;
            }

            await saveIndividualPermissions(username);
        });
    }

    const postPermissionsTable = document.getElementById('postPermissionsTable');
    if (postPermissionsTable && postPermissionsTable.dataset.boundActionEvents !== '1') {
        postPermissionsTable.dataset.boundActionEvents = '1';
        postPermissionsTable.addEventListener('click', (event) => {
            const editBtn = event.target.closest('.edit-individual-permission-btn');
            if (editBtn) {
                const username = String(editBtn.dataset.username || '').trim();
                if (!username) return;
                prefillPermissionsForm(
                    username,
                    datasetBooleanFlag(editBtn.dataset.canPostDownloads),
                    datasetBooleanFlag(editBtn.dataset.canUploadDownloads),
                    datasetBooleanFlag(editBtn.dataset.canManageDownloads),
                    datasetBooleanFlag(editBtn.dataset.canOrderFixedRanks),
                    datasetBooleanFlag(editBtn.dataset.canAccessAdminPanel),
                    datasetBooleanFlag(editBtn.dataset.canUseAnimatedProfile),
                    datasetBooleanFlag(editBtn.dataset.canChangeRankColor)
                );
                return;
            }

            const clearBtn = event.target.closest('.clear-individual-permission-btn');
            if (clearBtn) {
                const username = String(clearBtn.dataset.username || '').trim();
                if (!username) return;
                clearIndividualPermissions(username);
                return;
            }

            const legacyBtn = event.target.closest('button');
            if (!legacyBtn) return;

            const actionLabel = String(legacyBtn.textContent || '').trim().toLowerCase();
            const row = legacyBtn.closest('tr');
            if (!row) return;
            const username = String(row.querySelector('td:nth-child(1) strong')?.textContent || '').trim();
            if (!username) return;

            if (actionLabel === 'editar') {
                const parsed = parsePermissionFlagsFromTableRow(row);
                prefillPermissionsForm(
                    username,
                    parsed.canPostDownloads,
                    parsed.canUploadDownloads,
                    parsed.canManageDownloads,
                    parsed.canOrderFixedRanks,
                    parsed.canAccessAdminPanel,
                    parsed.canUseAnimatedProfile,
                    parsed.canChangeRankColor
                );
                return;
            }

            if (actionLabel.includes('revogar')) {
                clearIndividualPermissions(username);
            }
        });
    }

    // Editar conquistas (fundos)
    const achievementEditorTab = document.getElementById('achievement-editor-tab');
    if (achievementEditorTab && achievementEditorTab.dataset.boundEvents !== '1') {
        achievementEditorTab.dataset.boundEvents = '1';

        achievementEditorTab.addEventListener('click', async (event) => {
            const saveRankBtn = event.target.closest('.save-achievement-rank-bg-btn');
            if (saveRankBtn) {
                const groupKey = String(saveRankBtn.dataset.group || '').trim();
                await saveAchievementRankBackground(groupKey, saveRankBtn);
                return;
            }

            const clearRankBtn = event.target.closest('.clear-achievement-rank-bg-btn');
            if (clearRankBtn) {
                const groupKey = String(clearRankBtn.dataset.group || '').trim();
                await clearAchievementRankBackground(groupKey, clearRankBtn);
                return;
            }

            const saveCustomBgBtn = event.target.closest('.save-custom-achievement-bg-btn');
            if (saveCustomBgBtn) {
                const rankId = Number(saveCustomBgBtn.dataset.rankId || 0);
                await saveCustomAchievementBackground(rankId, saveCustomBgBtn);
                return;
            }

            const clearCustomBgBtn = event.target.closest('.clear-custom-achievement-bg-btn');
            if (clearCustomBgBtn) {
                const rankId = Number(clearCustomBgBtn.dataset.rankId || 0);
                await clearCustomAchievementBackground(rankId, clearCustomBgBtn);
                return;
            }

            const saveCustomPermsBtn = event.target.closest('.save-custom-achievement-perms-btn');
            if (saveCustomPermsBtn) {
                const rankId = Number(saveCustomPermsBtn.dataset.rankId || 0);
                await saveCustomAchievementPermissions(rankId, saveCustomPermsBtn);
                return;
            }
        });

        achievementEditorTab.addEventListener('change', (event) => {
            const rankSelect = event.target.closest('.achievement-rank-select');
            if (rankSelect) {
                const groupKey = String(rankSelect.dataset.group || '').trim();
                setSelectedAchievementRank(groupKey, rankSelect.value);
                const fileInput = getAchievementGroupFileInput(groupKey);
                if (fileInput) fileInput.value = '';
                renderAchievementGroupPreview(groupKey);
                return;
            }

            const animationSelect = event.target.closest('.achievement-animation-select');
            if (animationSelect) {
                animationSelect.value = normalizeAchievementCardAnimationMode(animationSelect.value);
                const groupKey = String(animationSelect.dataset.group || '').trim();
                applyAchievementPreviewAnimationMode(groupKey, getSelectedAchievementRank(groupKey));
                return;
            }

            const groupInput = event.target.closest('input[type="file"][id^="achievementBgFile-"]');
            if (groupInput) {
                const groupKey = String(groupInput.id || '').replace('achievementBgFile-', '');
                previewAchievementRankFile(groupKey, groupInput.files?.[0] || null);
                return;
            }

            const customFileInput = event.target.closest('.custom-achievement-bg-file');
            if (customFileInput) {
                previewCustomAchievementFile(customFileInput);
                return;
            }
        });

        achievementEditorTab.addEventListener('input', (event) => {
            const metaInput = event.target.closest('.achievement-meta-input, .achievement-meta-textarea');
            const colorInput = event.target.closest('.achievement-color-input');
            if (!metaInput && !colorInput) return;
            const groupKey = String((metaInput || colorInput).dataset.group || '').trim();
            if (!ACHIEVEMENT_EDITOR_GROUP_KEYS.includes(groupKey)) return;

            const selectedItem = getSelectedAchievementRank(groupKey);
            if (!selectedItem) return;

            applyPreviewTexts(groupKey, selectedItem, { useFormValues: true });
        });
    }

    const adminTabAccessSearchInput = document.getElementById('adminTabAccessSearch');
    const adminTabAccessSearchButton = document.getElementById('searchAdminTabAccessUsersBtn');
    const adminTabAccessResults = document.getElementById('adminTabAccessResults');
    if (adminTabAccessSearchButton) {
        adminTabAccessSearchButton.addEventListener('click', () => {
            searchAdminTabAccessUsers().catch((error) => {
                console.error('[ADMIN] Erro ao buscar permissões das abas:', error);
                const message = document.getElementById('adminTabAccessMessage');
                if (message) message.textContent = 'Não foi possível buscar usuários.';
            });
        });
    }
    if (adminTabAccessSearchInput) {
        adminTabAccessSearchInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            adminTabAccessSearchButton?.click();
        });
    }
    if (adminTabAccessResults) {
        adminTabAccessResults.addEventListener('click', async (event) => {
            const button = event.target.closest('.admin-tab-access-save-btn');
            if (!button) return;

            const userId = Number(button.dataset.userId || 0);
            const card = button.closest('.admin-tab-access-card');
            if (!userId || !card) return;

            const permissions = Object.fromEntries(ADMIN_TAB_ACCESS_OPTIONS.map(({ key }) => {
                const checkbox = card.querySelector(`[data-permission-key="${key}"]`);
                const isInherited = checkbox?.disabled === true;
                return [
                    key,
                    isInherited
                        ? checkbox.dataset.directPermission === 'true'
                        : Boolean(checkbox?.checked)
                ];
            }));
            const nickname = String(card.querySelector('strong')?.textContent || 'este usuário');
            const confirmed = await showThemedConfirm(`Salvar as permissões das abas para ${nickname}?`);
            if (!confirmed) return;

            const message = document.getElementById('adminTabAccessMessage');
            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = 'Salvando...';
            try {
                const response = await AuthAPI.updateAdminTabAccessPermissions(userId, permissions);
                if (!response?.success) {
                    if (message) message.textContent = response?.message || 'Não foi possível salvar as permissões.';
                    return;
                }
                if (message) message.textContent = response.message || 'Permissões salvas.';
            } catch (error) {
                console.error('[ADMIN] Erro ao salvar permissões das abas:', error);
                if (message) message.textContent = 'Não foi possível salvar as permissões.';
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        });
    }

    const googleLoginSearchInput = document.getElementById('googleLoginAccountSearch');
    const googleLoginSearchButton = document.getElementById('searchGoogleLoginAccountsBtn');
    const googleLoginResults = document.getElementById('googleLoginAccountsResults');
    if (googleLoginSearchButton) {
        googleLoginSearchButton.addEventListener('click', () => {
            searchGoogleLoginAccounts().catch((error) => {
                console.error('[ADMIN] Erro ao buscar contas Google:', error);
                const message = document.getElementById('googleLoginAccountsMessage');
                if (message) message.textContent = 'Não foi possível buscar contas Google.';
            });
        });
    }
    if (googleLoginSearchInput) {
        googleLoginSearchInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            googleLoginSearchButton?.click();
        });
    }
    if (googleLoginResults) {
        googleLoginResults.addEventListener('click', async (event) => {
            const button = event.target.closest('.account-access-action-btn');
            if (!button) return;

            const userId = Number(button.dataset.userId || 0);
            const action = String(button.dataset.action || '');
            const row = button.closest('tr');
            const nickname = String(row?.cells?.[0]?.textContent || 'este usuário').trim();
            const actionMessages = {
                'disable-google': `O login pelo Google será desativado para ${nickname}. Uma nova senha será enviada ao e-mail verificado e substituirá a senha atual. Deseja continuar?`,
                'send-password': `Uma nova senha será enviada para ${nickname} e substituirá a senha atual. O status do login Google não será alterado. Deseja continuar?`,
                'enable-google': `O login pelo Google será reativado para ${nickname}. O acesso por senha continuará disponível. Deseja continuar?`
            };
            const confirmed = await showThemedConfirm(actionMessages[action] || 'Deseja continuar?');
            if (!confirmed) return;

            const message = document.getElementById('googleLoginAccountsMessage');
            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = action === 'enable-google' ? 'Ativando...' : 'Processando...';
            if (message) message.textContent = action === 'enable-google'
                ? 'Reativando login pelo Google...'
                : 'Gerando senha e enviando o e-mail...';
            try {
                const response = action === 'enable-google'
                    ? await AuthAPI.setGoogleLoginForUser(userId, true)
                    : action === 'disable-google'
                        ? await AuthAPI.setGoogleLoginForUser(userId, false)
                        : await AuthAPI.sendPasswordForGoogleUser(userId);
                if (!response?.success) {
                    if (message) message.textContent = response?.message || 'Não foi possível alterar o acesso da conta.';
                    return;
                }
                const successMessage = response.message || 'A alteração foi concluída.';
                await searchGoogleLoginAccounts();
                if (message) message.textContent = successMessage;
            } catch (error) {
                console.error('[ADMIN] Erro ao alterar acesso da conta:', error);
                if (message) message.textContent = 'Não foi possível alterar o acesso da conta.';
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        });
    }

    // Abas
    const tabBtns = document.querySelectorAll('.tab-btn');
    console.log('[ADMIN] Found', tabBtns.length, 'tab buttons');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log('[ADMIN] Tab button clicked:', btn.getAttribute('data-tab'));
            e.preventDefault();
            e.stopPropagation();
            const tabName = btn.getAttribute('data-tab');

            setActiveAdminTab(tabName, { persist: true, load: true }).catch((error) => {
                console.error('Erro ao carregar aba:', tabName, error);
            });
        });
    });

}

attachEventListeners();
await setActiveAdminTab(resolveInitialAdminTab(), { persist: false, load: true });

async function loadSocialLinks() {
    const whatsappInput = document.getElementById('adminWhatsappUrl');
    const discordInput = document.getElementById('adminDiscordUrl');
    const whatsappTooltipInput = document.getElementById('adminWhatsappTooltip');
    const discordTooltipInput = document.getElementById('adminDiscordTooltip');

    if (!whatsappInput || !discordInput) return;

    const whatsappEnabledInput = document.getElementById('adminWhatsappEnabled');
    const discordEnabledInput = document.getElementById('adminDiscordEnabled');

    try {
        const result = await AuthAPI.getSocialLinks();
        if (result.success && result.links) {
            whatsappInput.value = result.links.whatsappUrl || '';
            discordInput.value = result.links.discordUrl || '';
            if (whatsappTooltipInput) whatsappTooltipInput.value = result.links.whatsappTooltip ?? 'WhatsApp';
            if (discordTooltipInput) discordTooltipInput.value = result.links.discordTooltip ?? 'Discord';
            if (whatsappEnabledInput) {
                whatsappEnabledInput.checked = result.links.whatsappEnabled !== false && result.links.whatsappEnabled !== '0' && result.links.whatsappEnabled !== 0;
            }
            if (discordEnabledInput) {
                discordEnabledInput.checked = result.links.discordEnabled !== false && result.links.discordEnabled !== '0' && result.links.discordEnabled !== 0;
            }
            renderNavbarButtons(Array.isArray(result.links.navbarButtons) ? result.links.navbarButtons : []);
        } else {
            renderNavbarButtons([]);
        }
    } catch (error) {
        console.warn('Erro ao carregar links da comunidade:', error);
        renderNavbarButtons([]);
    }
}

function createNavbarButtonItem(button = {}) {
    const item = document.createElement('div');
    item.className = 'navbar-button-item';
    item.style.display = 'grid';
    item.style.gap = '10px';
    item.style.padding = '12px';
    item.style.border = '1px solid rgba(236, 72, 153, 0.18)';
    item.style.borderRadius = '12px';
    item.style.background = 'rgba(255, 255, 255, 0.03)';

    const labelRow = document.createElement('div');
    labelRow.style.display = 'grid';
    labelRow.style.gridTemplateColumns = '1fr 1fr';
    labelRow.style.gap = '10px';

    const labelWrapper = document.createElement('div');
    labelWrapper.style.display = 'flex';
    labelWrapper.style.flexDirection = 'column';
    const labelField = document.createElement('input');
    labelField.type = 'text';
    labelField.placeholder = 'Título do botão';
    labelField.className = 'navbar-button-label';
    labelField.value = button.label || '';
    labelField.style.width = '100%';
    labelField.style.boxSizing = 'border-box';
    labelField.style.padding = '10px';
    labelField.style.borderRadius = '10px';
    labelField.style.border = '1px solid rgba(236, 72, 153, 0.25)';
    labelField.style.background = '#111';
    labelField.style.color = '#fff';
    labelWrapper.appendChild(labelField);

    const urlWrapper = document.createElement('div');
    urlWrapper.style.display = 'flex';
    urlWrapper.style.flexDirection = 'column';
    const urlField = document.createElement('input');
    urlField.type = 'text';
    urlField.placeholder = 'https://...';
    urlField.className = 'navbar-button-url';
    urlField.value = button.url || '';
    urlField.style.width = '100%';
    urlField.style.boxSizing = 'border-box';
    urlField.style.padding = '10px';
    urlField.style.borderRadius = '10px';
    urlField.style.border = '1px solid rgba(236, 72, 153, 0.25)';
    urlField.style.background = '#111';
    urlField.style.color = '#fff';
    urlWrapper.appendChild(urlField);

    labelRow.appendChild(labelWrapper);
    labelRow.appendChild(urlWrapper);

    const iconRow = document.createElement('div');
    iconRow.style.display = 'flex';
    iconRow.style.flexDirection = 'column';
    iconRow.style.marginTop = '10px';
    const iconField = document.createElement('input');
    iconField.type = 'text';
    iconField.placeholder = 'Ícone / URL de ícone (ex: /imagens/youtube.png ou ▶️)';
    iconField.className = 'navbar-button-icon';
    iconField.value = button.icon || '';
    iconField.style.width = '100%';
    iconField.style.boxSizing = 'border-box';
    iconField.style.padding = '10px';
    iconField.style.borderRadius = '10px';
    iconField.style.border = '1px solid rgba(236, 72, 153, 0.25)';
    iconField.style.background = '#111';
    iconField.style.color = '#fff';
    iconRow.appendChild(iconField);

    item.appendChild(labelRow);
    item.appendChild(iconRow);

    const positionRow = document.createElement('div');
    positionRow.style.display = 'flex';
    positionRow.style.flexDirection = 'column';
    positionRow.style.marginTop = '10px';

    const positionLabel = document.createElement('label');
    positionLabel.textContent = 'Posição do botão';
    positionLabel.style.marginBottom = '6px';
    positionLabel.style.fontSize = '13px';
    positionLabel.style.color = '#fff';
    positionRow.appendChild(positionLabel);

    const positionField = document.createElement('select');
    positionField.className = 'navbar-button-position';
    positionField.name = 'navbarButtonPosition';
    positionField.style.width = '100%';
    positionField.style.boxSizing = 'border-box';
    positionField.style.padding = '10px';
    positionField.style.borderRadius = '10px';
    positionField.style.border = '1px solid rgba(236, 72, 153, 0.25)';
    positionField.style.background = '#111';
    positionField.style.color = '#fff';
    const positions = [
        { value: 'beforeWhatsapp', label: 'Antes do WhatsApp' },
        { value: 'afterWhatsapp', label: 'Após WhatsApp' },
        { value: 'beforeDiscord', label: 'Antes do Discord' },
        { value: 'afterDiscord', label: 'Após Discord' },
        { value: 'beforeNotifications', label: 'Antes de Notificações' },
        { value: 'afterNotifications', label: 'Após Notificações' },
        { value: 'beforeLogin', label: 'Antes do Login' },
        { value: 'afterLogin', label: 'Após o Login' },
        { value: 'beforeLogout', label: 'Antes de Sair' },
        { value: 'afterLogout', label: 'Após Sair' },
        { value: 'end', label: 'No final da barra' }
    ];
    positions.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        positionField.appendChild(opt);
    });
    positionField.value = button.position || 'beforeLogin';
    positionField.addEventListener('change', () => {
        console.debug('[ADMIN] Navbar button position changed to', positionField.value);
        sortNavbarButtonItemsByPosition();
    });
    positionRow.appendChild(positionField);
    item.appendChild(positionRow);

    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.alignItems = 'center';
    actionRow.style.justifyContent = 'space-between';
    actionRow.style.gap = '10px';

    const enabledLabel = document.createElement('label');
    enabledLabel.style.display = 'flex';
    enabledLabel.style.alignItems = 'center';
    enabledLabel.style.gap = '8px';
    enabledLabel.style.color = '#fff';
    enabledLabel.style.fontSize = '13px';
    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.className = 'navbar-button-enabled';
    enabledCheckbox.checked = button.enabled !== false;
    enabledCheckbox.style.width = '16px';
    enabledCheckbox.style.height = '16px';
    enabledLabel.appendChild(enabledCheckbox);
    enabledLabel.appendChild(document.createTextNode('Ativo'));

    const orderControls = document.createElement('div');
    orderControls.style.display = 'flex';
    orderControls.style.alignItems = 'center';
    orderControls.style.gap = '6px';

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = 'Mover para cima';
    moveUpBtn.style.border = 'none';
    moveUpBtn.style.borderRadius = '10px';
    moveUpBtn.style.background = '#3B82F6';
    moveUpBtn.style.color = '#fff';
    moveUpBtn.style.padding = '10px 12px';
    moveUpBtn.style.cursor = 'pointer';
    moveUpBtn.addEventListener('click', () => {
        const list = item.parentElement;
        if (!list) return;
        const previous = item.previousElementSibling;
        if (previous) {
            list.insertBefore(item, previous);
            return;
        }
        const positionField = item.querySelector('.navbar-button-position');
        if (!positionField) return;
        if (positionField.value === 'beforeLogin') {
            positionField.value = 'afterDiscord';
            sortNavbarButtonItemsByPosition();
        } else if (positionField.value === 'afterDiscord') {
            positionField.value = 'afterWhatsapp';
            sortNavbarButtonItemsByPosition();
        }
    });

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = 'Mover para baixo';
    moveDownBtn.style.border = 'none';
    moveDownBtn.style.borderRadius = '10px';
    moveDownBtn.style.background = '#3B82F6';
    moveDownBtn.style.color = '#fff';
    moveDownBtn.style.padding = '10px 12px';
    moveDownBtn.style.cursor = 'pointer';
    moveDownBtn.addEventListener('click', () => {
        const list = item.parentElement;
        if (!list) return;
        const next = item.nextElementSibling;
        if (next) {
            list.insertBefore(next, item);
            return;
        }
        const positionField = item.querySelector('.navbar-button-position');
        if (!positionField) return;
        if (positionField.value === 'afterWhatsapp') {
            positionField.value = 'afterDiscord';
            sortNavbarButtonItemsByPosition();
        } else if (positionField.value === 'afterDiscord') {
            positionField.value = 'beforeLogin';
            sortNavbarButtonItemsByPosition();
        }
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'navbar-button-remove';
    removeBtn.textContent = 'Remover';
    removeBtn.style.border = 'none';
    removeBtn.style.borderRadius = '10px';
    removeBtn.style.background = '#EF4444';
    removeBtn.style.color = '#fff';
    removeBtn.style.padding = '10px 14px';
    removeBtn.style.cursor = 'pointer';
    removeBtn.addEventListener('click', () => item.remove());

    orderControls.appendChild(moveUpBtn);
    orderControls.appendChild(moveDownBtn);
    orderControls.appendChild(removeBtn);

    actionRow.appendChild(enabledLabel);
    actionRow.appendChild(orderControls);

    item.appendChild(actionRow);

    return item;
}

function getNavbarButtonPositionWeight(position) {
    switch (position) {
        case 'beforeWhatsapp': return 0;
        case 'afterWhatsapp': return 1;
        case 'beforeDiscord': return 2;
        case 'afterDiscord': return 3;
        case 'beforeNotifications': return 4;
        case 'afterNotifications': return 5;
        case 'beforeLogin': return 6;
        case 'afterLogin': return 7;
        case 'beforeLogout': return 8;
        case 'afterLogout': return 9;
        case 'end': return 10;
        default: return 6;
    }
}

function sortNavbarButtonItemsByPosition() {
    const list = document.getElementById('navbarButtonsList');
    if (!list) return;
    const items = Array.from(list.children);
    items.sort((a, b) => {
        const aPos = a.querySelector('.navbar-button-position')?.value || 'beforeLogin';
        const bPos = b.querySelector('.navbar-button-position')?.value || 'beforeLogin';
        return getNavbarButtonPositionWeight(aPos) - getNavbarButtonPositionWeight(bPos);
    });
    items.forEach((item) => list.appendChild(item));
}

function renderNavbarButtons(buttons = []) {
    const list = document.getElementById('navbarButtonsList');
    if (!list) return;
    list.innerHTML = '';
    if (!Array.isArray(buttons) || buttons.length === 0) {
        return;
    }
    buttons.forEach((button) => {
        list.appendChild(createNavbarButtonItem(button));
    });
    sortNavbarButtonItemsByPosition();
}

function addNavbarButton() {
    const list = document.getElementById('navbarButtonsList');
    if (!list) return;
    list.appendChild(createNavbarButtonItem({ label: '', url: '', enabled: true }));
    sortNavbarButtonItemsByPosition();
}

function normalizeNavbarButtonUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return '';
        }
        return parsed.toString();
    } catch {
        return '';
    }
}

function getNavbarButtonsFromUi() {
    const list = document.querySelectorAll('#navbarButtonsList .navbar-button-item');
    const parsedRows = Array.from(list).map((item) => {
        const label = item.querySelector('.navbar-button-label')?.value?.trim() || '';
        const rawUrl = item.querySelector('.navbar-button-url')?.value?.trim() || '';
        const url = normalizeNavbarButtonUrl(rawUrl);
        const icon = item.querySelector('.navbar-button-icon')?.value?.trim() || '';
        const positionField = item.querySelector('select.navbar-button-position');
        let position = 'beforeLogin';
        if (positionField) {
            position = String(positionField.value || 'beforeLogin').trim() || 'beforeLogin';
        } else {
            const fallbackField = item.querySelector('select');
            position = String(fallbackField?.value || 'beforeLogin').trim() || 'beforeLogin';
        }
        const enabled = item.querySelector('.navbar-button-enabled')?.checked === true;
        const isActive = Boolean(label || rawUrl || icon || enabled === false);

        console.debug('[ADMIN] Parsed navbar row:', {
            label,
            url,
            icon,
            position,
            enabled,
            isActive,
            rawUrl,
            positionFieldExists: !!positionField
        });

        if (!isActive) {
            return null;
        }

        if (!label || !url) {
            return { invalid: true };
        }

        return { label, url, icon, position, enabled };
    });

    const buttons = parsedRows.filter((item) => item && !item.invalid);
    const activeRows = parsedRows.filter(Boolean).length;

    return {
        buttons,
        rowCount: activeRows,
    };
}

function escapeHtmlAdmin(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeHtmlAttributeValue(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function setEditorButtonBusy(button, isBusy, busyText = 'Salvando...') {
    if (!button) return () => {};
    const originalText = button.dataset.originalText || button.textContent;
    if (!button.dataset.originalText) button.dataset.originalText = originalText;
    button.disabled = Boolean(isBusy);
    button.textContent = isBusy ? busyText : originalText;
    return () => {
        button.disabled = false;
        button.textContent = originalText;
    };
}

function validateAchievementBackgroundFile(file) {
    if (!file) return 'Selecione uma imagem ou GIF.';
    const mimeType = String(file.type || '').toLowerCase();
    const fileName = String(file.name || '').toLowerCase();
    const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? `.${extMatch[1]}` : '';
    const byMime = ALLOWED_RANK_BACKGROUND_FILE_TYPES.has(mimeType);
    const byExt = ALLOWED_RANK_BACKGROUND_FILE_EXT.has(ext);
    const mimeUnknown = !mimeType || mimeType === 'application/octet-stream';

    if (!(byExt && (byMime || mimeUnknown))) {
        return 'Use apenas GIF, PNG, JPG ou WEBP.';
    }

    if (Number(file.size || 0) > MAX_ACHIEVEMENT_BG_FILE_BYTES) {
        return 'Arquivo muito grande. Limite de 20MB.';
    }

    return '';
}

function releasePreviewObjectUrl(previewEl, keepUrl = '') {
    if (!previewEl) return;
    const previous = String(previewEl.dataset.previewObjectUrl || '').trim();
    const keep = String(keepUrl || '').trim();
    if (!previous) return;

    if (previous !== keep && previous.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
    }
    if (previous !== keep) {
        delete previewEl.dataset.previewObjectUrl;
    }
}

function setAchievementPreviewBackground(previewEl, imageUrl = '') {
    if (!previewEl) return;
    const resolved = resolveRankBackgroundUrl(imageUrl);
    releasePreviewObjectUrl(previewEl, resolved);
    previewEl.dataset.currentPreviewBg = resolved;
    previewEl.dataset.hoverGif = '0';
    delete previewEl.dataset.hoverGifStaticRequestKey;
    previewEl.style.removeProperty('--achievement-hover-gif-bg');

    if (resolved) {
        previewEl.style.backgroundImage = `url('${resolved.replace(/'/g, "\\'")}')`;
        previewEl.style.backgroundSize = 'cover';
        previewEl.style.backgroundPosition = 'center';
        previewEl.classList.remove('is-empty');
        if (resolved.startsWith('blob:')) {
            previewEl.dataset.previewObjectUrl = resolved;
        }
    } else {
        previewEl.style.backgroundImage = 'none';
        previewEl.style.backgroundColor = 'rgba(2, 6, 23, 0.6)';
        previewEl.classList.add('is-empty');
    }
}

function escapeCssUrlValue(value = '') {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function createStaticPreviewDataUrlFromSource(sourceUrl = '') {
    return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.crossOrigin = 'anonymous';

        image.onload = () => {
            try {
                const width = Math.max(1, Number(image.naturalWidth || image.width || 1));
                const height = Math.max(1, Number(image.naturalHeight || image.height || 1));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('');
                    return;
                }
                ctx.drawImage(image, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png'));
            } catch (error) {
                resolve('');
            }
        };

        image.onerror = () => resolve('');
        image.src = sourceUrl;
    });
}

async function getAchievementStaticFrameFromGif(gifUrl = '') {
    const raw = String(gifUrl || '').trim();
    if (!raw) return '';

    if (raw.startsWith('blob:') || raw.startsWith('data:')) {
        return createStaticPreviewDataUrlFromSource(raw);
    }

    if (achievementHoverGifStaticPreviewCache.has(raw)) {
        return achievementHoverGifStaticPreviewCache.get(raw);
    }

    const promise = (async () => {
        let objectUrl = '';
        try {
            const response = await fetch(raw, { cache: 'force-cache' });
            if (!response.ok) return '';
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            return await createStaticPreviewDataUrlFromSource(objectUrl);
        } catch (error) {
            return '';
        } finally {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        }
    })();

    achievementHoverGifStaticPreviewCache.set(raw, promise);
    const result = await promise;
    if (!result) {
        achievementHoverGifStaticPreviewCache.delete(raw);
    }
    return result;
}

async function applyAchievementPreviewStaticFrame(previewEl, gifUrl = '') {
    if (!previewEl) return;
    const rawGifUrl = String(gifUrl || '').trim();
    if (!rawGifUrl) return;

    const requestKey = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    previewEl.dataset.hoverGifStaticRequestKey = requestKey;

    const staticFrameDataUrl = await getAchievementStaticFrameFromGif(rawGifUrl);
    if (!staticFrameDataUrl || !previewEl.isConnected) return;
    if (String(previewEl.dataset.hoverGifStaticRequestKey || '') !== requestKey) return;
    if (String(previewEl.dataset.hoverGif || '0') !== '1') return;
    if (String(previewEl.dataset.currentPreviewBg || '').trim() !== rawGifUrl) return;

    previewEl.style.backgroundImage = `url('${escapeCssUrlValue(staticFrameDataUrl)}')`;
    previewEl.style.backgroundSize = 'cover';
    previewEl.style.backgroundPosition = 'center';
    previewEl.style.backgroundRepeat = 'no-repeat';
}

function isGifBackgroundSource(rawValue = '') {
    const value = String(rawValue || '').trim();
    if (!value) return false;
    if (value.startsWith('blob:')) return false;

    const rawLower = value.toLowerCase();
    if (rawLower.startsWith('data:image/gif')) return true;

    try {
        const parsed = new URL(value, window.location.origin);
        return parsed.pathname.toLowerCase().endsWith('.gif');
    } catch (error) {
        return /\.gif($|[?#])/i.test(value);
    }
}

function isGifAchievementFile(file) {
    if (!file) return false;
    const mime = String(file.type || '').trim().toLowerCase();
    const name = String(file.name || '').trim().toLowerCase();
    if (mime === 'image/gif') return true;
    return /\.gif$/i.test(name);
}

function getAchievementGroupFileInput(groupKey) {
    return document.getElementById(`achievementBgFile-${groupKey}`);
}

function getAchievementGroupPreview(groupKey) {
    return document.getElementById(`achievementBgPreview-${groupKey}`);
}

function getAchievementGroupRankSelect(groupKey) {
    return document.getElementById(`achievementRankSelect-${groupKey}`);
}

function getAchievementGroupAnimationSelect(groupKey) {
    return document.getElementById(`achievementAnimationMode-${groupKey}`);
}

function normalizeAchievementCardAnimationMode(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    return ACHIEVEMENT_CARD_ANIMATION_MODES.has(normalized) ? normalized : 'hover';
}

function getAchievementAnimationModeKey(groupKey, rankName) {
    const group = String(groupKey || '').trim();
    const nameKey = normalizeAchievementNameKey(rankName);
    if (!ACHIEVEMENT_EDITOR_GROUP_KEYS.includes(group) || !nameKey) return '';
    return `${group}:${nameKey}`;
}

function parseAchievementAnimationModes(rawValue) {
    if (!rawValue || typeof rawValue !== 'object') return {};
    const result = {};
    Object.entries(rawValue).forEach(([rawKey, rawMode]) => {
        const keyParts = String(rawKey || '').trim().toLowerCase().split(':');
        const group = keyParts.shift() || '';
        const nameKey = normalizeAchievementNameKey(keyParts.join(':'));
        const mode = normalizeAchievementCardAnimationMode(rawMode);
        const storageKey = getAchievementAnimationModeKey(group, nameKey);
        if (!storageKey || mode === 'hover') return;
        result[storageKey] = mode;
    });
    return result;
}

function getAchievementItemBackground(item = null) {
    if (!item) return '';
    const explicit = String(item.backgroundImage || '').trim();
    if (explicit) return explicit;
    const fallbackByGroup = String(achievementBackgroundState[item.groupKey] || '').trim();
    return fallbackByGroup;
}

function getAchievementEditorGroupItems(groupKey) {
    return achievementEditorState[groupKey] || [];
}

function normalizeAchievementRankGroup(groupValue, iconValue, rank = null) {
    const normalizedGroup = String(groupValue || '').trim().toLowerCase();
    if (normalizedGroup === 'special' || normalizedGroup === 'especiais' || Number(rank?.isSpecial) === 1 || rank?.isSpecial === true) return 'special';
    if (normalizedGroup === 'post_achievement' || normalizedGroup === 'posts' || normalizedGroup === 'post') return 'post_achievement';
    if (normalizedGroup === 'like_achievement' || normalizedGroup === 'likes' || normalizedGroup === 'like') return 'like_achievement';
    if (normalizedGroup === 'progression' || normalizedGroup === 'fixed_automatic') return 'progression';

    const icon = String(iconValue || '').trim().toUpperCase();
    if (/^P\d+/.test(icon)) return 'post_achievement';
    if (/^L\d+/.test(icon)) return 'like_achievement';
    return '';
}

function getSelectedAchievementRank(groupKey) {
    const selectedNameKey = normalizeAchievementNameKey(achievementEditorState.selected[groupKey] || '');
    const items = getAchievementEditorGroupItems(groupKey);
    if (!items.length) return null;
    const found = items.find((item) => normalizeAchievementNameKey(item.name) === selectedNameKey);
    return found || items[0];
}

function setSelectedAchievementRank(groupKey, rankName) {
    achievementEditorState.selected[groupKey] = normalizeAchievementNameKey(rankName);
}

function normalizeAchievementBool(value) {
    return Number(value) === 1 || value === true;
}

function canEditGeneralAchievementPermissions(item = null) {
    if (!item) return false;
    const rankId = Number(item.id || 0);
    return item.groupKey === 'general' && Number.isFinite(rankId) && rankId > 0;
}

function getGeneralAchievementPermissionPayloadFromItem(item = null) {
    return {
        enableAdminPanel: normalizeAchievementBool(item?.enableAdminPanel),
        isVisible: item ? !((Number(item?.isVisible) === 0) || item?.isVisible === false) : true,
        canManageDownloads: normalizeAchievementBool(item?.canManageDownloads),
        canOrderAllRanks: normalizeAchievementBool(item?.canOrderAllRanks),
        canUseAnimatedProfile: normalizeAchievementBool(item?.canUseAnimatedProfile),
        canChangeOwnColor: normalizeAchievementBool(item?.canChangeOwnColor)
    };
}

function readGeneralAchievementPermissionPayloadFromForm() {
    return {
        enableAdminPanel: Boolean(document.getElementById('generalPermEnableAdminPanel')?.checked),
        isVisible: Boolean(document.getElementById('generalPermIsVisible')?.checked),
        canManageDownloads: Boolean(document.getElementById('generalPermCanManageDownloads')?.checked),
        canOrderAllRanks: Boolean(document.getElementById('generalPermCanOrderAllRanks')?.checked),
        canUseAnimatedProfile: Boolean(document.getElementById('generalPermCanUseAnimatedProfile')?.checked),
        canChangeOwnColor: Boolean(document.getElementById('generalPermCanChangeOwnColor')?.checked)
    };
}

function hasGeneralAchievementPermissionChanges(item = null, payload = null) {
    if (!canEditGeneralAchievementPermissions(item) || !payload) return false;
    const current = getGeneralAchievementPermissionPayloadFromItem(item);
    return (
        current.enableAdminPanel !== payload.enableAdminPanel ||
        current.isVisible !== payload.isVisible ||
        current.canManageDownloads !== payload.canManageDownloads ||
        current.canOrderAllRanks !== payload.canOrderAllRanks ||
        current.canUseAnimatedProfile !== payload.canUseAnimatedProfile ||
        current.canChangeOwnColor !== payload.canChangeOwnColor
    );
}

function syncGeneralAchievementPermissionsEditor(item = null) {
    const container = document.getElementById('achievementGeneralPermissions');
    if (!container) return;

    const canEdit = canEditGeneralAchievementPermissions(item);
    container.classList.toggle('is-disabled', !canEdit);

    const payload = canEdit
        ? getGeneralAchievementPermissionPayloadFromItem(item)
        : {
            enableAdminPanel: false,
            isVisible: false,
            canManageDownloads: false,
            canOrderAllRanks: false,
            canUseAnimatedProfile: false,
            canChangeOwnColor: false
        };

    const mapping = [
        ['generalPermEnableAdminPanel', payload.enableAdminPanel],
        ['generalPermIsVisible', payload.isVisible],
        ['generalPermCanManageDownloads', payload.canManageDownloads],
        ['generalPermCanOrderAllRanks', payload.canOrderAllRanks],
        ['generalPermCanUseAnimatedProfile', payload.canUseAnimatedProfile],
        ['generalPermCanChangeOwnColor', payload.canChangeOwnColor]
    ];

    mapping.forEach(([id, checked]) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.checked = Boolean(checked);
        input.disabled = !canEdit;
    });
}

function getAchievementGroupMetaContainer(groupKey) {
    return document.getElementById(`achievementMetaEditor-${groupKey}`);
}

function getAchievementGroupNameInput(groupKey) {
    return document.getElementById(`achievementNameInput-${groupKey}`);
}

function getAchievementGroupDescriptionInput(groupKey) {
    return document.getElementById(`achievementDescriptionInput-${groupKey}`);
}

function getAchievementGroupCustomTextInput(groupKey) {
    return document.getElementById(`achievementCustomTextInput-${groupKey}`);
}

function getAchievementGroupMetaHelp(groupKey) {
    return document.getElementById(`achievementMetaHelp-${groupKey}`);
}

function getAchievementItemCustomText(item = null) {
    return String(item?.customText ?? item?.goal ?? '').trim();
}

function canEditAchievementMetadata(item = null) {
    if (!item) return false;
    if (item.isVirtualFounder === true) return true;
    const rankId = Number(item.id || 0);
    return Number.isFinite(rankId) && rankId > 0;
}

function getAchievementGroupColorInput(groupKey) {
    return document.getElementById(`achievementColorInput-${groupKey}`);
}

function readAchievementMetadataPayloadFromForm(groupKey, fallbackItem = null) {
    const nameInput = getAchievementGroupNameInput(groupKey);
    const descriptionInput = getAchievementGroupDescriptionInput(groupKey);
    const customTextInput = getAchievementGroupCustomTextInput(groupKey);
    return {
        name: String(nameInput?.value ?? fallbackItem?.name ?? '').trim(),
        description: String(descriptionInput?.value ?? fallbackItem?.description ?? '').trim(),
        customText: String(customTextInput?.value ?? getAchievementItemCustomText(fallbackItem)).trim(),
        color: String(getAchievementGroupColorInput(groupKey)?.value || fallbackItem?.color || FOUNDER_ACHIEVEMENT_COLOR).trim()
    };
}

function hasAchievementMetadataChanges(item = null, payload = null) {
    if (!canEditAchievementMetadata(item) || !payload) return false;
    const currentName = String(item?.name || '').trim();
    const currentDescription = String(item?.description || '').trim();
    const currentCustomText = getAchievementItemCustomText(item);
    return (
        payload.name !== currentName ||
        payload.description !== currentDescription ||
        payload.customText !== currentCustomText
    );
}

function syncAchievementMetadataEditor(groupKey, item = null) {
    const container = getAchievementGroupMetaContainer(groupKey);
    const nameInput = getAchievementGroupNameInput(groupKey);
    const descriptionInput = getAchievementGroupDescriptionInput(groupKey);
    const customTextInput = getAchievementGroupCustomTextInput(groupKey);
    const colorInput = getAchievementGroupColorInput(groupKey);
    const colorLabel = document.getElementById(`achievementColorControl-${groupKey}`);
    const helpEl = getAchievementGroupMetaHelp(groupKey);
    if (!container || !nameInput || !descriptionInput || !customTextInput) return;

    const canEdit = canEditAchievementMetadata(item);
    const canEditFounderColor = item?.isVirtualFounder === true;
    const currentName = String(item?.name || '');
    const currentDescription = String(item?.description || '');
    const currentCustomText = getAchievementItemCustomText(item);

    nameInput.value = currentName;
    descriptionInput.value = currentDescription;
    customTextInput.value = currentCustomText;
    if (colorInput) {
        colorInput.value = /^#[0-9a-f]{6}$/i.test(String(item?.color || ''))
            ? item.color
            : FOUNDER_ACHIEVEMENT_COLOR;
        colorInput.disabled = !canEditFounderColor;
        colorInput.style.display = canEditFounderColor ? '' : 'none';
    }
    if (colorLabel) colorLabel.style.display = canEditFounderColor ? '' : 'none';

    nameInput.disabled = !canEdit;
    descriptionInput.disabled = !canEdit;
    customTextInput.disabled = !canEdit;
    container.classList.toggle('is-disabled', !canEdit);

    if (helpEl) {
        if (!item) {
            helpEl.textContent = 'Selecione uma conquista para editar.';
        } else if (canEdit) {
            helpEl.textContent = canEditFounderColor
                ? 'Nome, descrição, texto, cor e fundo do Fundador serão salvos junto com o botão Salvar.'
                : 'Nome, descrição e texto serão salvos junto com o botão Salvar.';
        } else {
            helpEl.textContent = 'Conquista fixa: só fundo e animação podem ser alterados.';
        }
    }
}

function getAchievementPermissionPayloadFromItem(item = null) {
    return {
        enableAdminPanel: normalizeAchievementBool(item?.enableAdminPanel),
        isVisible: item ? !((Number(item?.isVisible) === 0) || item?.isVisible === false) : true,
        canManageDownloads: normalizeAchievementBool(item?.canManageDownloads),
        canOrderAllRanks: normalizeAchievementBool(item?.canOrderAllRanks),
        canUseAnimatedProfile: normalizeAchievementBool(item?.canUseAnimatedProfile),
        canChangeOwnColor: normalizeAchievementBool(item?.canChangeOwnColor)
    };
}

function getAchievementItemAnimationMode(groupKey, item = null) {
    if (!item) return 'hover';
    const key = getAchievementAnimationModeKey(groupKey, item.name);
    if (!key) return 'hover';
    return normalizeAchievementCardAnimationMode(achievementEditorState.animationModes[key] || 'hover');
}

function shouldShowAchievementAnimationMode(groupKey, item = null) {
    const selectedItem = item || getSelectedAchievementRank(groupKey);
    return Boolean(selectedItem);
}

function syncAchievementAnimationSelect(groupKey, item = null) {
    const animationSelect = getAchievementGroupAnimationSelect(groupKey);
    if (!animationSelect) return;
    animationSelect.value = getAchievementItemAnimationMode(groupKey, item);
}

function updateAchievementAnimationSelectorVisibility(groupKey, item = null) {
    const slot = document.querySelector(`.achievement-editor-slot[data-group="${groupKey}"]`);
    const wrapper = slot?.querySelector('.achievement-animation-selector');
    const select = getAchievementGroupAnimationSelect(groupKey);
    if (!wrapper || !select) return;

    const hasItem = Boolean(item || getSelectedAchievementRank(groupKey));
    const shouldShow = hasItem;
    wrapper.style.display = shouldShow ? '' : 'none';
    select.disabled = !hasItem;
    if (!shouldShow) {
        select.value = 'hover';
    }
}

function applyAchievementPreviewAnimationMode(groupKey, item = null) {
    const previewEl = getAchievementGroupPreview(groupKey);
    if (!previewEl) return;

    const selectedItem = item || getSelectedAchievementRank(groupKey);
    if (!selectedItem) {
        previewEl.dataset.hoverGif = '0';
        previewEl.style.removeProperty('--achievement-hover-gif-bg');
        return;
    }

    const modeSelect = getAchievementGroupAnimationSelect(groupKey);
    const selectedMode = normalizeAchievementCardAnimationMode(modeSelect?.value || getAchievementItemAnimationMode(groupKey, selectedItem));
    const currentBg = String(previewEl.dataset.currentPreviewBg || '').trim();
    const fileInput = getAchievementGroupFileInput(groupKey);
    const selectedFile = fileInput?.files?.[0] || null;
    const hasGifBackground = isGifBackgroundSource(currentBg) || isGifAchievementFile(selectedFile);
    const useHoverGif = selectedMode === 'hover' && hasGifBackground && Boolean(currentBg);

    if (!useHoverGif) {
        previewEl.dataset.hoverGif = '0';
        previewEl.style.removeProperty('--achievement-hover-gif-bg');
        return;
    }

    previewEl.dataset.hoverGif = '1';
    previewEl.style.setProperty('--achievement-hover-gif-bg', `url('${escapeCssUrlValue(currentBg)}')`);
    previewEl.classList.remove('is-empty');
    void applyAchievementPreviewStaticFrame(previewEl, currentBg);
}

function applyPreviewTexts(groupKey, item, options = {}) {
    const slot = document.querySelector(`.achievement-editor-slot[data-group="${groupKey}"]`);
    if (!slot || !item) return;

    const slotTitleEl = slot.querySelector('h3');
    const previewEl = slot.querySelector('.achievement-bg-preview');
    const nameEl = slot.querySelector('.achievement-preview-name');
    const descEl = slot.querySelector('.achievement-preview-desc');
    const goalEl = slot.querySelector('.achievement-preview-goal');
    const badgeEl = slot.querySelector('.achievement-preview-badge');

    const useFormValues = options?.useFormValues === true;
    const draft = useFormValues
        ? readAchievementMetadataPayloadFromForm(groupKey, item)
        : {
            name: localizeRankName(String(item?.name || '').trim()),
            description: String(item?.description || '').trim(),
            customText: getAchievementItemCustomText(item)
        };

    if (nameEl) nameEl.textContent = draft.name || 'Sem nome';
    if (descEl) descEl.textContent = draft.description || 'Conquista especial';
    if (goalEl) goalEl.textContent = draft.customText || 'Conquistado';
    if (badgeEl) badgeEl.textContent = 'Conquistado';

    const colorInput = getAchievementGroupColorInput(groupKey);
    const color = String(options?.useFormValues === true && item.isVirtualFounder === true
        ? colorInput?.value || item.color || FOUNDER_ACHIEVEMENT_COLOR
        : item.color || '#6B46C1');
    if (slotTitleEl) slotTitleEl.style.color = color;
    if (previewEl) {
        previewEl.style.setProperty('--achievement-color', color);
        previewEl.style.borderColor = `${color}cc`;
    }
    if (nameEl) nameEl.style.color = color;
    if (goalEl) goalEl.style.color = color;
    if (badgeEl) {
        badgeEl.style.borderColor = `${color}99`;
        badgeEl.style.background = `${color}44`;
    }
}

function renderAchievementGroupSelect(groupKey) {
    const selectEl = getAchievementGroupRankSelect(groupKey);
    const animationSelectEl = getAchievementGroupAnimationSelect(groupKey);
    if (!selectEl) return;

    const items = getAchievementEditorGroupItems(groupKey);
    if (!items.length) {
        selectEl.innerHTML = '<option value="">Nenhuma conquista disponível</option>';
        selectEl.disabled = true;
        if (animationSelectEl) {
            animationSelectEl.disabled = true;
            animationSelectEl.value = 'hover';
        }
        setSelectedAchievementRank(groupKey, '');
        renderAchievementGroupPreview(groupKey);
        return;
    }

    selectEl.disabled = false;
    const currentSelected = normalizeAchievementNameKey(achievementEditorState.selected[groupKey] || '');
    const selectedNameKey = items.some((item) => normalizeAchievementNameKey(item.name) === currentSelected)
        ? currentSelected
        : normalizeAchievementNameKey(items[0].name);
    setSelectedAchievementRank(groupKey, selectedNameKey);

    selectEl.innerHTML = items
        .map((item) => {
            const name = String(item.name || '').trim();
            const displayName = localizeRankName(name);
            const selected = normalizeAchievementNameKey(name) === selectedNameKey ? 'selected' : '';
            return `<option value="${escapeHtmlAdmin(name)}" ${selected}>${escapeHtmlAdmin(displayName)}</option>`;
        })
        .join('');

    renderAchievementGroupPreview(groupKey);
}

function previewAchievementRankFile(groupKey, file) {
    const previewEl = getAchievementGroupPreview(groupKey);
    if (!previewEl) return;

    const selectedItem = getSelectedAchievementRank(groupKey);
    if (!file) {
        setAchievementPreviewBackground(previewEl, getAchievementItemBackground(selectedItem));
        updateAchievementAnimationSelectorVisibility(groupKey, selectedItem);
        applyAchievementPreviewAnimationMode(groupKey, selectedItem);
        return;
    }

    const validationError = validateAchievementBackgroundFile(file);
    if (validationError) {
        showMessage(validationError, 'error');
        const fileInput = getAchievementGroupFileInput(groupKey);
        if (fileInput) fileInput.value = '';
        setAchievementPreviewBackground(previewEl, getAchievementItemBackground(selectedItem));
        updateAchievementAnimationSelectorVisibility(groupKey, selectedItem);
        applyAchievementPreviewAnimationMode(groupKey, selectedItem);
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAchievementPreviewBackground(previewEl, objectUrl);
    previewEl.dataset.previewObjectUrl = objectUrl;
    updateAchievementAnimationSelectorVisibility(groupKey, selectedItem);
    applyAchievementPreviewAnimationMode(groupKey, selectedItem);
}

function renderAchievementGroupPreview(groupKey) {
    const previewEl = getAchievementGroupPreview(groupKey);
    if (!previewEl) return;

    const selectedItem = getSelectedAchievementRank(groupKey);
    if (!selectedItem) {
        previewEl.classList.add('is-empty');
        setAchievementPreviewBackground(previewEl, '');
        syncAchievementAnimationSelect(groupKey, null);
        updateAchievementAnimationSelectorVisibility(groupKey, null);
        applyAchievementPreviewAnimationMode(groupKey, null);
        syncAchievementMetadataEditor(groupKey, null);
        if (groupKey === 'general') {
            syncGeneralAchievementPermissionsEditor(null);
        }
        return;
    }

    syncAchievementMetadataEditor(groupKey, selectedItem);
    applyPreviewTexts(groupKey, selectedItem);
    setAchievementPreviewBackground(previewEl, getAchievementItemBackground(selectedItem));
    syncAchievementAnimationSelect(groupKey, selectedItem);
    updateAchievementAnimationSelectorVisibility(groupKey, selectedItem);
    applyAchievementPreviewAnimationMode(groupKey, selectedItem);
    if (groupKey === 'general') {
        syncGeneralAchievementPermissionsEditor(selectedItem);
    }

    const fileInput = getAchievementGroupFileInput(groupKey);
    if (fileInput && !fileInput.files?.length) {
        fileInput.value = '';
    }
}

function sortAchievementItemsByIconNumber(items = []) {
    return [...items].sort((a, b) => {
        const iconA = String(a?.icon || '').toUpperCase();
        const iconB = String(b?.icon || '').toUpperCase();
        const numA = Number((iconA.match(/\d+/)?.[0]) || 0);
        const numB = Number((iconB.match(/\d+/)?.[0]) || 0);
        if (numA !== numB) return numA - numB;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' });
    });
}

function buildAchievementEditorData(backgrounds = {}, ranks = [], options = {}) {
    const includeFounderForOwner = options?.includeFounderForOwner === true;
    const manualRankOverrides = options?.manualRankOverrides || {};
    const founderNameKey = normalizeAchievementNameKey(FOUNDER_ACHIEVEMENT_NAME);
    achievementBackgroundState.like_achievement = String(backgrounds?.like_achievement || '').trim();
    achievementBackgroundState.post_achievement = String(backgrounds?.post_achievement || '').trim();
    achievementBackgroundState.progression = String(backgrounds?.progression || '').trim();
    achievementBackgroundState.special = String(backgrounds?.special || '').trim();
    achievementEditorState.animationModes = parseAchievementAnimationModes(backgrounds?.animationModes || {});

    console.debug('[ADMIN] buildAchievementEditorData called', {
        incomingRanks: Array.isArray(ranks) ? ranks.length : typeof ranks,
        sampleRanks: Array.isArray(ranks) ? (ranks || []).slice(0, 6).map(r => ({ id: r?.id, name: r?.name, rankGroup: r?.rankGroup, group: r?.group, icon: r?.icon })) : null
    });

    const postRanks = [];
    const likeRanks = [];
    const progressionRanks = [];
    const progressionRankNames = new Set();
    const specialRanks = [];
    const generalRanks = [];

    (ranks || []).forEach((rank) => {
        const group = normalizeAchievementRankGroup(rank?.group || rank?.rankGroup || '', rank?.icon, rank);

        if (group === 'post_achievement') {
            postRanks.push({
                ...rank,
                groupKey: group,
                goal: String(rank?.customText || '').trim() || 'Conquistado',
                nameKey: normalizeAchievementNameKey(rank?.name || '')
            });
            return;
        }
        if (group === 'like_achievement') {
            likeRanks.push({
                ...rank,
                groupKey: group,
                goal: String(rank?.customText || '').trim() || 'Conquistado',
                nameKey: normalizeAchievementNameKey(rank?.name || '')
            });
            return;
        }
        if (group === 'progression') {
            const localizedName = localizeRankName(String(rank?.name || '').trim());
            const progressionNameKey = normalizeAchievementNameKey(localizedName);
            if (progressionRankNames.has(progressionNameKey)) return;
            progressionRankNames.add(progressionNameKey);
            progressionRanks.push({
                ...rank,
                groupKey: group,
                goal: String(rank?.customText || '').trim() || 'Conquistado',
                nameKey: progressionNameKey
            });
            return;
        }
        if (group === 'special') {
            const normalizedNameKey = normalizeAchievementNameKey(rank?.name || '');
            specialRanks.push({
                ...rank,
                groupKey: 'special',
                goal: String(rank?.customText || '').trim() || 'Conquistado',
                nameKey: normalizedNameKey
            });
            return;
        }

        const normalizedNameKey = normalizeAchievementNameKey(rank?.name || '');

        generalRanks.push({
            ...rank,
            groupKey: 'general',
            goal: String(rank?.customText || '').trim() || 'Conquistado',
            nameKey: normalizedNameKey
        });
    });

    if (includeFounderForOwner) {
        const hasFounderInGeneral = generalRanks.some((rank) => normalizeAchievementNameKey(rank?.name || '') === founderNameKey);
        if (!hasFounderInGeneral) {
            const founderOverride = manualRankOverrides?.[founderNameKey] && typeof manualRankOverrides[founderNameKey] === 'object'
                ? manualRankOverrides[founderNameKey]
                : null;
            const founderName = String(founderOverride?.name || FOUNDER_ACHIEVEMENT_NAME).trim() || FOUNDER_ACHIEVEMENT_NAME;
            const founderDescription = String(founderOverride?.description || FOUNDER_ACHIEVEMENT_DESCRIPTION).trim() || FOUNDER_ACHIEVEMENT_DESCRIPTION;
            const founderCustomText = String(founderOverride?.customText || 'Conquistado').trim() || 'Conquistado';
            const founderColor = /^#[0-9a-f]{6}$/i.test(String(founderOverride?.color || ''))
                ? founderOverride.color
                : FOUNDER_ACHIEVEMENT_COLOR;
            generalRanks.push({
                id: null,
                name: founderName,
                color: founderColor,
                description: founderDescription,
                customText: founderCustomText,
                groupKey: 'general',
                goal: founderCustomText,
                nameKey: founderNameKey,
                backgroundImage: String(founderOverride?.backgroundImage || '').trim(),
                isVirtualFounder: true
            });
        }
    }

    achievementEditorState.post_achievement = sortAchievementItemsByIconNumber(postRanks);
    achievementEditorState.like_achievement = sortAchievementItemsByIconNumber(likeRanks);
    achievementEditorState.progression = sortAchievementItemsByIconNumber(progressionRanks);
    achievementEditorState.special = sortAchievementItemsByIconNumber(specialRanks);
    achievementEditorState.general = sortAchievementItemsByIconNumber(generalRanks);

    console.debug('[ADMIN] buildAchievementEditorData result', {
        postCount: achievementEditorState.post_achievement.length,
        likeCount: achievementEditorState.like_achievement.length,
        progressionCount: achievementEditorState.progression.length,
        generalCount: achievementEditorState.general.length,
        samplePost: achievementEditorState.post_achievement.slice(0,3).map(r=>r.name),
        sampleLike: achievementEditorState.like_achievement.slice(0,3).map(r=>r.name),
        sampleProgression: achievementEditorState.progression.slice(0,3).map(r=>r.name),
        sampleGeneral: achievementEditorState.general.slice(0,3).map(r=>r.name)
    });
}

function renderCustomAchievementBackgrounds(customRanks = []) {
    const container = document.getElementById('customAchievementBackgroundsContainer');
    if (!container) return;

    const virtualFounder = adminIsOwnerAccount
        ? getAchievementEditorGroupItems('general').find((rank) => rank?.isVirtualFounder === true)
        : null;
    const filtered = (customRanks || []).filter((rank) => {
        const group = detectCustomRankGroup(rank);
        return group !== 'post_achievement'
            && group !== 'like_achievement'
            && !(virtualFounder && normalizeAchievementNameKey(rank?.name || '').includes(FOUNDER_ACHIEVEMENT_NAME_KEY));
    });
    if (virtualFounder) filtered.push(virtualFounder);

    if (!filtered.length) {
        container.innerHTML = '<p style="text-align: center; color: #999;">Nenhuma conquista personalizada encontrada.</p>';
        return;
    }

    container.innerHTML = `
        <div class="achievement-custom-grid">
            ${filtered.map((rank) => {
                if (rank?.isVirtualFounder === true) {
                    const founderColor = String(rank.color || FOUNDER_ACHIEVEMENT_COLOR);
                    const founderName = escapeHtmlAdmin(localizeRankName(rank.name || FOUNDER_ACHIEVEMENT_NAME));
                    const founderDescription = escapeHtmlAdmin(rank.description || FOUNDER_ACHIEVEMENT_DESCRIPTION);
                    const founderGoal = escapeHtmlAdmin(rank.customText || 'Conquistado');
                    const founderBackground = escapeHtmlAdmin(String(rank.backgroundImage || '').trim());
                    return `
                        <div class="custom-achievement-bg-card achievement-editor-slot"
                             data-founder-editor="1"
                             style="border-color: ${founderColor}99;">
                            <h3 style="color: ${founderColor};">${founderName}</h3>
                            <div class="custom-achievement-bg-preview achievement-bg-preview is-empty" data-current-bg="${founderBackground}" style="--achievement-color: ${founderColor}; border-color: ${founderColor}cc;">
                                <div class="achievement-preview-content">
                                    <div class="achievement-preview-name">${founderName}</div>
                                    <div class="achievement-preview-desc">${founderDescription}</div>
                                    <div class="achievement-preview-goal">${founderGoal}</div>
                                </div>
                                <div class="achievement-preview-badge">Conquistado</div>
                            </div>
                            <div class="achievement-editor-controls">
                                <button type="button" class="achievement-editor-btn save edit-virtual-founder-btn">Editar Fundador</button>
                            </div>
                        </div>
                    `;
                }

                const rankId = Number(rank?.id || 0);
                const rawRankName = String(rank?.name || `#${rankId}`).trim();
                const rankName = escapeHtmlAdmin(rawRankName);
                const displayRankName = escapeHtmlAdmin(localizeRankName(rawRankName));
                const rankColor = String(rank?.color || '#6B46C1');
                const rankDescription = escapeHtmlAdmin(rank?.description || 'Conquista especial');
                const rankGoal = escapeHtmlAdmin(rank?.customText || 'Conquistado');
                const bgValue = escapeHtmlAdmin(String(rank?.backgroundImage || '').trim());
                const enableAdminPanelEnabled = Number(rank?.enableAdminPanel) === 1 || rank?.enableAdminPanel === true;
                const isVisibleEnabled = Number(rank?.isVisible) === 1 || rank?.isVisible === true;
                const canManageDownloadsEnabled = Number(rank?.canManageDownloads) === 1 || rank?.canManageDownloads === true;
                const canOrderAllRanksEnabled = Number(rank?.canOrderAllRanks) === 1 || rank?.canOrderAllRanks === true;
                const canUseAnimatedProfileEnabled = Number(rank?.canUseAnimatedProfile) === 1 || rank?.canUseAnimatedProfile === true;
                const canChangeOwnColorEnabled = Number(rank?.canChangeOwnColor) === 1 || rank?.canChangeOwnColor === true;
                return `
                    <div class="custom-achievement-bg-card achievement-editor-slot"
                         data-rank-id="${rankId}"
                         data-rank-name="${rankName}"
                         data-rank-color="${escapeHtmlAdmin(rankColor)}"
                         data-rank-description="${rankDescription}"
                         data-rank-custom-text="${rankGoal}"
                         style="border-color: ${rankColor}99;">
                        <h3 style="color: ${rankColor};">${displayRankName}</h3>
                        <div class="custom-achievement-bg-preview achievement-bg-preview is-empty" data-current-bg="${bgValue}" style="--achievement-color: ${rankColor}; border-color: ${rankColor}cc;">
                            <div class="achievement-preview-content">
                                <div class="achievement-preview-name">${displayRankName}</div>
                                <div class="achievement-preview-desc">${rankDescription}</div>
                                <div class="achievement-preview-goal">${rankGoal}</div>
                            </div>
                            <div class="achievement-preview-badge">Conquistado</div>
                        </div>
                        <div class="achievement-editor-controls">
                            <input type="file" class="custom-achievement-bg-file" accept=".gif,.png,.jpg,.jpeg,.webp,image/gif,image/png,image/jpeg,image/webp">
                            <div class="achievement-editor-actions">
                                <button type="button" class="achievement-editor-btn save save-custom-achievement-bg-btn" data-rank-id="${rankId}">Salvar fundo</button>
                                <button type="button" class="achievement-editor-btn clear clear-custom-achievement-bg-btn" data-rank-id="${rankId}">Remover</button>
                            </div>
                        </div>
                        <div style="margin-top: 10px; display: grid; gap: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px; color: #10B981; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="enableAdminPanel" ${enableAdminPanelEnabled ? 'checked' : ''}>
                                Habilitar Painel Admin
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; color: #3B82F6; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="isVisible" ${isVisibleEnabled ? 'checked' : ''}>
                                Permitir Usuário Escolher (Exibir/Ocultar)
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; color: #EC4899; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="canManageDownloads" ${canManageDownloadsEnabled ? 'checked' : ''}>
                                Dar Administração de Downloads
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; color: #F59E0B; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="canOrderAllRanks" ${canOrderAllRanksEnabled ? 'checked' : ''}>
                                Permitir Ordenar Todas as Conquistas
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; color: #38BDF8; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="canUseAnimatedProfile" ${canUseAnimatedProfileEnabled ? 'checked' : ''}>
                                Permitir Card Animado
                            </label>
                            <label style="display: flex; align-items: center; gap: 8px; color: #F472B6; font-size: 12px; font-weight: 600;">
                                <input type="checkbox" class="rank-themed-checkbox custom-rank-perm-toggle" data-perm="canChangeOwnColor" ${canChangeOwnColorEnabled ? 'checked' : ''}>
                                Permitir usuário mudar cor desta conquista
                            </label>
                            <button type="button" class="achievement-editor-btn save save-custom-achievement-perms-btn" data-rank-id="${rankId}">
                                Salvar opções
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    container.querySelectorAll('.custom-achievement-bg-preview').forEach((preview) => {
        const currentBg = String(preview.dataset.currentBg || '').trim();
        setAchievementPreviewBackground(preview, currentBg);
    });
    container.querySelectorAll('.edit-virtual-founder-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const founder = getAchievementEditorGroupItems('general')
                .find((rank) => rank?.isVirtualFounder === true);
            if (!founder) return;

            setSelectedAchievementRank('general', founder.name);
            renderAchievementGroupSelect('general');
            getAchievementGroupPreview('general')
                ?.closest('.achievement-editor-slot')
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    });
}

function previewCustomAchievementFile(input) {
    if (!input) return;
    const card = input.closest('.custom-achievement-bg-card');
    if (!card) return;
    const previewEl = card.querySelector('.custom-achievement-bg-preview');
    if (!previewEl) return;

    const file = input.files?.[0] || null;
    if (!file) {
        setAchievementPreviewBackground(previewEl, previewEl.dataset.currentBg || '');
        return;
    }

    const validationError = validateAchievementBackgroundFile(file);
    if (validationError) {
        showMessage(validationError, 'error');
        input.value = '';
        setAchievementPreviewBackground(previewEl, previewEl.dataset.currentBg || '');
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAchievementPreviewBackground(previewEl, objectUrl);
    previewEl.dataset.previewObjectUrl = objectUrl;
}

function applyAchievementAnimationModeToState(groupKey, rankName, rawMode = 'hover') {
    const mode = normalizeAchievementCardAnimationMode(rawMode);
    const modeKey = getAchievementAnimationModeKey(groupKey, rankName);
    if (!modeKey) return mode;
    if (mode === 'hover') {
        delete achievementEditorState.animationModes[modeKey];
    } else {
        achievementEditorState.animationModes[modeKey] = mode;
    }
    return mode;
}

async function persistAchievementRankAnimationMode(groupKey, selectedItem, rawMode = 'hover') {
    if (!selectedItem?.name) {
        throw new Error('Selecione uma conquista primeiro.');
    }
    const requestedMode = normalizeAchievementCardAnimationMode(rawMode);
    const result = await AuthAPI.updateAchievementCardAnimationMode(groupKey, selectedItem.name, requestedMode);
    if (!result?.success) {
        throw new Error(result?.message || 'Erro ao salvar modo de animação da conquista.');
    }
    const savedMode = applyAchievementAnimationModeToState(
        groupKey,
        selectedItem.name,
        result?.animationMode || requestedMode
    );
    syncAchievementAnimationSelect(groupKey, selectedItem);
    return savedMode;
}

async function loadAchievementEditorData() {
    const container = document.getElementById('customAchievementBackgroundsContainer');
    if (container) {
        container.classList.add('loading');
        container.textContent = 'Carregando conquistas personalizadas...';
    }

    try {
        await AuthAPI.syncLikeAchievementRanks().catch((error) => {
            console.warn('Falha ao sincronizar conquistas de likes antes de carregar o editor:', error);
            return null;
        });

        const [backgroundsSettled, customRanksSettled, defaultRanksSettled, postRanksSettled, ownerAccountSettled, manualOverridesSettled] = await Promise.allSettled([
            AuthAPI.getAchievementBackgrounds(),
            AuthAPI.getAllCustomRanks(),
            AuthAPI.getDefaultRanks(),
            AuthAPI.getPostageRanks(),
            isCurrentAdminOwnerAccount(),
            AuthAPI.getManualRankOverrides()
        ]);

        if (backgroundsSettled.status === 'rejected') {
            console.warn('Falha ao carregar fundos de conquistas:', backgroundsSettled.reason);
        }
        if (customRanksSettled.status === 'rejected') {
            console.warn('Falha ao carregar conquistas customizadas:', customRanksSettled.reason);
        }
        if (defaultRanksSettled.status === 'rejected') {
            console.warn('Falha ao carregar conquistas padrão:', defaultRanksSettled.reason);
        }
        if (postRanksSettled.status === 'rejected') {
            console.warn('Falha ao carregar conquistas de postagens:', postRanksSettled.reason);
        }
        if (manualOverridesSettled.status === 'rejected') {
            console.warn('Falha ao carregar overrides manuais de conquistas:', manualOverridesSettled.reason);
        }

        const backgroundsResult = backgroundsSettled.status === 'fulfilled' ? backgroundsSettled.value : { success: false };
        const customRanksResult = customRanksSettled.status === 'fulfilled' ? customRanksSettled.value : { success: false };
        const defaultRanksResult = defaultRanksSettled.status === 'fulfilled' ? defaultRanksSettled.value : { success: false };
        const postRanksResult = postRanksSettled.status === 'fulfilled' ? postRanksSettled.value : { success: false };
        const isOwnerAccount = ownerAccountSettled.status === 'fulfilled' ? Boolean(ownerAccountSettled.value) : false;
        const manualOverridesResult = manualOverridesSettled.status === 'fulfilled' ? manualOverridesSettled.value : { success: false };

        const backgrounds = backgroundsResult?.success && backgroundsResult?.backgrounds
            ? backgroundsResult.backgrounds
            : {};

        // Combine custom ranks, default progression ranks and postage (post/like) ranks
        let customRanks = [];
        if (Array.isArray(customRanksResult?.ranks)) {
            customRanks = customRanksResult.ranks;
        } else if (Array.isArray(customRanksResult?.data)) {
            customRanks = customRanksResult.data;
        } else if (Array.isArray(customRanksResult)) {
            customRanks = customRanksResult;
        }

        if (!customRanks.length) {
            try {
                const fallbackRanks = await AuthAPI.getCustomRanks();
                if (Array.isArray(fallbackRanks?.ranks)) {
                    customRanks = fallbackRanks.ranks;
                } else if (Array.isArray(fallbackRanks?.data)) {
                    customRanks = fallbackRanks.data;
                } else if (Array.isArray(fallbackRanks)) {
                    customRanks = fallbackRanks;
                }
            } catch (fallbackError) {
                console.warn('Falha ao recuperar conquistas customizadas usando fallback:', fallbackError);
            }
        }

        if (!customRanks.some((rank) => normalizeAchievementRankGroup(rank?.group || rank?.rankGroup || '', rank?.icon, rank) === 'like_achievement')) {
            try {
                const likeRanksResult = await AuthAPI.getCustomRanksByGroup('like_achievement');
                const likeRanks = Array.isArray(likeRanksResult?.ranks)
                    ? likeRanksResult.ranks
                    : Array.isArray(likeRanksResult?.data)
                        ? likeRanksResult.data
                        : Array.isArray(likeRanksResult)
                            ? likeRanksResult
                            : [];
                if (likeRanks.length) {
                    customRanks = [...customRanks, ...likeRanks];
                }
            } catch (likeRanksError) {
                console.warn('Falha ao recuperar conquistas de likes como fallback:', likeRanksError);
            }
        }

        const defaultRanks = Array.isArray(defaultRanksResult?.ranks)
            ? defaultRanksResult.ranks.map((r) => ({
                id: null,
                name: r.name,
                description: r.description || '',
                icon: r.icon || '',
                color: r.color || '#6B46C1',
                group: 'progression'
            }))
            : Array.isArray(defaultRanksResult)
                ? defaultRanksResult.map((r) => ({
                    id: null,
                    name: r.name,
                    description: r.description || '',
                    icon: r.icon || '',
                    color: r.color || '#6B46C1',
                    group: 'progression'
                }))
                : [];
        const postRanks = Array.isArray(postRanksResult?.ranks)
            ? postRanksResult.ranks.map((r) => ({
                ...r,
                group: 'post_achievement'
            }))
            : Array.isArray(postRanksResult)
                ? postRanksResult.map((r) => ({
                    ...r,
                    group: 'post_achievement'
                }))
                : [];

        adminIsOwnerAccount = Boolean(isOwnerAccount);
        manualRankOverridesCache = manualOverridesResult?.success && manualOverridesResult?.overrides
            ? manualOverridesResult.overrides
            : {};

        const allRanks = [...customRanks, ...defaultRanks, ...postRanks];
        buildAchievementEditorData(backgrounds, allRanks, {
            includeFounderForOwner: isOwnerAccount,
            manualRankOverrides: manualRankOverridesCache
        });

        console.log('[ADMIN] Achievement editor data counts', {
            customRanks: customRanks.length,
            defaultRanks: defaultRanks.length,
            postRanks: postRanks.length,
            allRanks: allRanks.length,
            editorGroups: {
                like: achievementEditorState.like_achievement.length,
                post: achievementEditorState.post_achievement.length,
                progression: achievementEditorState.progression.length,
                general: achievementEditorState.general.length
            }
        });

        // Debug panel: exibe resumo rápido na UI para facilitar diagnóstico
        if (container) {
            try {
                const sampleIncoming = (allRanks || []).slice(0, 12).map(r => ({ id: r?.id || null, name: r?.name || '', rankGroup: r?.rankGroup || r?.group || '', icon: r?.icon || '' }));
                const debugObj = {
                    counts: {
                        customRanks: customRanks.length,
                        defaultRanks: defaultRanks.length,
                        postRanks: postRanks.length,
                        allRanks: allRanks.length
                    },
                    groups: {
                        post: achievementEditorState.post_achievement.length,
                        like: achievementEditorState.like_achievement.length,
                        progression: achievementEditorState.progression.length,
                        general: achievementEditorState.general.length
                    },
                    sampleIncoming
                };

                let dbgEl = document.getElementById('achievement-debug-output');
                if (!dbgEl) {
                    dbgEl = document.createElement('pre');
                    dbgEl.id = 'achievement-debug-output';
                    dbgEl.style.background = 'rgba(0,0,0,0.45)';
                    dbgEl.style.color = '#fff';
                    dbgEl.style.padding = '10px';
                    dbgEl.style.borderRadius = '8px';
                    dbgEl.style.marginTop = '12px';
                    dbgEl.style.maxHeight = '220px';
                    dbgEl.style.overflow = 'auto';
                    container.appendChild(dbgEl);
                }
                dbgEl.textContent = JSON.stringify(debugObj, null, 2);
            } catch (e) {
                console.warn('Erro ao montar painel de debug das conquistas:', e);
            }
        }

        ACHIEVEMENT_EDITOR_GROUP_KEYS.forEach((groupKey) => {
            renderAchievementGroupSelect(groupKey);
            const fileInput = getAchievementGroupFileInput(groupKey);
            if (fileInput) fileInput.value = '';
        });

        if (customRanks.length) {
            renderCustomAchievementBackgrounds(customRanks);
        } else if (customRanksResult?.success === false) {
            if (container) {
                container.innerHTML = '<p style="color: red;">Erro ao carregar conquistas personalizadas.</p>';
            }
        } else if (container) {
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhuma conquista personalizada encontrada.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar editor de conquistas:', error);
        if (container) {
            container.innerHTML = '<p style="color: red;">Erro ao carregar editor de conquistas.</p>';
        }
    } finally {
        if (container) {
            container.classList.remove('loading');
        }
    }
}

function readCustomAchievementPermValue(card, permName) {
    const input = card?.querySelector(`.custom-rank-perm-toggle[data-perm="${permName}"]`);
    return input?.checked === true;
}

async function saveCustomAchievementPermissions(rankId, button) {
    if (!Number.isInteger(Number(rankId)) || Number(rankId) <= 0) {
        showMessage('Conquista inválida.', 'error');
        return;
    }

    const card = getCustomAchievementCard(rankId);
    if (!card) {
        showMessage('Card da conquista não encontrado.', 'error');
        return;
    }

    const rankName = String(card.dataset.rankName || '').trim();
    const rankColor = String(card.dataset.rankColor || '#6B46C1').trim();
    const rankDescription = String(card.dataset.rankDescription || '').trim();
    const rankCustomText = String(card.dataset.rankCustomText || '').trim();
    const backgroundImageUrl = String(
        card.querySelector('.custom-achievement-bg-preview')?.dataset?.currentBg || ''
    ).trim();

    if (!rankName || !rankColor || !rankDescription || !rankCustomText) {
        showMessage('Não foi possível montar os dados da conquista para salvar opções.', 'error');
        return;
    }

    const payload = {
        enableAdminPanel: readCustomAchievementPermValue(card, 'enableAdminPanel'),
        isVisible: readCustomAchievementPermValue(card, 'isVisible'),
        canManageDownloads: readCustomAchievementPermValue(card, 'canManageDownloads'),
        canOrderAllRanks: readCustomAchievementPermValue(card, 'canOrderAllRanks'),
        canUseAnimatedProfile: readCustomAchievementPermValue(card, 'canUseAnimatedProfile'),
        canChangeOwnColor: readCustomAchievementPermValue(card, 'canChangeOwnColor')
    };

    const release = setEditorButtonBusy(button, true, 'Salvando...');
    try {
        const result = await AuthAPI.updateCustomRank(
            rankId,
            rankName,
            rankColor,
            rankDescription,
            rankCustomText,
            backgroundImageUrl,
            payload.enableAdminPanel,
            payload.isVisible,
            payload.canManageDownloads,
            payload.canOrderAllRanks,
            payload.canUseAnimatedProfile,
            payload.canChangeOwnColor
        );

        if (!result?.success) {
            throw new Error(result?.message || 'Erro ao salvar opções da conquista.');
        }

        loadedTabs.delete('ranks');
        await loadAchievementEditorData();
        showMessage(`Opções de "${rankName}" salvas com sucesso!`, 'success');
    } catch (error) {
        showMessage(error.message || 'Erro ao salvar opções da conquista.', 'error');
    } finally {
        release();
    }
}

async function saveAchievementRankBackground(groupKey, button) {
    if (!ACHIEVEMENT_EDITOR_GROUP_KEYS.includes(groupKey)) {
        showMessage('Categoria inválida.', 'error');
        return;
    }

    const selectedItem = getSelectedAchievementRank(groupKey);
    if (!selectedItem) {
        showMessage('Selecione uma conquista primeiro.', 'error');
        return;
    }

    const fileInput = getAchievementGroupFileInput(groupKey);
    const file = fileInput?.files?.[0] || null;
    const modeSelect = getAchievementGroupAnimationSelect(groupKey);
    const selectedMode = normalizeAchievementCardAnimationMode(modeSelect?.value || 'hover');
    const currentMode = getAchievementItemAnimationMode(groupKey, selectedItem);
    const modeChanged = selectedMode !== currentMode;
    const canEditGeneralPerms = groupKey === 'general' && canEditGeneralAchievementPermissions(selectedItem);
    const requestedGeneralPerms = canEditGeneralPerms
        ? readGeneralAchievementPermissionPayloadFromForm()
        : null;
    const generalPermsChanged = hasGeneralAchievementPermissionChanges(selectedItem, requestedGeneralPerms);
    const canEditMetadata = canEditAchievementMetadata(selectedItem);
    const requestedMetadata = canEditMetadata
        ? readAchievementMetadataPayloadFromForm(groupKey, selectedItem)
        : null;
    const metadataChanged = hasAchievementMetadataChanges(selectedItem, requestedMetadata);
    const colorChanged = selectedItem.isVirtualFounder === true
        && requestedMetadata?.color !== String(selectedItem.color || FOUNDER_ACHIEVEMENT_COLOR);

    if (file) {
        const validationError = validateAchievementBackgroundFile(file);
        if (validationError) {
            showMessage(validationError, 'error');
            return;
        }
    }

    if (canEditMetadata && (metadataChanged || generalPermsChanged)) {
        if (!requestedMetadata?.name || !requestedMetadata?.description || !requestedMetadata?.customText) {
            showMessage('Nome, descrição e texto customizável são obrigatórios.', 'error');
            return;
        }
    }

    if (!file && !modeChanged && !generalPermsChanged && !metadataChanged && !colorChanged) {
        showMessage('Selecione uma imagem/GIF ou altere animação/opções/dados do card.', 'error');
        return;
    }

    const release = setEditorButtonBusy(button, true, file ? 'Enviando...' : 'Salvando...');
    try {
        let backgroundUpdated = false;
        let animationUpdated = false;
        let permissionsUpdated = false;
        let metadataUpdated = false;
        let uploadedBackgroundUrl = '';

        if (file) {
            const uploadResult = await AuthAPI.uploadAchievementBackground(file);
            if (!uploadResult?.success || !uploadResult?.backgroundImageUrl) {
                throw new Error(uploadResult?.message || 'Falha no upload da imagem.');
            }
            uploadedBackgroundUrl = String(uploadResult.backgroundImageUrl || '').trim();
        }

        const isVirtualFounder = selectedItem.isVirtualFounder === true;
        const shouldUpdateCustomRank = canEditMetadata
            && !isVirtualFounder
            && (metadataChanged || (canEditGeneralPerms && generalPermsChanged) || file);

        if (isVirtualFounder && (metadataChanged || colorChanged || file)) {
            const mergedMetadata = requestedMetadata || {
                name: String(selectedItem?.name || '').trim(),
                description: String(selectedItem?.description || '').trim(),
                customText: getAchievementItemCustomText(selectedItem),
                color: String(selectedItem?.color || FOUNDER_ACHIEVEMENT_COLOR)
            };
            const backgroundToPersist = uploadedBackgroundUrl || String(getAchievementItemBackground(selectedItem) || '').trim();

            const overrideResult = await AuthAPI.updateManualRankOverride(selectedItem.name || FOUNDER_ACHIEVEMENT_NAME, {
                ...mergedMetadata,
                backgroundImage: backgroundToPersist
            });
            if (!overrideResult?.success) {
                throw new Error(overrideResult?.message || 'Falha ao salvar personalização do Fundador.');
            }

            selectedItem.name = mergedMetadata.name;
            selectedItem.description = mergedMetadata.description;
            selectedItem.customText = mergedMetadata.customText;
            selectedItem.goal = mergedMetadata.customText;
            selectedItem.color = mergedMetadata.color;
            selectedItem.backgroundImage = backgroundToPersist;
            manualRankOverridesCache = overrideResult?.overrides && typeof overrideResult.overrides === 'object'
                ? overrideResult.overrides
                : manualRankOverridesCache;
            metadataUpdated = metadataChanged || colorChanged;
            backgroundUpdated = Boolean(file);
        } else if (shouldUpdateCustomRank) {
            const currentPermissions = getAchievementPermissionPayloadFromItem(selectedItem);
            const mergedPermissions = canEditGeneralPerms && requestedGeneralPerms
                ? requestedGeneralPerms
                : currentPermissions;
            const mergedMetadata = requestedMetadata || {
                name: String(selectedItem?.name || '').trim(),
                description: String(selectedItem?.description || '').trim(),
                customText: getAchievementItemCustomText(selectedItem)
            };

            const currentBg = String(getAchievementItemBackground(selectedItem) || '').trim();
            const backgroundToPersist = uploadedBackgroundUrl || currentBg;

            const updateRankResult = await AuthAPI.updateCustomRank(
                selectedItem.id,
                mergedMetadata.name,
                selectedItem.color,
                mergedMetadata.description,
                mergedMetadata.customText,
                backgroundToPersist,
                mergedPermissions.enableAdminPanel,
                mergedPermissions.isVisible,
                mergedPermissions.canManageDownloads,
                mergedPermissions.canOrderAllRanks,
                mergedPermissions.canUseAnimatedProfile,
                mergedPermissions.canChangeOwnColor
            );
            if (!updateRankResult?.success) {
                throw new Error(updateRankResult?.message || 'Falha ao salvar dados da conquista.');
            }

            selectedItem.name = mergedMetadata.name;
            selectedItem.description = mergedMetadata.description;
            selectedItem.customText = mergedMetadata.customText;
            selectedItem.goal = mergedMetadata.customText;
            selectedItem.enableAdminPanel = mergedPermissions.enableAdminPanel ? 1 : 0;
            selectedItem.isVisible = mergedPermissions.isVisible ? 1 : 0;
            selectedItem.canManageDownloads = mergedPermissions.canManageDownloads ? 1 : 0;
            selectedItem.canOrderAllRanks = mergedPermissions.canOrderAllRanks ? 1 : 0;
            selectedItem.canUseAnimatedProfile = mergedPermissions.canUseAnimatedProfile ? 1 : 0;
            selectedItem.canChangeOwnColor = mergedPermissions.canChangeOwnColor ? 1 : 0;

            if (file) {
                const nextBg = String(backgroundToPersist || '').trim();
                selectedItem.backgroundImage = nextBg;
                const items = getAchievementEditorGroupItems(groupKey);
                const target = items.find((item) => Number(item.id) === Number(selectedItem.id));
                if (target) {
                    target.backgroundImage = nextBg;
                    target.name = mergedMetadata.name;
                    target.description = mergedMetadata.description;
                    target.customText = mergedMetadata.customText;
                    target.goal = mergedMetadata.customText;
                }
                backgroundUpdated = true;
            }

            metadataUpdated = metadataChanged;
            permissionsUpdated = canEditGeneralPerms && generalPermsChanged;
        } else if (file) {
            const updateResult = await AuthAPI.updateCustomAchievementBackground(selectedItem.id, uploadedBackgroundUrl);
            if (!updateResult?.success) {
                throw new Error(updateResult?.message || 'Falha ao salvar fundo da conquista.');
            }

            const nextBg = String(updateResult.backgroundImageUrl || uploadedBackgroundUrl || '').trim();
            const items = getAchievementEditorGroupItems(groupKey);
            const target = items.find((item) => Number(item.id) === Number(selectedItem.id));
            if (target) target.backgroundImage = nextBg;
            backgroundUpdated = true;
        }

        if (modeChanged) {
            const animationTarget = metadataUpdated && requestedMetadata?.name
                ? { ...selectedItem, name: requestedMetadata.name }
                : selectedItem;
            await persistAchievementRankAnimationMode(groupKey, animationTarget, selectedMode);
            animationUpdated = true;
        }

        if (fileInput && file) fileInput.value = '';
        renderAchievementGroupPreview(groupKey);
        await loadAchievementEditorData();
        const updatedParts = [];
        if (metadataUpdated) updatedParts.push('dados do card');
        if (permissionsUpdated) updatedParts.push('opções');
        if (backgroundUpdated) updatedParts.push('fundo');
        if (animationUpdated) updatedParts.push('animação');
        if (updatedParts.length > 0) {
            showMessage(`${updatedParts.join(', ')} de "${selectedItem.name}" salvos com sucesso!`, 'success');
        }
    } catch (error) {
        showMessage(error.message || 'Erro ao salvar configurações da conquista.', 'error');
    } finally {
        release();
    }
}

async function clearAchievementRankBackground(groupKey, button) {
    if (!ACHIEVEMENT_EDITOR_GROUP_KEYS.includes(groupKey)) {
        showMessage('Categoria inválida.', 'error');
        return;
    }

    const selectedItem = getSelectedAchievementRank(groupKey);
    if (!selectedItem) {
        showMessage('Selecione uma conquista primeiro.', 'error');
        return;
    }

    const release = setEditorButtonBusy(button, true, 'Removendo...');
    try {
        if (selectedItem.isVirtualFounder === true) {
            const result = await AuthAPI.updateManualRankOverride(selectedItem.name || FOUNDER_ACHIEVEMENT_NAME, {
                name: selectedItem.name,
                description: selectedItem.description,
                customText: getAchievementItemCustomText(selectedItem),
                color: selectedItem.color,
                backgroundImage: ''
            });
            if (!result?.success) {
                throw new Error(result?.message || 'Erro ao remover fundo do Fundador.');
            }
            selectedItem.backgroundImage = '';
            manualRankOverridesCache = result?.overrides && typeof result.overrides === 'object'
                ? result.overrides
                : manualRankOverridesCache;
            renderAchievementGroupPreview(groupKey);
            await loadAchievementEditorData();
            showMessage('Fundo do Fundador removido com sucesso!', 'success');
            return;
        }

        const result = await AuthAPI.updateCustomAchievementBackground(selectedItem.id, '');

        if (!result?.success) {
            throw new Error(result?.message || 'Erro ao remover fundo da conquista.');
        }

        const items = getAchievementEditorGroupItems(groupKey);
        const target = items.find((item) => Number(item.id) === Number(selectedItem.id));
        if (target) target.backgroundImage = '';

        renderAchievementGroupPreview(groupKey);
        const fileInput = getAchievementGroupFileInput(groupKey);
        if (fileInput) fileInput.value = '';
        await loadAchievementEditorData();
        showMessage(`Fundo de "${selectedItem.name}" removido com sucesso.`, 'success');
    } catch (error) {
        showMessage(error.message || 'Erro ao remover fundo da conquista.', 'error');
    } finally {
        release();
    }
}

function getCustomAchievementCard(rankId) {
    return document.querySelector(`.custom-achievement-bg-card[data-rank-id="${Number(rankId)}"]`);
}

async function saveCustomAchievementBackground(rankId, button) {
    if (!Number.isInteger(Number(rankId)) || Number(rankId) <= 0) {
        showMessage('Conquista inválida.', 'error');
        return;
    }

    const card = getCustomAchievementCard(rankId);
    const fileInput = card?.querySelector('.custom-achievement-bg-file');
    const previewEl = card?.querySelector('.custom-achievement-bg-preview');
    const file = fileInput?.files?.[0] || null;
    const validationError = validateAchievementBackgroundFile(file);
    if (validationError) {
        showMessage(validationError, 'error');
        return;
    }

    const release = setEditorButtonBusy(button, true, 'Enviando...');
    try {
        const uploadResult = await AuthAPI.uploadAchievementBackground(file);
        if (!uploadResult?.success || !uploadResult?.backgroundImageUrl) {
            throw new Error(uploadResult?.message || 'Falha no upload da imagem.');
        }

        const updateResult = await AuthAPI.updateCustomAchievementBackground(rankId, uploadResult.backgroundImageUrl);
        if (!updateResult?.success) {
            throw new Error(updateResult?.message || 'Erro ao salvar fundo da conquista.');
        }

        const nextBg = String(updateResult.backgroundImageUrl || uploadResult.backgroundImageUrl || '').trim();
        if (previewEl) {
            previewEl.dataset.currentBg = nextBg;
            setAchievementPreviewBackground(previewEl, nextBg);
        }
        if (fileInput) fileInput.value = '';
        await loadAchievementEditorData();
        showMessage('Fundo da conquista personalizado salvo com sucesso!', 'success');
    } catch (error) {
        showMessage(error.message || 'Erro ao salvar fundo da conquista.', 'error');
    } finally {
        release();
    }
}

async function clearCustomAchievementBackground(rankId, button) {
    if (!Number.isInteger(Number(rankId)) || Number(rankId) <= 0) {
        showMessage('Conquista inválida.', 'error');
        return;
    }

    const card = getCustomAchievementCard(rankId);
    const previewEl = card?.querySelector('.custom-achievement-bg-preview');
    const fileInput = card?.querySelector('.custom-achievement-bg-file');

    const release = setEditorButtonBusy(button, true, 'Removendo...');
    try {
        const result = await AuthAPI.updateCustomAchievementBackground(rankId, '');
        if (!result?.success) {
            throw new Error(result?.message || 'Erro ao remover fundo da conquista.');
        }

        if (previewEl) {
            previewEl.dataset.currentBg = '';
            setAchievementPreviewBackground(previewEl, '');
        }
        if (fileInput) fileInput.value = '';
        await loadAchievementEditorData();
        showMessage('Fundo removido com sucesso.', 'success');
    } catch (error) {
        showMessage(error.message || 'Erro ao remover fundo da conquista.', 'error');
    } finally {
        release();
    }
}

// ===================== CONQUISTAS Padrão =====================
async function loadDefaultRanks() {
    const container = document.getElementById('defaultRanksContainer');
    try {
        const result = await AuthAPI.getDefaultRanks();
        if (result.success && result.ranks) {
            renderRanksList(container, result.ranks, true);
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Erro ao carregar conquistas padrão</p>';
    }
}

// ===================== CONQUISTAS CUSTOMIZeVEIS =====================
async function loadManualEvents() {
    const container = document.getElementById('manualEventsList');
    if (!container) return;

    container.classList.add('loading');
    container.innerHTML = 'Carregando eventos...';

    try {
        const result = await AuthAPI.getSpecialEvents();
        if (!result?.success) {
            throw new Error(result?.message || 'Erro ao carregar eventos');
        }

        const events = Array.isArray(result.events) ? result.events : [];
        if (!events.length) {
            container.innerHTML = '<p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 13px;">Nenhum evento manual criado ainda.</p>';
            return;
        }

        container.innerHTML = events.map((event) => renderManualEventCard(event)).join('');
        container.querySelectorAll('[data-manual-event-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.manualEventAction;
                const eventId = Number(button.dataset.manualEventId || 0);
                if (!eventId || !['cancel','finish'].includes(action)) return;

                const actionLabel = action === 'cancel' ? 'cancelar' : 'encerrar';
                if (!window.confirm(`Deseja ${actionLabel} este evento manual agora?`)) return;

                button.disabled = true;
                button.textContent = action === 'cancel' ? 'Cancelando...' : 'Encerrando...';
                try {
                    const result = await AuthAPI.updateSpecialEventStatus(eventId, action);
                    if (!result?.success) {
                        throw new Error(result?.message || 'Falha ao atualizar o evento');
                    }
                    await loadManualEvents();
                    await loadCustomRanks();
                    showMessage(action === 'cancel' ? 'Evento cancelado com sucesso.' : 'Evento encerrado com sucesso.', 'success');
                } catch (error) {
                    console.error('Erro ao atualizar evento:', error);
                    showMessage(error?.message || 'Não foi possível atualizar o evento.', 'error');
                } finally {
                    button.disabled = false;
                }
            });
        });
    } catch (error) {
        console.error('Erro ao carregar eventos manuais:', error);
        container.innerHTML = '<p style="color: #FCA5A5; font-size: 13px;">Erro ao carregar eventos manuais.</p>';
    } finally {
        container.classList.remove('loading');
    }
}

function renderManualEventCard(event) {
    const eventName = String(event?.name || 'Evento').trim();
    const eventDescription = String(event?.description || event?.customText || '').trim();
    const eventStartDate = event?.eventStartDate ? new Date(event.eventStartDate).toLocaleDateString('pt-BR') : 'Sem início';
    const eventEndDate = event?.eventEndDate ? new Date(event.eventEndDate).toLocaleDateString('pt-BR') : 'Sem fim';
    const isActive = Number(event?.isSpecial) !== 0 && (!event?.eventEndDate || new Date(event.eventEndDate) >= new Date());
    const statusText = isActive ? 'Ativo agora' : 'Encerrado';
    const statusColor = isActive ? '#34D399' : '#FCA5A5';

    return `
        <article style="border: 1px solid ${event?.color || '#F59E0B'}55; background: rgba(17, 24, 39, 0.92); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div>
                    <strong style="color: #FBBF24; font-size: 14px; display: block;">${escapeHtml(eventName)}</strong>
                    <span style="color: rgba(255,255,255,0.75); font-size: 12px;">${escapeHtml(eventDescription || 'Sem descrição adicional')}</span>
                </div>
                <span style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}55; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-weight: 700;">${statusText}</span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; color: rgba(255,255,255,0.72); font-size: 12px;">
                <span>Início: ${escapeHtml(eventStartDate)}</span>
                <span>•</span>
                <span>Fim: ${escapeHtml(eventEndDate)}</span>
            </div>
            ${isActive ? `
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
                    <button type="button" data-manual-event-action="finish" data-manual-event-id="${event.id}" style="padding: 8px 10px; border-radius: 8px; background: linear-gradient(135deg, #FB7185, #F59E0B); color: white; border: none; cursor: pointer; font-size: 12px; font-weight: 700;">Terminar evento</button>
                    <button type="button" data-manual-event-action="cancel" data-manual-event-id="${event.id}" style="padding: 8px 10px; border-radius: 8px; background: rgba(248, 113, 113, 0.16); color: #FCA5A5; border: 1px solid rgba(248, 113, 113, 0.35); cursor: pointer; font-size: 12px; font-weight: 700;">Cancelar evento</button>
                </div>
            ` : ''}
        </article>
    `;
}

function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function loadCustomRanks() {
    const container = document.getElementById('customRanksContainer');
    try {
        console.log('Carregando conquistas customizáveis...');
        const result = await AuthAPI.getAllCustomRanks();
        console.log('Resultado da API:', result);
        
        if (result.success) {
            const ranks = Array.isArray(result.ranks) ? [...result.ranks] : [];
            if (adminIsOwnerAccount && !ranks.some((rank) => {
                return normalizeAchievementNameKey(rank?.name || '') === normalizeAchievementNameKey(FOUNDER_ACHIEVEMENT_NAME);
            })) {
                const overrideResult = await AuthAPI.getManualRankOverrides();
                if (!overrideResult?.success) {
                    console.warn('Não foi possível carregar a personalização do Fundador:', overrideResult?.message || 'Resposta inválida');
                }
                const founderOverride = overrideResult?.success
                    ? overrideResult.overrides?.[normalizeAchievementNameKey(FOUNDER_ACHIEVEMENT_NAME)] || {}
                    : {};
                const founderColor = /^#[0-9a-f]{6}$/i.test(String(founderOverride.color || ''))
                    ? founderOverride.color
                    : FOUNDER_ACHIEVEMENT_COLOR;
                ranks.push({
                    id: 'fixed:manual',
                    name: founderOverride.name || FOUNDER_ACHIEVEMENT_NAME,
                    color: founderColor,
                    description: founderOverride.description || FOUNDER_ACHIEVEMENT_DESCRIPTION,
                    customText: founderOverride.customText || 'Conquistado',
                    backgroundImage: founderOverride.backgroundImage || '',
                    icon: 'FND',
                    rankGroup: 'general',
                    isVirtualFounder: true
                });
            }

            if (ranks.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: #999;">Nenhum conquista customizevel criado ainda</p>';
                return;
            }
            console.log('Renderizando', ranks.length, 'conquistas customizáveis');
            renderRanksList(container, ranks, false);
        } else {
            console.log('API retornou success: false', result.message);
            container.innerHTML = '<p style="color: red;">Erro ao carregar conquistas: ' + (result.message || 'Erro desconhecido') + '</p>';
        }
    } catch (error) {
        console.error('Erro na funeeo loadCustomRanks:', error);
        container.innerHTML = '<p style="color: red;">Erro ao carregar conquistas: ' + error.message + '</p>';
    }
}

function detectCustomRankGroup(rank) {
    const explicit = String(rank?.rankGroup || '').trim().toLowerCase();
    const isSpecial = explicit === 'special' || explicit === 'especiais' || Number(rank?.isSpecial) === 1 || rank?.isSpecial === true;
    if (isSpecial) return 'general';
    if (explicit === 'post_achievement' || explicit === 'posts' || explicit === 'post') return 'post_achievement';
    if (explicit === 'like_achievement' || explicit === 'likes' || explicit === 'like') return 'like_achievement';
    if (explicit === 'progression' || explicit === 'fixed_automatic') return 'progression';
    if (explicit) return explicit;

    const icon = String(rank?.icon || '').trim().toUpperCase();
    if (/^P\d+/.test(icon)) return 'post_achievement';
    if (/^L\d+/.test(icon)) return 'like_achievement';
    return 'general';
}

function renderRankCardHtml(rank, isDefault, canManage = !isDefault) {
    const resolvedBackground = resolveRankBackgroundUrl(rank.backgroundImage || '');
    const cardStyle = resolvedBackground
        ? `style="background-image: linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url('${resolvedBackground}'); background-size: cover; background-position: center;"`
        : '';
    const displayName = localizeRankName(rank?.name || '');
    if (rank?.isVirtualFounder === true) {
        return `
            <div class="rank-card founder-achievement-card" data-rank-name="${escapeHtmlAdmin(displayName)}" ${cardStyle}>
                <div class="rank-icon" style="background-color: ${escapeHtmlAdmin(rank.color || FOUNDER_ACHIEVEMENT_COLOR)}; color: white;">FND</div>
                <div class="rank-info">
                    <h3>${escapeHtmlAdmin(displayName)}</h3>
                    <p class="rank-description">${escapeHtmlAdmin(rank.description || FOUNDER_ACHIEVEMENT_DESCRIPTION)}</p>
                    ${rank.customText ? `<p class="rank-custom-text">${escapeHtmlAdmin(rank.customText)}</p>` : ''}
                    <p style="margin: 6px 0 0 0; font-size: 10px; font-weight: 700; color: #F9A8D4;">Conquista exclusiva do proprietário</p>
                </div>
                <div class="rank-actions">
                    <button class="edit-founder-achievement-btn">Editar</button>
                </div>
            </div>
        `;
    }

    return `
        <div class="rank-card" data-rank-id="${rank.id}" data-rank-name="${rank.name}" ${cardStyle}>
            ${rank.isVisible === 0 ? '<div style="position: absolute; top: 10px; right: 10px; background: rgba(255,0,0,0.9); color: white; padding: 5px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">Oculto</div>' : ''}
            <div class="rank-icon" style="background-color: ${rank.color}; color: white;">
                ${rank.icon || displayName.substring(0, 3).toUpperCase()}
            </div>
            <div class="rank-info">
                <h3>${displayName}</h3>
                ${rank.description ? `<p class="rank-description">${rank.description}</p>` : ''}
                ${rank.customText ? `<p class="rank-custom-text">${rank.customText}</p>` : ''}
                ${(Number(rank.canChangeOwnColor) === 1 || rank.canChangeOwnColor === true)
                    ? `<p style="margin: 6px 0 0 0; font-size: 10px; font-weight: 700; color: #F9A8D4;">Permite mudar cor</p>`
                    : ''}
            </div>
            ${!isDefault && canManage ? `
                <div class="rank-actions">
                    <button class="edit-btn">Editar</button>
                    <button class="delete-btn delete">Deletar</button>
                </div>
            ` : (!isDefault ? `
                <div class="rank-actions" style="pointer-events: none; opacity: 0.7;">
                    <span style="padding: 5px 10px; font-size: 11px; border-radius: 3px; color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.2);">Padrão</span>
                </div>
            ` : '')}
        </div>
    `;
}

function renderRanksList(container, ranks, isDefault) {
    if (!isDefault) {
        // Para customizáveis queremos seeees empilhadas; o grid fica apenas dentro de cada seção.
        container.style.display = 'block';
        container.style.gridTemplateColumns = 'none';
        container.style.gap = '0';
        container.style.marginTop = '15px';

        const groups = {
            general: [],
            post_achievement: [],
            like_achievement: []
        };

        ranks.forEach((rank) => {
            const group = detectCustomRankGroup(rank);
            if (group === 'post_achievement') {
                groups.post_achievement.push(rank);
                return;
            }
            if (group === 'like_achievement') {
                groups.like_achievement.push(rank);
                return;
            }
            groups.general.push(rank);
        });

        const sections = [
            {
                key: 'general',
                title: 'conquistas Personalizados',
                color: '#EC4899',
                emptyMessage: 'Nenhum conquista personalizado criado.'
            },
            {
                key: 'post_achievement',
                title: 'conquistas de Postagens',
                color: '#C084FC',
                emptyMessage: 'Nenhum conquista de postagem encontrado.'
            },
            {
                key: 'like_achievement',
                title: 'conquistas de Likes',
                color: '#38BDF8',
                emptyMessage: 'Nenhum conquista de likes encontrado.'
            }
        ];

        const groupedHtml = sections.map((section) => {
            const list = groups[section.key] || [];
            const canManageSection = section.key === 'general';
            const cardsHtml = list.length > 0
                ? list.map((rank) => renderRankCardHtml(rank, false, canManageSection)).join('')
                : `<p style="margin: 0; color: rgba(255,255,255,0.55); font-size: 13px;">${section.emptyMessage}</p>`;

            return `
                <div style="margin-bottom: 18px; border: 1px solid ${section.color}44; border-radius: 10px; padding: 12px;">
                    <h3 style="margin: 0 0 10px 0; color: ${section.color}; font-size: 15px; font-weight: 700;">
                        ${section.title} <span style="opacity: .75; font-weight: 500;">(${list.length})</span>
                    </h3>
                    <div class="ranks-list">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = groupedHtml;
    } else {
        // Restaurar comportamento padrão (grid) para os conquistas não removeveis.
        container.style.display = '';
        container.style.gridTemplateColumns = '';
        container.style.gap = '';
        container.style.marginTop = '';
        container.innerHTML = ranks.map((rank) => renderRankCardHtml(rank, true)).join('');
    }
    
    // Attach event listeners
    if (!isDefault) {
        container.querySelectorAll('.edit-founder-achievement-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                try {
                    await setActiveAdminTab('achievement-editor');
                    const founder = getAchievementEditorGroupItems('general')
                        .find((rank) => rank?.isVirtualFounder === true);
                    if (!founder) {
                        showMessage('Não foi possível carregar a personalização do Fundador.', 'error');
                        return;
                    }

                    setSelectedAchievementRank('general', founder.name);
                    renderAchievementGroupSelect('general');
                    getAchievementGroupPreview('general')
                        ?.closest('.achievement-editor-slot')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (error) {
                    console.error('Erro ao abrir edição do Fundador:', error);
                    showMessage('Erro ao abrir edição do Fundador: ' + (error?.message || 'Erro desconhecido'), 'error');
                }
            });
        });

        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.rank-card');
                const rankId = card.dataset.rankId;
                const rankName = card.dataset.rankName;
                deleteRank(rankId, rankName);
            });
        });
        
        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('.rank-card');
                const rankId = card.dataset.rankId;
                const rankName = card.dataset.rankName;
                editRank(rankId, rankName);
            });
        });
    }
}

async function deleteRank(rankId, rankName) {
    const confirmed = await showThemeConfirm(
        'Excluir conquista',
        `Tem certeza que deseja deletar a conquista "${rankName}"?`,
        { confirmText: 'Excluir', cancelText: 'Cancelar', danger: true }
    );

    if (!confirmed) {
        return;
    }
    
    try {
        const result = await AuthAPI.deleteCustomRank(rankId);
        if (result.success) {
            showMessage('conquista deletado com sucesso!', 'success');
            loadCustomRanks();
        } else {
            showMessage('Erro: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('Erro ao deletar conquista: ' + error.message, 'error');
    }
}

async function editRank(rankId, rankName) {
    try {
        const allRanks = await AuthAPI.getAllCustomRanks();
        const rankData = allRanks.ranks?.find(r => r.id == rankId);
        if (!rankData) {
            showMessage('conquista não encontrado', 'error');
            return;
        }

        const enableAdminPanelEnabled = Number(rankData?.enableAdminPanel) === 1 || rankData?.enableAdminPanel === true;
        const canManageDownloadsEnabled = Number(rankData?.canManageDownloads) === 1 || rankData?.canManageDownloads === true;
        const canOrderAllRanksEnabled = Number(rankData?.canOrderAllRanks) === 1 || rankData?.canOrderAllRanks === true;
        const canUseAnimatedProfileEnabled = Number(rankData?.canUseAnimatedProfile) === 1 || rankData?.canUseAnimatedProfile === true;
        const canChangeOwnColorEnabled = Number(rankData?.canChangeOwnColor) === 1 || rankData?.canChangeOwnColor === true;

        const modal = document.createElement('div');
        modal.id = 'editRankModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        modal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 2px solid #6B46C1;
                border-radius: 15px;
                padding: 30px;
                max-width: 560px;
                width: 92%;
                max-height: 90vh;
                overflow-y: auto;
            ">
                <h2 style="color: #EC4899; margin-top: 0; text-align: center;">Editar conquista: ${rankName}</h2>
                <form id="editRankForm">
                    <div style="margin-bottom: 15px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Nome *</label>
                        <input type="text" id="editRankName" placeholder="Nome do conquista" value="${rankData.name || ''}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #6B46C1; color: white; border-radius: 5px;">
                        <small style="color: #10B981;">A imagem sera renomeada automaticamente se existir arquivo com o nome antigo</small>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Cor *</label>
                        <input type="color" id="editRankColor" value="${rankData.color || '#6B46C1'}" style="width: 100%; height: 50px; padding: 5px; background: rgba(0,0,0,0.3); border: 1px solid #6B46C1; border-radius: 5px; cursor: pointer;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Descrição *</label>
                        <textarea id="editRankDescription" placeholder="Escreva a função ou Descreva" style="width: 100%; height: 70px; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #6B46C1; color: white; border-radius: 5px; resize: none;">${rankData.description || ''}</textarea>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Texto Customizável (badge do card) *</label>
                        <input type="text" id="editRankCustomText" placeholder="Escrita do Rodapé do card" value="${rankData.customText || ''}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #6B46C1; color: white; border-radius: 5px;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="color: white; display: block; margin-bottom: 5px;">Imagem de Fundo (URL ou upload)</label>
                        <input type="text" id="editRankBackgroundImage" placeholder="Cole a URL da imagem ou deixe em branco" value="${rankData.backgroundImage || ''}" style="width: 100%; padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid #6B46C1; color: white; border-radius: 5px; margin-bottom: 8px;">
                        <input type="file" id="editRankBackgroundImageFile" class="rank-themed-file-input" accept="image/*">
                        <small style="color: rgba(255,255,255,0.65); display: block; margin-top: 6px;">Se selecionar arquivo, ele tere prioridade sobre a URL. Limite: 500MB.</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #10B981; font-weight: 600;">
                            <input type="checkbox" id="editRankEnableAdminPanel" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#10B981;" ${enableAdminPanelEnabled ? 'checked' : ''}>
                            <span>Habilitar Painel Admin para esta conquista</span>
                        </label>
                        <small style="color: rgba(16, 185, 129, 0.85); display: block; margin-top: 8px;">Usuários com esta conquista poderão acessar o painel de administração com permissões limitadas</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #3B82F6; font-weight: 600;">
                            <input type="checkbox" id="editRankIsVisible" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#3B82F6;" ${rankData.isVisible !== 0 ? 'checked' : ''}>
                            <span>Permitir Usuário Escolher (Exibir/Ocultar)</span>
                        </label>
                        <small style="color: rgba(59, 130, 246, 0.8); display: block; margin-top: 8px;">Marcado: usuário pode escolher exibir ou não a conquista. Desmarcado: conquista fica fixa nas conquistas</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(236, 72, 153, 0.1); border: 1px solid rgba(236, 72, 153, 0.4); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #EC4899; font-weight: 600;">
                            <input type="checkbox" id="editRankCanManageDownloads" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#EC4899;" ${canManageDownloadsEnabled ? 'checked' : ''}>
                            <span>Dar Administração de Downloads</span>
                        </label>
                        <small style="color: rgba(236, 72, 153, 0.85); display: block; margin-top: 8px;">Usuários com esta conquista poderão administrar os downloads de todos: editar e excluir os próprios e também os de outros usuários.</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #F59E0B; font-weight: 600;">
                            <input type="checkbox" id="editRankCanOrderAllRanks" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#F59E0B;" ${canOrderAllRanksEnabled ? 'checked' : ''}>
                            <span>Permitir Usuário Ordenar Todas as conquistas (incluindo fixas)</span>
                        </label>
                        <small style="color: rgba(245, 158, 11, 0.85); display: block; margin-top: 8px;">Com esta conquista, o usuário pode reordenar também conquistas fixas no perfil.</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #38BDF8; font-weight: 600;">
                            <input type="checkbox" id="editRankCanUseAnimatedProfile" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#38BDF8;" ${canUseAnimatedProfileEnabled ? 'checked' : ''}>
                            <span>Permitir usuário ter Card Animado</span>
                        </label>
                        <small style="color: rgba(56, 189, 248, 0.85); display: block; margin-top: 8px;">Mostra o botão "Perfil Animado" no perfil do usuário.</small>
                    </div>

                    <div style="margin: 20px 0; padding: 15px; background: rgba(244, 114, 182, 0.1); border: 1px solid rgba(244, 114, 182, 0.45); border-radius: 5px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #F472B6; font-weight: 600;">
                            <input type="checkbox" id="editRankCanChangeOwnColor" class="rank-themed-checkbox edit-rank-option-checkbox" style="--option-accent:#F472B6;" ${canChangeOwnColorEnabled ? 'checked' : ''}>
                            <span>Permitir usuário mudar cor desta conquista</span>
                        </label>
                        <small style="color: rgba(244, 114, 182, 0.85); display: block; margin-top: 8px;">Só afeta este card quando o usuário também tiver permissão individual.</small>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button type="submit" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #EC4899 0%, #6B46C1 100%); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600;">Salvar</button>
                        <button type="button" id="closeEditModal" style="flex: 1; padding: 10px; background: rgba(255,0,0,0.2); color: white; border: 1px solid red; border-radius: 5px; cursor: pointer; font-weight: 600;">Cancelar</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        const closeBtn = document.getElementById('closeEditModal');
        const form = document.getElementById('editRankForm');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const name = document.getElementById('editRankName').value.trim();
                const color = document.getElementById('editRankColor').value;
                const description = document.getElementById('editRankDescription').value.trim();
                const customText = document.getElementById('editRankCustomText').value.trim();
                const backgroundImageUrl = document.getElementById('editRankBackgroundImage').value.trim();
                const backgroundImageFile = document.getElementById('editRankBackgroundImageFile').files[0];
                const enableAdminPanel = document.getElementById('editRankEnableAdminPanel').checked;
                const isVisible = document.getElementById('editRankIsVisible').checked;
                const canManageDownloads = document.getElementById('editRankCanManageDownloads').checked;
                const canOrderAllRanks = document.getElementById('editRankCanOrderAllRanks')?.checked || false;
                const canUseAnimatedProfile = document.getElementById('editRankCanUseAnimatedProfile')?.checked || false;
                const canChangeOwnColor = document.getElementById('editRankCanChangeOwnColor')?.checked || false;

                if (!name || !color || !description) {
                    showMessage('Preencha todos os campos obrigatorios', 'error');
                    return;
                }

                try {
                    const resolvedBackgroundImageUrl = await resolveImageUrlFromInputs(backgroundImageUrl, backgroundImageFile);
                    const result = await AuthAPI.updateCustomRank(
                        rankId,
                        name,
                        color,
                        description,
                        customText,
                        resolvedBackgroundImageUrl,
                        enableAdminPanel,
                        isVisible,
                        canManageDownloads,
                        canOrderAllRanks,
                        canUseAnimatedProfile,
                        canChangeOwnColor
                    );

                    if (result.success) {
                        showMessage('conquista atualizado com sucesso!', 'success');
                        modal.remove();
                        loadCustomRanks();
                    } else {
                        showMessage('Erro: ' + result.message, 'error');
                    }
                } catch (error) {
                    showMessage('Erro ao atualizar conquista: ' + error.message, 'error');
                }
            });
        }
    } catch (error) {
        showMessage('Erro ao carregar dados do conquista: ' + error.message, 'error');
    }
}

// ===================== Usuários E SEUS CONQUISTAS =====================
async function loadUsers() {
    const container = document.getElementById('usersContainer');
    try {
        const result = await AuthAPI.getAdminUsers();
        canRevealEmails = result?.canManageSensitiveAccounts === true;

        if (!result?.success) {
            cachedUsers = [];
            filteredUsers = [];
            currentUsersPage = 1;
            container.innerHTML = `<p style="color: #FCA5A5;">Não foi possível carregar usuários: ${escapeHtmlAdmin(result?.message || 'Erro desconhecido')}</p>`;
            return;
        }

        if (!Array.isArray(result.users)) {
            cachedUsers = [];
            filteredUsers = [];
            currentUsersPage = 1;
            container.innerHTML = '<p style="color: #FCA5A5;">Não foi possível carregar usuários: resposta inválida do servidor.</p>';
            return;
        }

        if (result.users.length === 0) {
            cachedUsers = [];
            filteredUsers = [];
            currentUsersPage = 1;
            container.innerHTML = '<p>Nenhum usuário encontrado</p>';
            return;
        }

        const visibleUsers = result.users.filter((user) => !isExampleEmail(user));
        cachedUsers = visibleUsers;
        applyUsersSearch();
        currentUsersPage = 1;

        if (cachedUsers.length === 0) {
            container.innerHTML = '<p>Nenhum usuário encontrado</p>';
            return;
        }

        renderUsersPage(container);
    } catch (error) {
        cachedUsers = [];
        filteredUsers = [];
        currentUsersPage = 1;
        container.innerHTML = '<p style="color: red;">Erro ao carregar usuários: ' + error.message + '</p>';
    }
}

function initSendmailRichEditor() {
    const toolbar = document.querySelector('.rich-editor-toolbar[data-editor-target="sendmailMessage"]');
    const editor = document.getElementById('sendmailMessage');
    const imageInput = document.getElementById('sendmailImageUploadInput');

    if (!toolbar || !editor || !imageInput) return;

    if (toolbar.dataset.bound === '1') return;
    toolbar.dataset.bound = '1';

    toolbar.addEventListener('click', (event) => {
        const commandBtn = event.target.closest('button[data-cmd], button[data-insert-link], button[data-insert-image]');
        if (!commandBtn) return;

        if (commandBtn.hasAttribute('data-cmd')) {
            document.execCommand(commandBtn.getAttribute('data-cmd'), false, null);
        } else if (commandBtn.hasAttribute('data-insert-link')) {
            const url = prompt('Insira o URL do link (inclua http:// ou https://):');
            if (url) document.execCommand('createLink', false, url.trim());
        } else if (commandBtn.hasAttribute('data-insert-image')) {
            imageInput.click();
        }

        editor.focus();
    });

    imageInput.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file || !file.type.startsWith('image/')) {
            imageInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            const base64 = loadEvent.target?.result;
            if (base64) {
                document.execCommand('insertHTML', false, `<img src="${base64}" alt="Imagem" style="max-width:100%;height:auto;border-radius:8px;margin:10px 0;">`);
            }
            imageInput.value = '';
            editor.focus();
        };
        reader.readAsDataURL(file);
    });
}

async function loadSendmailTab() {
    initSendmailRichEditor();

    const container = document.getElementById('sendmail-tab');
    if (!container) return;

    try {
        const result = await AuthAPI.getAdminUsers();
        if (!result?.success || !Array.isArray(result.users)) {
            container.innerHTML = `<p style="color:#FCA5A5;">Não foi possível carregar usuários: ${escapeHtmlAdmin(result?.message || 'Erro desconhecido')}</p>`;
            return;
        }

        const users = (result.users || []).filter((user) => !isExampleEmail(user));
        cachedUsers = users;
        renderSendmailUserOptions(users);
        renderEmailChangeRequestCards(users);
        updateSendmailSelectedUserInfo();
    } catch (error) {
        container.innerHTML = `<p style="color:#FCA5A5;">Erro ao carregar Sendmail: ${escapeHtmlAdmin(error.message)}</p>`;
    }
}

function renderSendmailUserOptions(users = []) {
    const selectEl = document.getElementById('sendmailUserSelect');
    if (!selectEl) return;

    const options = [
        '<option value="">Selecione um usuário...</option>',
        ...(users || []).map((user) => {
            const status = user.emailVerified ? 'Verificado' : 'Inválido';
            const label = `${String(user.nickname || '').trim() || `ID ${user.id}`} — ${String(user.email || '').trim()} [${status}]`;
            return `<option value="${escapeHtmlAdmin(String(user.id))}">${escapeHtmlAdmin(label)}</option>`;
        })
    ];

    selectEl.innerHTML = options.join('');
}

function getSelectedSendmailUserId() {
    return String(document.getElementById('sendmailUserSelect')?.value || '').trim();
}

function renderEmailChangeRequestCards(users = []) {
    const container = document.getElementById('emailChangeRequestsContainer');
    if (!container) return;

    const pending = (users || []).filter((user) => String(user.pendingEmailChangeRequest || '').trim());
    if (!pending.length) {
        container.innerHTML = '<p style="color:#FDE68A;">Nenhum pedido pendente de troca de e-mail no momento.</p>';
        return;
    }

    container.innerHTML = pending.map((user) => `
        <article style="display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid rgba(244,114,182,0.35); border-radius:10px; background:rgba(15,23,42,0.82); color:#FDF2F8; margin-bottom:10px;">
            <div><strong>${escapeHtmlAdmin(String(user.nickname || '').trim() || `ID ${user.id}`)}</strong> — ${escapeHtmlAdmin(String(user.email || '').trim())}</div>
            <div style="color:#FDE68A; font-size:12px;">Novo e-mail solicitado: <strong>${escapeHtmlAdmin(String(user.pendingEmailChangeRequest || ''))}</strong></div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="approve-email-change-btn" data-user-id="${user.id}" data-email="${escapeHtmlAdmin(String(user.pendingEmailChangeRequest || ''))}" style="padding:8px 10px; border:none; border-radius:6px; background:linear-gradient(135deg,#10B981,#059669); color:white; cursor:pointer; font-weight:600;">Aprovar</button>
                <button type="button" class="cancel-email-change-btn" data-user-id="${user.id}" style="padding:8px 10px; border:none; border-radius:6px; background:linear-gradient(135deg,#F472B6,#EC4899); color:white; cursor:pointer; font-weight:600;">Recusar</button>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('.approve-email-change-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const userId = String(e.currentTarget.dataset.userId || '');
            const newEmail = String(e.currentTarget.dataset.email || '').trim();
            if (!userId || !newEmail) return;

            const result = await AuthAPI.approveEmailChange(userId, newEmail);
            if (result.success) {
                showMessage('E-mail aprovado com sucesso.', 'success');
                await loadSendmailTab();
                loadUsers();
            } else {
                showMessage(result.message || 'Não foi possível aprovar o e-mail.', 'error');
            }
        });
    });

    container.querySelectorAll('.cancel-email-change-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const userId = String(e.currentTarget.dataset.userId || '');
            if (!userId) return;

            const result = await AuthAPI.cancelEmailChangeRequest(userId);
            if (result.success) {
                showMessage('Pedido cancelado com sucesso.', 'success');
                await loadSendmailTab();
                loadUsers();
            } else {
                showMessage(result.message || 'Não foi possível cancelar o pedido.', 'error');
            }
        });
    });
}

function updateSendmailSelectedUserInfo() {
    const userId = getSelectedSendmailUserId();
    const infoEl = document.getElementById('sendmailSelectedUserInfo');
    if (!infoEl) return;

    if (!userId) {
        infoEl.innerHTML = 'Selecione um usuário para ver os detalhes de e-mail aqui.';
        return;
    }

    const user = cachedUsers.find((item) => String(item.id) === userId);
    if (!user) {
        infoEl.innerHTML = 'Usuário selecionado não encontrado.';
        return;
    }

    const email = String(user.email || '').trim();
    const status = user.emailVerified ? 'Verificado' : 'Inválido';
    infoEl.innerHTML = `
        <div><strong>Nome:</strong> ${escapeHtmlAdmin(`${user.firstName || ''} ${user.lastName || ''}`.trim() || user.nickname || `ID ${user.id}`)}</div>
        <div><strong>Nickname:</strong> ${escapeHtmlAdmin(user.nickname || '')}</div>
        <div><strong>E-mail:</strong> ${escapeHtmlAdmin(email)}</div>
        <div><strong>Status:</strong> ${escapeHtmlAdmin(status)}</div>
        <div><strong>Criado em:</strong> ${escapeHtmlAdmin(String(user.createdAt || 'N/A'))}</div>
    `;
}

function getSendmailFormValues() {
    const editor = document.getElementById('sendmailMessage');
    const attachmentsInput = document.getElementById('sendmailAttachmentFiles');

    return {
        subject: String(document.getElementById('sendmailSubject')?.value || '').trim(),
        message: String(editor?.innerHTML || '').trim(),
        mediaUrl: String(document.getElementById('sendmailMediaUrl')?.value || '').trim(),
        mediaType: String(document.getElementById('sendmailMediaType')?.value || '').trim().toLowerCase(),
        attachments: Array.from(attachmentsInput?.files || [])
    };
}

async function markSelectedUserEmailStatus(emailVerified) {
    const userId = getSelectedSendmailUserId();
    if (!userId) {
        showMessage('Selecione um usuário primeiro.', 'error');
        return;
    }

    try {
        const result = await AuthAPI.updateUserEmailStatus(userId, emailVerified);
        if (result.success) {
            showMessage(result.message || 'Status de e-mail atualizado com sucesso.', 'success');
            await loadSendmailTab();
            loadUsers();
        } else {
            showMessage('Erro: ' + (result.message || 'Falha ao atualizar status'), 'error');
        }
    } catch (error) {
        showMessage('Erro ao atualizar status: ' + error.message, 'error');
    }
}

async function sendEmailToSelectedUser() {
    const userId = getSelectedSendmailUserId();
    if (!userId) {
        showMessage('Selecione um usuário primeiro.', 'error');
        return;
    }

    const { subject, message, mediaUrl, mediaType, attachments } = getSendmailFormValues();
    if (!subject || !message || message === '<br>' || message === '') {
        showMessage('Preencha o assunto e a mensagem.', 'error');
        return;
    }

    try {
        const result = await AuthAPI.sendAdminEmail(userId, subject, message, mediaUrl, mediaType, attachments);
        if (result.success) {
            showMessage(result.message || 'Email enviado para o usuário.', 'success');
        } else {
            showMessage('Erro: ' + (result.message || 'Falha ao enviar email'), 'error');
        }
    } catch (error) {
        showMessage('Erro ao enviar email: ' + error.message, 'error');
    }
}

async function sendEmailToAllUsers() {
    const { subject, message, mediaUrl, mediaType, attachments } = getSendmailFormValues();
    if (!subject || !message || message === '<br>' || message === '') {
        showMessage('Preencha o assunto e a mensagem.', 'error');
        return;
    }

    try {
        const result = await AuthAPI.sendAdminEmailToAll(subject, message, mediaUrl, mediaType, attachments);
        if (result.success) {
            showMessage(result.message || 'Email enviado para todos os usuários.', 'success');
        } else {
            showMessage('Erro: ' + (result.message || 'Falha ao enviar emails em massa'), 'error');
        }
    } catch (error) {
        showMessage('Erro ao enviar email para todos: ' + error.message, 'error');
    }
}

async function loadStaffHierarchy() {
    const container = document.getElementById('staffHierarchyContainer');
    if (!container) return;

    try {
        const result = await AuthAPI.getStaffHierarchy();
        if (!result?.success) {
            throw new Error(result?.message || 'Não foi possível carregar a hierarquia.');
        }

        staffHierarchyCache = Array.isArray(result.ranks) ? result.ranks : [];
        renderStaffHierarchy(container, staffHierarchyCache, {
            canEditAll: result?.canEditAll === true,
            requesterLevel: Number(result?.requesterLevel || 0)
        });
    } catch (error) {
        container.innerHTML = `<p style="color:#FCA5A5;">Erro ao carregar hierarquia: ${escapeHtmlAdmin(error.message || 'Erro desconhecido')}</p>`;
    }
}

let staffHierarchySearchDebounceTimeout = null;

function renderStaffHierarchy(container, ranks = [], options = {}) {
    if (!container) return;
    const canEditAll = options?.canEditAll === true;
    const requesterLevel = Number(options?.requesterLevel || 0);
    const searchTerm = String(options?.searchTerm || '').trim();
    const normalizedSearchTerm = normalizeUsersSearchValue(searchTerm);

    if (!Array.isArray(ranks) || ranks.length === 0) {
        container.innerHTML = '<p>Nenhum cargo customizado encontrado.</p>';
        return;
    }

    const orderedRanks = [...ranks].sort((a, b) => {
        const protectedDiff = Number(Boolean(a?.isSystemHierarchyProtected)) - Number(Boolean(b?.isSystemHierarchyProtected));
        if (protectedDiff !== 0) return protectedDiff;

        const staffDiff = Number(Boolean(b?.isStaffRole)) - Number(Boolean(a?.isStaffRole));
        if (staffDiff !== 0) return staffDiff;

        const levelDiff = Number(b?.hierarchyLevel || 0) - Number(a?.hierarchyLevel || 0);
        if (levelDiff !== 0) return levelDiff;

        return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' });
    });
    const filteredRanks = orderedRanks.filter((rank) => {
        if (!normalizedSearchTerm) return true;
        const searchIndex = normalizeUsersSearchValue(`${rank?.name || ''} ${rank?.description || ''}`);
        return searchIndex.includes(normalizedSearchTerm);
    });

    const canEditSomeCards = canEditAll || requesterLevel > 0;
    const introMessage = canEditAll
        ? ''
        : canEditSomeCards
            ? '<p style="margin:0 0 14px 0; color:rgba(226,232,240,0.8); font-size:13px; font-weight:600;">Você pode editar somente cargos abaixo do seu nível hierárquico. A permissão de visualizar esta aba continua exclusiva do dono para concessão.</p>'
            : '<p style="margin:0 0 14px 0; color:rgba(226,232,240,0.8); font-size:13px; font-weight:600;">Modo leitura: você pode visualizar a hierarquia, mas não possui nível para editar cargos.</p>';

    // Criar toolbar apenas uma vez
    let toolbarContainer = container.querySelector('.staff-hierarchy-toolbar');
    if (!toolbarContainer) {
        container.innerHTML = introMessage;
        
        toolbarContainer = document.createElement('div');
        toolbarContainer.className = 'staff-hierarchy-toolbar';
        container.appendChild(toolbarContainer);

        const gridContainer = document.createElement('div');
        gridContainer.className = 'staff-hierarchy-grid';
        container.appendChild(gridContainer);

        const searchInputEl = document.createElement('input');
        searchInputEl.id = 'staffHierarchySearchInput';
        searchInputEl.className = 'staff-hierarchy-search-input';
        searchInputEl.type = 'text';
        searchInputEl.placeholder = 'Buscar por nome ou descrição...';
        searchInputEl.autocomplete = 'off';
        searchInputEl.spellcheck = 'false';

        const label = document.createElement('label');
        label.className = 'staff-hierarchy-search-wrap';
        label.htmlFor = 'staffHierarchySearchInput';
        label.appendChild(searchInputEl);

        const toolbarCopy = document.createElement('div');
        toolbarCopy.className = 'staff-hierarchy-toolbar-copy';
        toolbarCopy.innerHTML = '<strong>Buscar conquista</strong><span id="staff-hierarchy-results-count">0 resultado(s) encontrado(s)</span>';

        toolbarContainer.appendChild(toolbarCopy);
        toolbarContainer.appendChild(label);

        searchInputEl.addEventListener('input', () => {
            if (staffHierarchySearchDebounceTimeout) {
                clearTimeout(staffHierarchySearchDebounceTimeout);
            }
            staffHierarchySearchDebounceTimeout = setTimeout(() => {
                renderStaffHierarchy(container, staffHierarchyCache, {
                    canEditAll,
                    requesterLevel,
                    searchTerm: searchInputEl.value
                });
            }, 300);
        });
    }

    // Atualizar apenas grid e contador
    const gridContainer = container.querySelector('.staff-hierarchy-grid');
    const resultCountSpan = container.querySelector('#staff-hierarchy-results-count');
    
    if (resultCountSpan) {
        resultCountSpan.textContent = `${filteredRanks.length} resultado(s) encontrado(s)`;
    }
    
    if (gridContainer) {
        gridContainer.innerHTML = `
            ${filteredRanks.length === 0 ? `
                <div class="staff-hierarchy-empty-state">
                    Nenhuma conquista encontrada com esse termo.
                </div>
            ` : filteredRanks.map((rank) => {
                const rankId = Number(rank?.id || 0);
                const name = escapeHtmlAdmin(String(rank?.name || 'Cargo'));
                const description = escapeHtmlAdmin(String(rank?.description || 'Sem descrição.'));
                const level = Number(rank?.hierarchyLevel || 0);
                const assignedUsers = Number(rank?.assignedUsers || 0);
                const badgeLabel = level > 0 ? `Nível ${level}` : 'Sem nível';
                const color = String(rank?.color || '#EC4899').trim();
                const isSystemProtected = rank?.isSystemHierarchyProtected === true;
                const canEditByLevel = canEditAll || requesterLevel > level;
                const canEditCard = canEditAll || (!isSystemProtected && canEditByLevel);
                const readOnlyLabel = isSystemProtected && !adminIsOwnerAccount
                    ? 'Somente fundador'
                    : 'Somente leitura';

                return `
                    <div class="staff-hierarchy-card" data-rank-id="${rankId}">
                        <div class="staff-hierarchy-card-header">
                            <div>
                                <h3 class="staff-hierarchy-card-title" style="color:${escapeHtmlAdmin(color)};">${name}</h3>
                                <p class="staff-hierarchy-card-desc">${description}</p>
                            </div>
                            <span class="staff-hierarchy-level-badge">${escapeHtmlAdmin(badgeLabel)}</span>
                        </div>
                        <div class="staff-hierarchy-tab-permissions">
                            <strong>Abas disponíveis para este cargo</strong>
                            ${adminIsOwnerAccount ? '' : '<span class="staff-hierarchy-tab-readonly">Somente o owner pode alterar estas permissões.</span>'}
                            <div>
                                ${ADMIN_PANEL_TAB_OPTIONS.map(({ key, field, label }) => {
                                    const enabled = rank?.adminPanelTabs?.[key] ?? rank?.[field];
                                    return `
                                        <label class="staff-hierarchy-check">
                                            <input type="checkbox" class="staff-hierarchy-tab-toggle" data-rank-id="${rankId}" data-tab-key="${key}" ${enabled ? 'checked' : ''} ${adminIsOwnerAccount ? '' : 'disabled'}>
                                            <span>${label}</span>
                                        </label>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        <div class="staff-hierarchy-meta">
                            <span>${assignedUsers} membro(s)</span>
                            <span>${rank?.isStaffRole ? 'Cargo de staff' : 'Cargo comum'}</span>
                            <span>${rank?.enableAdminPanel ? 'Acesso ao painel' : 'Sem painel'}</span>
                        </div>
                        <div class="staff-hierarchy-form">
                            <div class="staff-hierarchy-inline">
                                <div class="staff-hierarchy-field">
                                    <label for="staffHierarchyLevel-${rankId}">Nível hierárquico</label>
                                    <input type="number" id="staffHierarchyLevel-${rankId}" min="0" step="1" value="${level}" ${canEditCard ? '' : 'disabled'}>
                                </div>
                                <div class="staff-hierarchy-field">
                                    <label>&nbsp;</label>
                                    ${canEditCard ? `<button type="button" class="staff-hierarchy-save-btn" data-rank-id="${rankId}">Salvar</button>` : `<span style="opacity:.7;font-size:12px;font-weight:700;">${readOnlyLabel}</span>`}
                                </div>
                            </div>
                            <label class="staff-hierarchy-check">
                                <input type="checkbox" class="staff-hierarchy-staff-toggle" data-rank-id="${rankId}" ${rank?.isStaffRole ? 'checked' : ''} ${canEditCard ? '' : 'disabled'}>
                                <span>Tratar este cargo como staff</span>
                            </label>
                            <label class="staff-hierarchy-check">
                                <input type="checkbox" class="staff-hierarchy-admin-toggle" data-rank-id="${rankId}" ${rank?.enableAdminPanel ? 'checked' : ''} ${canEditCard ? '' : 'disabled'}>
                                <span>Dar acesso ao painel admin por este cargo</span>
                            </label>
                            ${adminIsOwnerAccount ? `
                            <label class="staff-hierarchy-check">
                                <input type="checkbox" class="staff-hierarchy-members-toggle" data-rank-id="${rankId}" ${rank?.canViewMembersPage ? 'checked' : ''}>
                                <span>Permitir visualizar a aba Membros</span>
                            </label>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        `;
    }

    // Adicionar event listeners aos botões salvos
    container.querySelectorAll('.staff-hierarchy-save-btn').forEach((buttonEl) => {
        buttonEl.addEventListener('click', async () => {
            const rankId = Number(buttonEl.dataset.rankId || 0);
            const cardEl = buttonEl.closest('.staff-hierarchy-card');
            if (!rankId || !cardEl) return;

            const levelInput = cardEl.querySelector(`#staffHierarchyLevel-${rankId}`);
            const isStaffRole = Boolean(cardEl.querySelector('.staff-hierarchy-staff-toggle')?.checked);
            const enableAdminPanel = Boolean(cardEl.querySelector('.staff-hierarchy-admin-toggle')?.checked);
            const canViewMembersPage = Boolean(cardEl.querySelector('.staff-hierarchy-members-toggle')?.checked);
            const adminPanelTabs = Object.fromEntries(
                ADMIN_PANEL_TAB_OPTIONS.map(({ key }) => [
                    key,
                    Boolean(cardEl.querySelector(`.staff-hierarchy-tab-toggle[data-tab-key="${key}"]`)?.checked)
                ])
            );
            const hierarchyLevel = Math.max(0, Number.parseInt(levelInput?.value, 10) || 0);

            buttonEl.disabled = true;
            const originalText = buttonEl.textContent;
            buttonEl.textContent = 'Salvando...';

            try {
                const result = await AuthAPI.updateStaffHierarchy(rankId, {
                    isStaffRole,
                    hierarchyLevel,
                    enableAdminPanel,
                    canViewStaffHierarchy: adminPanelTabs.staffHierarchy,
                    canViewMembersPage,
                    adminPanelTabs
                });

                if (!result?.success) {
                    throw new Error(result?.message || 'Não foi possível salvar este cargo.');
                }

                showMessage(result.message || 'Hierarquia atualizada com sucesso!', 'success');
                loadedTabs.delete('staff-hierarchy');
                await loadStaffHierarchy();
            } catch (error) {
                showMessage(error.message || 'Erro ao salvar hierarquia.', 'error');
            } finally {
                buttonEl.disabled = false;
                buttonEl.textContent = originalText;
            }
        });
    });
}

function normalizeUsersSearchValue(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function buildUserSearchIndex(user) {
    const firstName = String(user?.firstName || '').trim();
    const lastName = String(user?.lastName || '').trim();
    const nickname = String(user?.nickname || '').trim();
    const email = String(user?.email || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    return normalizeUsersSearchValue(`${fullName} ${nickname} ${email}`);
}

function applyUsersSearch() {
    const normalizedTerm = normalizeUsersSearchValue(currentUsersSearchTerm);
    filteredUsers = !normalizedTerm
        ? [...cachedUsers]
        : cachedUsers.filter((user) => buildUserSearchIndex(user).includes(normalizedTerm));
}

function renderUsersPage(container) {
    const totalUsers = filteredUsers.length;
    const hasSearchTerm = Boolean(String(currentUsersSearchTerm || '').trim());

    if (!cachedUsers.length) {
        container.innerHTML = '<p>Nenhum usuário encontrado</p>';
        return;
    }

    const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
    currentUsersPage = Math.min(Math.max(1, currentUsersPage), totalPages);

    const start = (currentUsersPage - 1) * USERS_PER_PAGE;
    const end = start + USERS_PER_PAGE;
    const users = filteredUsers.slice(start, end);

    renderUsersList(container, users, {
        totalUsers,
        hasSearchTerm
    });

    if (totalPages <= 1 || totalUsers === 0) return;

    const controls = document.createElement('div');
    controls.className = 'users-pagination';
    controls.innerHTML = `
        <button type="button" class="users-page-btn" data-move="prev" ${currentUsersPage === 1 ? 'disabled' : ''}>Anterior</button>
        <span class="users-page-label">Página ${currentUsersPage} de ${totalPages}</span>
        <button type="button" class="users-page-btn" data-move="next" ${currentUsersPage === totalPages ? 'disabled' : ''}>Pr\u00f3xima</button>
    `;

    controls.querySelectorAll('.users-page-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const move = btn.getAttribute('data-move');
            if (move === 'prev' && currentUsersPage > 1) {
                currentUsersPage -= 1;
                renderUsersPage(container);
                return;
            }
            if (move === 'next' && currentUsersPage < totalPages) {
                currentUsersPage += 1;
                renderUsersPage(container);
            }
        });
    });

    container.appendChild(controls);
}

function renderUsersList(container, users, options = {}) {
    rawEmailByUserId.clear();
    userLabelByUserId.clear();
    const totalUsers = Number(options?.totalUsers || 0);
    const hasSearchTerm = options?.hasSearchTerm === true;

    // Procurar ou criar o container de toolbar
    let toolbarContainer = container.querySelector('.users-toolbar-container');
    if (!toolbarContainer) {
        toolbarContainer = document.createElement('div');
        toolbarContainer.className = 'users-toolbar-container';
        toolbarContainer.innerHTML = `
            <div class="users-toolbar">
                <div class="users-toolbar-copy">
                    <strong>Buscar usuário</strong>
                    <span id="usersResultCount">${totalUsers} resultado${totalUsers === 1 ? '' : 's'}${hasSearchTerm ? ' encontrado(s)' : ' no total'}</span>
                </div>
                <label class="users-search-field" for="usersSearchInput">
                    <input
                        type="search"
                        id="usersSearchInput"
                        placeholder="Buscar por nome, nick ou e-mail..."
                        value="${escapeHtmlAdmin(currentUsersSearchTerm)}"
                        autocomplete="off"
                        spellcheck="false"
                    >
                </label>
            </div>
        `;
        container.insertBefore(toolbarContainer, container.firstChild);
        
        const searchInput = toolbarContainer.querySelector('#usersSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (event) => {
                const inputEl = event.currentTarget;
                const nextValue = String(inputEl.value || '');
                currentUsersSearchTerm = nextValue;

                if (usersSearchDebounceTimeout) {
                    clearTimeout(usersSearchDebounceTimeout);
                }

                usersSearchDebounceTimeout = setTimeout(() => {
                    currentUsersPage = 1;
                    applyUsersSearch();
                    
                    const totalUsers = filteredUsers.length;
                    const hasSearchTerm = Boolean(String(currentUsersSearchTerm || '').trim());
                    const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PER_PAGE));
                    currentUsersPage = Math.min(Math.max(1, currentUsersPage), totalPages);

                    const start = (currentUsersPage - 1) * USERS_PER_PAGE;
                    const end = start + USERS_PER_PAGE;
                    const users = filteredUsers.slice(start, end);

                    // Atualizar apenas a contagem
                    const resultCountEl = toolbarContainer.querySelector('#usersResultCount');
                    if (resultCountEl) {
                        resultCountEl.textContent = `${totalUsers} resultado${totalUsers === 1 ? '' : 's'}${hasSearchTerm ? ' encontrado(s)' : ' no total'}`;
                    }

                    // Atualizar tabela e paginação
                    renderUsersTableAndPagination(container, users, totalPages, totalUsers);
                    usersSearchDebounceTimeout = null;
                }, 400);
            });
        }
    } else {
        // Atualizar apenas a contagem se toolbar já existe
        const resultCountEl = toolbarContainer.querySelector('#usersResultCount');
        if (resultCountEl) {
            resultCountEl.textContent = `${totalUsers} resultado${totalUsers === 1 ? '' : 's'}${hasSearchTerm ? ' encontrado(s)' : ' no total'}`;
        }
    }

    // Renderizar tabela (sem toolbar)
    renderUsersTableAndPagination(container, users, 1, totalUsers);
}

function renderUsersTableAndPagination(container, users, totalPages, totalUsers) {
    // Atualizar ou criar a tabela
    let tableWrapEl = container.querySelector('.users-table-wrap');
    if (!tableWrapEl) {
        let html = `
            <div class="users-table-wrap">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Nickname</th>
                            <th>E-mail</th>
                            <th>Conquistas Separadas</th>
                            <th>Ordenar Todos</th>
                            ${adminIsOwnerAccount ? '<th>Título Customizado</th>' : ''}
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        container.appendChild(tempDiv.firstElementChild);
        tableWrapEl = container.querySelector('.users-table-wrap');
    }

    // Atualizar apenas o tbody
    const tbody = tableWrapEl.querySelector('tbody');
    if (!tbody) return;

    let bodyHtml = '';
    users.forEach(user => {
        const userId = String(user.id);
        const rawEmail = String(user.email || '').trim();
        const isOwnerAccount = Boolean(user.isOwnerAccount) || rawEmail.toLowerCase() === OWNER_EMAIL_VIEWER;
        const displayName = `${user.firstName} ${user.lastName}`.trim();
        userLabelByUserId.set(userId, displayName || user.nickname || `ID ${userId}`);

        if (canRevealEmails) {
            rawEmailByUserId.set(userId, rawEmail);
        }

        const emailCell = canRevealEmails
            ? `
                <div class="email-reveal-wrap">
                    <span id="emailText-${userId}" data-visible="false">${maskEmail(rawEmail)}</span>
                    <button type="button" class="toggle-email-btn" data-user-id="${userId}">Mostrar</button>
                </div>
            `
            : rawEmail;

        const removeAvatarAction = !isOwnerAccount
            ? `<button class="remove-avatar-btn" data-user-id="${user.id}">Remover foto</button>`
            : '';
        const removeAnimatedBackgroundAction = !isOwnerAccount
            ? `<button class="remove-animated-background-btn" data-user-id="${user.id}">Remover fundo animado</button>`
            : '';
        const sendTicketAction = `<button class="send-ticket-btn" data-user-id="${user.id}">Enviar chamado</button>`;
        const pendingEmailChangeAction = user.pendingEmailChangeRequest
            ? `<div class="email-change-request-chip" style="margin-top:6px; padding:6px 8px; border-radius:6px; background: rgba(251,191,36,0.12); border: 1px solid rgba(251,191,36,0.35); color:#FDE68A; font-size:11px;">Pedido: ${escapeHtmlAdmin(user.pendingEmailChangeRequest)}<br><button type="button" class="approve-email-change-btn" data-user-id="${user.id}" data-email="${escapeHtmlAdmin(user.pendingEmailChangeRequest)}" style="margin-top:6px;">Aprovar</button> <button type="button" class="cancel-email-change-btn" data-user-id="${user.id}" style="margin-top:6px;">Cancelar</button></div>`
            : '';
        const deleteAction = canRevealEmails && !isOwnerAccount
            ? `<button class="delete-account-btn" data-user-id="${user.id}">Excluir conta</button>`
            : '';

        bodyHtml += `
            <tr>
                <td>${user.firstName} ${user.lastName}</td>
                <td><strong>${user.nickname}</strong></td>
                <td>${emailCell}</td>
                <td id="ranks-${user.id}"><span class="loading">Carregando...</span></td>
                <td>
                    <span class="user-order-permission" style="color:${user.canOrderFixedRanks ? '#10B981' : '#999'};">
                        ${user.canOrderFixedRanks ? 'Permitido' : 'Bloqueado'}
                    </span>
                </td>
                ${adminIsOwnerAccount ? `
                <td>
                    <div class="custom-title-editor" style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; gap: 6px; align-items: flex-end;">
                            <input type="text" class="custom-title-input" id="customTitle-${user.id}" placeholder="Título" maxlength="100" value="${escapeHtmlAdmin(user.customTitle || '')}" style="flex: 1; padding: 6px; background: rgba(0,0,0,0.3); border: 1px solid #F472B6; color: #F472B6; border-radius: 3px; font-size: 12px;">
                        </div>
                        <div style="display: flex; gap: 6px; align-items: flex-end;">
                            <input type="text" class="custom-title-subtitle-input" id="customTitleSubtitle-${user.id}" placeholder="Subtítulo (aparece ao passar mouse)" maxlength="100" value="${escapeHtmlAdmin(user.customTitleSubtitle || '')}" style="flex: 1; padding: 6px; background: rgba(0,0,0,0.3); border: 1px solid #38BDF8; color: #38BDF8; border-radius: 3px; font-size: 11px;">
                            <button type="button" class="save-custom-title-btn" data-user-id="${user.id}" style="padding: 6px 10px; background: linear-gradient(135deg, #F472B6 0%, #EC4899 100%); color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: 600; font-size: 11px; white-space: nowrap;">Salvar</button>
                        </div>
                    </div>
                </td>
                ` : ''}
                <td>
                    <div class="user-actions-stack">
                        <div class="rank-select">
                            <div class="rank-select-themed" data-select-id="rankSelect-${user.id}">
                                <button type="button" class="rank-select-themed-trigger" data-select-id="rankSelect-${user.id}">
                                    Selecionar conquista
                                </button>
                                <div class="rank-select-themed-menu" data-select-id="rankSelect-${user.id}" hidden></div>
                            </div>
                            <select id="rankSelect-${user.id}" class="rank-select-native" aria-hidden="true" tabindex="-1">
                                <option value="">Selecionar conquista</option>
                            </select>
                            <button class="add-rank-btn" data-user-id="${user.id}">Adicionar conquista</button>
                        </div>
                        <div class="user-inline-actions">
                            ${removeAvatarAction}
                            ${removeAnimatedBackgroundAction}
                            ${sendTicketAction}
                            ${deleteAction}
                            ${pendingEmailChangeAction}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    // Atualizar tbody sem remover/recriar
    tbody.innerHTML = bodyHtml;

    // Paginação
    let paginationEl = container.querySelector('.users-pagination');
    if (paginationEl) {
        paginationEl.remove();
    }

    let isOnlyOnePage = totalPages <= 1 || totalUsers === 0;
    if (!isOnlyOnePage) {
        const controls = document.createElement('div');
        controls.className = 'users-pagination';
        controls.innerHTML = `
            <button type="button" class="users-page-btn" data-move="prev" ${currentUsersPage === 1 ? 'disabled' : ''}>Anterior</button>
            <span class="users-page-label">Página ${currentUsersPage} de ${totalPages}</span>
            <button type="button" class="users-page-btn" data-move="next" ${currentUsersPage === totalPages ? 'disabled' : ''}>Próxima</button>
        `;

        controls.querySelectorAll('.users-page-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const move = btn.getAttribute('data-move');
                if (move === 'prev' && currentUsersPage > 1) {
                    currentUsersPage -= 1;
                    const start = (currentUsersPage - 1) * USERS_PER_PAGE;
                    const end = start + USERS_PER_PAGE;
                    const pagedUsers = filteredUsers.slice(start, end);
                    renderUsersTableAndPagination(container, pagedUsers, totalPages, totalUsers);
                    return;
                }
                if (move === 'next' && currentUsersPage < totalPages) {
                    currentUsersPage += 1;
                    const start = (currentUsersPage - 1) * USERS_PER_PAGE;
                    const end = start + USERS_PER_PAGE;
                    const pagedUsers = filteredUsers.slice(start, end);
                    renderUsersTableAndPagination(container, pagedUsers, totalPages, totalUsers);
                }
            });
        });

        container.appendChild(controls);
    }

    if (users.length === 0) {
        const emptyEl = document.createElement('p');
        emptyEl.className = 'users-search-empty';
        emptyEl.textContent = hasSearchTerm
            ? 'Nenhum usuário encontrado com esse termo.'
            : 'Nenhum usuário encontrado.';
        container.appendChild(emptyEl);
        return;
    }

    // CRITICAL: Anexar event listeners SEMPRE, mesmo com 1 página
    container.querySelectorAll('.toggle-email-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = String(e.currentTarget.dataset.userId || '');
            toggleEmailVisibility(userId);
        });
    });

    container.querySelectorAll('.add-rank-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            addUserRank(userId);
        });
    });

    container.querySelectorAll('.delete-account-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            deleteUserAccount(userId);
        });
    });

    container.querySelectorAll('.remove-avatar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            removeUserAvatar(userId);
        });
    });

    container.querySelectorAll('.remove-animated-background-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            removeUserAnimatedBackground(userId);
        });
    });

    container.querySelectorAll('.send-ticket-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.currentTarget.dataset.userId;
            openSendTicketModal(userId);
        });
    });

    container.querySelectorAll('.approve-email-change-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = String(e.currentTarget.dataset.userId || '');
            const newEmail = String(e.currentTarget.dataset.email || '').trim();
            if (!userId || !newEmail) return;

            const result = await AuthAPI.approveEmailChange(userId, newEmail);
            if (result.success) {
                showNotification('E-mail aprovado com sucesso.', 'success');
                renderUsersPage(container);
            } else {
                showNotification(result.message || 'Não foi possível aprovar o e-mail.', 'error');
            }
        });
    });

    container.querySelectorAll('.cancel-email-change-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = String(e.currentTarget.dataset.userId || '');
            if (!userId) return;

            const result = await AuthAPI.cancelEmailChangeRequest(userId);
            if (result.success) {
                showNotification('Pedido cancelado com sucesso.', 'success');
                renderUsersPage(container);
            } else {
                showNotification(result.message || 'Não foi possível cancelar o pedido.', 'error');
            }
        });
    });

    container.querySelectorAll('.save-custom-title-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.currentTarget.dataset.userId;
            const titleInput = document.getElementById(`customTitle-${userId}`);
            const subtitleInput = document.getElementById(`customTitleSubtitle-${userId}`);
            const customTitle = titleInput?.value?.trim() || null;
            const customTitleSubtitle = subtitleInput?.value?.trim() || null;
            await saveUserCustomTitle(userId, customTitle, customTitleSubtitle, btn);
        });
    });

    container.querySelectorAll('.rank-select-native').forEach((selectEl) => {
        initThemedRankSelect(selectEl);
    });

    users.forEach(user => {
        loadUserRanks(user.id);
        loadRankSelectOptions(user.id);
    });
}

function toggleEmailVisibility(userId) {
    if (!canRevealEmails) return;

    const emailTextEl = document.getElementById(`emailText-${userId}`);
    const buttonEl = document.querySelector(`.toggle-email-btn[data-user-id="${userId}"]`);
    const rawEmail = rawEmailByUserId.get(String(userId));

    if (!emailTextEl || !buttonEl || !rawEmail) return;

    const isVisible = emailTextEl.dataset.visible === 'true';
    if (isVisible) {
        emailTextEl.textContent = maskEmail(rawEmail);
        emailTextEl.dataset.visible = 'false';
        buttonEl.textContent = 'Mostrar';
        return;
    }

    emailTextEl.textContent = rawEmail;
    emailTextEl.dataset.visible = 'true';
    buttonEl.textContent = 'Ocultar';
}

function closeThemedRankSelectMenus(exceptSelectId = '') {
    document.querySelectorAll('.rank-select-themed').forEach((wrapperEl) => {
        const selectId = String(wrapperEl.dataset.selectId || '');
        const menuEl = wrapperEl.querySelector('.rank-select-themed-menu');
        if (!menuEl) return;

        const shouldStayOpen = exceptSelectId && selectId === exceptSelectId;
        if (shouldStayOpen) return;

        menuEl.hidden = true;
        wrapperEl.classList.remove('is-open');
    });
}

function ensureThemedRankSelectGlobalHandlers() {
    if (themedRankSelectGlobalHandlersBound) return;

    document.addEventListener('click', (event) => {
        if (event.target.closest('.rank-select-themed')) return;
        closeThemedRankSelectMenus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeThemedRankSelectMenus();
        }
    });

    themedRankSelectGlobalHandlersBound = true;
}

function updateThemedRankSelectDirection(selectEl) {
    if (!selectEl) return;

    const wrapperEl = document.querySelector(`.rank-select-themed[data-select-id="${selectEl.id}"]`);
    if (!wrapperEl) return;

    wrapperEl.classList.remove('open-upward');

    const wrapperRect = wrapperEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    
    const spaceBelowViewport = viewportHeight - wrapperRect.bottom - 6;
    const spaceAboveViewport = wrapperRect.top - 6;

    const minOpenSpace = 320;
    if (spaceBelowViewport < minOpenSpace && spaceAboveViewport > spaceBelowViewport) {
        wrapperEl.classList.add('open-upward');
    }
}

function normalizeThemedSelectSearchValue(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function syncThemedRankSelectLabel(selectEl) {
    if (!selectEl) return;
    const wrapperEl = document.querySelector(`.rank-select-themed[data-select-id="${selectEl.id}"]`);
    if (!wrapperEl) return;

    const triggerEl = wrapperEl.querySelector('.rank-select-themed-trigger');
    if (!triggerEl) return;

    const selectedOption = selectEl.selectedOptions && selectEl.selectedOptions.length > 0
        ? selectEl.selectedOptions[0]
        : selectEl.options[0];

    const label = String(selectedOption?.textContent || 'Selecionar conquista').trim();
    triggerEl.textContent = label || 'Selecionar conquista';
    triggerEl.title = label || 'Selecionar conquista';
}

function syncThemedRankSelectMenu(selectEl) {
    if (!selectEl) return;
    const wrapperEl = document.querySelector(`.rank-select-themed[data-select-id="${selectEl.id}"]`);
    if (!wrapperEl) return;

    const menuEl = wrapperEl.querySelector('.rank-select-themed-menu');
    if (!menuEl) return;

    menuEl.innerHTML = '';
    const options = Array.from(selectEl.options || []).filter((optionEl) => String(optionEl.value || '').trim() !== '');

    if (options.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'rank-select-themed-empty';
        emptyEl.textContent = 'Nenhuma conquista disponível';
        menuEl.appendChild(emptyEl);
        syncThemedRankSelectLabel(selectEl);
        return;
    }

    const searchWrapEl = document.createElement('div');
    searchWrapEl.className = 'rank-select-themed-search-wrap';

    const searchInputEl = document.createElement('input');
    searchInputEl.type = 'text';
    searchInputEl.className = 'rank-select-themed-search';
    searchInputEl.placeholder = 'Buscar por nome ou descrição...';
    searchInputEl.autocomplete = 'off';
    searchInputEl.spellcheck = false;

    const currentSearch = String(wrapperEl.dataset.searchTerm || '');
    searchInputEl.value = currentSearch;
    searchWrapEl.appendChild(searchInputEl);
    menuEl.appendChild(searchWrapEl);

    const listEl = document.createElement('div');
    listEl.className = 'rank-select-themed-list';
    menuEl.appendChild(listEl);

    const emptyEl = document.createElement('div');
    emptyEl.className = 'rank-select-themed-empty';
    emptyEl.hidden = true;

    const optionButtons = [];
    options.forEach((optionEl) => {
        const optionButtonEl = document.createElement('button');
        optionButtonEl.type = 'button';
        optionButtonEl.className = 'rank-select-themed-option';
        optionButtonEl.dataset.value = String(optionEl.value);

        const optionName = String(optionEl.textContent || '').trim();
        const groupLabel = String(optionEl.dataset.groupLabel || '').trim();
        const description = String(optionEl.dataset.description || '').trim();
        const groupKey = String(optionEl.dataset.group || '').trim();
        const icon = String(optionEl.dataset.icon || '').trim();

        const titleRowEl = document.createElement('span');
        titleRowEl.className = 'rank-select-themed-option-title-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'rank-select-themed-option-name';
        nameEl.textContent = optionName;
        titleRowEl.appendChild(nameEl);

        if (groupLabel) {
            const groupEl = document.createElement('span');
            groupEl.className = 'rank-select-themed-option-group';
            groupEl.textContent = groupLabel;
            titleRowEl.appendChild(groupEl);
        }

        optionButtonEl.appendChild(titleRowEl);

        if (description) {
            const descriptionEl = document.createElement('span');
            descriptionEl.className = 'rank-select-themed-option-desc';
            descriptionEl.textContent = description;
            optionButtonEl.appendChild(descriptionEl);
        }

        const searchIndex = normalizeThemedSelectSearchValue(`${optionName} ${description} ${groupLabel} ${groupKey} ${icon}`);
        optionButtonEl.dataset.search = searchIndex;

        if (String(selectEl.value) === String(optionEl.value)) {
            optionButtonEl.classList.add('is-selected');
        }

        optionButtonEl.addEventListener('click', () => {
            selectEl.value = String(optionEl.value);
            wrapperEl.dataset.searchTerm = '';
            syncThemedRankSelectLabel(selectEl);
            syncThemedRankSelectMenu(selectEl);
            closeThemedRankSelectMenus();
        });

        optionButtons.push(optionButtonEl);
        listEl.appendChild(optionButtonEl);
    });

    listEl.appendChild(emptyEl);

    const applyFilter = (termValue) => {
        const normalized = normalizeThemedSelectSearchValue(termValue);
        let visibleCount = 0;

        optionButtons.forEach((buttonEl) => {
            const searchable = String(buttonEl.dataset.search || '');
            const matches = !normalized || searchable.includes(normalized);
            buttonEl.hidden = !matches;
            buttonEl.style.display = matches ? '' : 'none';
            if (matches) visibleCount += 1;
        });

        emptyEl.hidden = visibleCount > 0;
        if (!emptyEl.hidden) {
            emptyEl.textContent = normalized
                ? 'Nenhuma conquista encontrada com esse termo'
                : 'Nenhuma conquista disponível';
        }
    };

    searchInputEl.addEventListener('input', () => {
        wrapperEl.dataset.searchTerm = searchInputEl.value;
        applyFilter(searchInputEl.value);
    });

    applyFilter(currentSearch);
    syncThemedRankSelectLabel(selectEl);
}

function initThemedRankSelect(selectEl) {
    if (!selectEl || !selectEl.id) return;

    ensureThemedRankSelectGlobalHandlers();

    const wrapperEl = document.querySelector(`.rank-select-themed[data-select-id="${selectEl.id}"]`);
    if (!wrapperEl) return;

    const triggerEl = wrapperEl.querySelector('.rank-select-themed-trigger');
    const menuEl = wrapperEl.querySelector('.rank-select-themed-menu');
    if (!triggerEl || !menuEl) return;

    if (!wrapperEl.dataset.bound) {
        triggerEl.addEventListener('click', () => {
            const willOpen = menuEl.hidden;
            closeThemedRankSelectMenus(willOpen ? selectEl.id : '');
            if (willOpen) {
                wrapperEl.dataset.searchTerm = '';
                syncThemedRankSelectMenu(selectEl);
                updateThemedRankSelectDirection(selectEl);
            }
            menuEl.hidden = !willOpen;
            wrapperEl.classList.toggle('is-open', willOpen);
            if (willOpen) {
                const searchInputEl = wrapperEl.querySelector('.rank-select-themed-search');
                if (searchInputEl) searchInputEl.focus();
            }
        });

        wrapperEl.dataset.bound = '1';
    }

    syncThemedRankSelectMenu(selectEl);
}

function normalizeUserRankGroup(rank) {
    const explicit = String(rank?.rankGroup || '').trim().toLowerCase();
    const icon = String(rank?.icon || '').trim().toUpperCase();
    const nameKey = normalizeAchievementNameKey(localizeRankName(rank?.name || '') || String(rank?.name || ''));

    if (explicit === 'progression' || explicit === 'fixed_automatic') return 'progression';
    if (PROGRESSION_RANK_NAME_KEYS.has(nameKey)) return 'progression';
    if (explicit === 'like_achievement' || explicit === 'likes' || explicit === 'like' || /^L\d+/.test(icon)) return 'likes';
    if (explicit === 'post_achievement' || explicit === 'posts' || explicit === 'post' || /^P\d+/.test(icon)) return 'posts';

    return 'custom';
}

function getUserRankGroupLabel(groupKey) {
    if (groupKey === 'progression' || groupKey === 'fixed_automatic') return 'Progressão';
    if (groupKey === 'like_achievement' || groupKey === 'likes') return 'Likes';
    if (groupKey === 'post_achievement' || groupKey === 'posts') return 'Postagens';
    return 'Personalizadas';
}

function getRankGroupSortPriority(groupKey) {
    if (groupKey === 'progression' || groupKey === 'fixed_automatic') return 0;
    if (groupKey === 'like_achievement' || groupKey === 'likes') return 1;
    if (groupKey === 'post_achievement' || groupKey === 'posts') return 2;
    if (groupKey === 'custom') return 3;
    return 4;
}

function renderUserRankBadge(userId, rank) {
    const safeColor = rank.color || rank.baseColor || rank.customColor || '#EC4899';
    const displayName = localizeRankName(rank?.name || '') || String(rank?.name || '');
    return `
        <span class="user-rank-badge" style="background-color: ${safeColor}55 !important; border-color: ${safeColor} !important; color: #ffffff !important;" data-user-id="${userId}" data-rank-id="${escapeHtmlAttributeValue(rank.id || '')}" data-rank-name="${escapeHtmlAttributeValue(displayName)}">
            <span class="user-rank-label" title="${escapeHtmlAttributeValue(displayName)}">${displayName}</span>
            <button class="remove-rank-btn" type="button" title="Remover conquista" style="color: #ffffff !important;">×</button>
        </span>
    `;
}

function doesUserRankBadgeExist(userId, rankName) {
    const container = document.getElementById(`ranks-${userId}`);
    if (!container) return false;
    return Array.from(container.querySelectorAll('.user-rank-label')).some((labelEl) => String(labelEl.textContent || '').trim() === String(rankName || '').trim());
}

function appendUserRankToUserRow(userId, rank) {
    const container = document.getElementById(`ranks-${userId}`);
    if (!container || !rank) return;

    const groupKey = normalizeUserRankGroup(rank);
    const groupLabel = getUserRankGroupLabel(groupKey);
    let groupEl = container.querySelector(`.user-rank-group[data-rank-group="${groupKey}"]`);

    if (!groupEl) {
        const newGroupHtml = `
            <div class="user-rank-group" data-rank-group="${groupKey}">
                <div class="user-rank-group-header">
                    <span class="user-rank-group-title">${groupLabel}</span>
                    <span class="user-rank-group-count">1</span>
                </div>
                <div class="user-ranks">${renderUserRankBadge(userId, rank)}</div>
            </div>
        `;
        if (container.innerHTML.includes('Nenhuma conquista atribuída')) {
            container.innerHTML = newGroupHtml;
        } else {
            container.insertAdjacentHTML('beforeend', newGroupHtml);
        }
        return;
    }

    const ranksContainer = groupEl.querySelector('.user-ranks');
    const countEl = groupEl.querySelector('.user-rank-group-count');
    if (ranksContainer) {
        ranksContainer.insertAdjacentHTML('beforeend', renderUserRankBadge(userId, rank));
    }
    if (countEl) {
        const currentCount = Number(countEl.textContent || 0);
        countEl.textContent = String(currentCount + 1);
    }
}

function renderUserRanksByCategory(userId, ranks) {
    const orderedGroups = ['progression', 'likes', 'posts', 'custom'];
    const groupedRanks = {
        progression: [],
        likes: [],
        posts: [],
        custom: []
    };

    ranks.forEach((rank) => {
        const group = normalizeUserRankGroup(rank);
        if (!groupedRanks[group]) {
            groupedRanks.custom.push(rank);
            return;
        }
        groupedRanks[group].push(rank);
    });

    const sectionLimit = 6;
    const sectionsHtml = orderedGroups.map((groupKey) => {
        const list = groupedRanks[groupKey];
        if (!list || list.length === 0) return '';

        const visibleRanks = list.slice(0, sectionLimit);
        const hiddenRanks = list.slice(sectionLimit);
        const hiddenId = `hiddenRanks-${userId}-${groupKey}`;

        return `
            <div class="user-rank-group" data-rank-group="${groupKey}">
                <div class="user-rank-group-header">
                    <span class="user-rank-group-title">${getUserRankGroupLabel(groupKey)}</span>
                    <span class="user-rank-group-count">${list.length}</span>
                </div>
                <div class="user-ranks">${visibleRanks.map((rank) => renderUserRankBadge(userId, rank)).join('')}</div>
                ${hiddenRanks.length > 0 ? `
                    <button type="button" class="toggle-user-ranks-btn" data-user-id="${userId}" data-group="${groupKey}" data-expanded="false">
                        +${hiddenRanks.length} nesta categoria
                    </button>
                    <div id="${hiddenId}" class="user-ranks user-ranks-hidden" style="display: none;">
                        ${hiddenRanks.map((rank) => renderUserRankBadge(userId, rank)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    return `<div class="user-rank-groups">${sectionsHtml || '<p class="user-ranks-empty">Nenhuma conquista atribuído</p>'}</div>`;
}

async function loadUserRanks(userId) {
    try {
        let result = await AuthAPI.getUserAllRanks(userId);
        console.debug('[ADMIN] getUserAllRanks', { userId, result });
        if (!result.success || !Array.isArray(result.ranks)) {
            console.warn(`Falling back to custom ranks for user ${userId}:`, result.message || result);
            result = await AuthAPI.getUserCustomRanks(userId);
            console.debug('[ADMIN] getUserCustomRanks', { userId, result });
        }

        const container = document.getElementById(`ranks-${userId}`);
        if (!container) return;
        // Replace loading placeholder regardless of outcome
        try {
            if (result && result.success && Array.isArray(result.ranks) && result.ranks.length > 0) {
                const visibleRanks = result.ranks.filter(Boolean);
                container.innerHTML = renderUserRanksByCategory(userId, visibleRanks);
            } else {
                container.innerHTML = '<div class="user-ranks-empty">Nenhuma conquista atribuída</div>';
            }
        } catch (renderErr) {
            console.error('[ADMIN] renderUserRanksByCategory error', { userId, renderErr });
            container.innerHTML = '<div class="user-ranks-error">Erro ao carregar conquistas</div>';
        }
        // Attach remove buttons listeners (if any)
        container.querySelectorAll('.remove-rank-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const badge = e.target.closest('.user-rank-badge');
                const userId = badge.dataset.userId;
                const rankId = badge.dataset.rankId;
                const rankName = badge.dataset.rankName || '';
                console.debug('[ADMIN] remove-rank clicked', { userId, rankId, rankName });
                removeUserRank(userId, rankId, rankName);
            });
        });

            container.querySelectorAll('.toggle-user-ranks-btn').forEach((toggleBtnEl) => {
                toggleBtnEl.addEventListener('click', () => {
                    const groupKey = String(toggleBtnEl.dataset.group || '').trim();
                    const hiddenContainer = container.querySelector(`#hiddenRanks-${userId}-${groupKey}`);
                    if (!hiddenContainer) return;

                    const expanded = toggleBtnEl.dataset.expanded === 'true';
                    const groupItems = hiddenContainer.querySelectorAll('.user-rank-badge').length;
                    if (expanded) {
                        hiddenContainer.style.display = 'none';
                        toggleBtnEl.dataset.expanded = 'false';
                        toggleBtnEl.textContent = `+${groupItems} nesta categoria`;
                        return;
                    }

                    hiddenContainer.style.display = 'flex';
                    toggleBtnEl.dataset.expanded = 'true';
                    toggleBtnEl.textContent = 'Ocultar categoria';
                });
            });
    
    } catch (error) {
        console.error('Erro ao carregar conquistas do usuário:', error);
    }
}

async function loadRankSelectOptions(userId) {
    try {
        const [customResult, defaultResult] = await Promise.all([
            AuthAPI.getAllCustomRanks(),
            AuthAPI.getDefaultRanks()
        ]);
        const select = document.getElementById(`rankSelect-${userId}`);
        if (!select) return;

        select.innerHTML = '<option value="">Selecionar conquista</option>';
        // Incluir conquistas padrão (ex: progressão) primeiro, se houver
        if (defaultResult && defaultResult.success && Array.isArray(defaultResult.ranks)) {
            const defaultRanksSorted = [...defaultResult.ranks].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' }));

            defaultRanksSorted.forEach(rank => {
                try {
                    const option = document.createElement('option');
                    const displayName = localizeRankName(rank?.name || '');

                    // Use normalized name key as default value and show localized display name
                    option.value = `default:${normalizeAchievementNameKey(rank?.name || '')}`;
                    option.textContent = displayName;
                    option.dataset.description = String(rank?.description || '').trim();
                    // default ranks are progression group
                    option.dataset.group = 'progression';
                    option.dataset.groupLabel = getUserRankGroupLabel(option.dataset.group);
                    option.dataset.icon = String(rank?.icon || '').trim();
                    select.appendChild(option);
                } catch (err) {
                    console.warn('Erro ao adicionar opção de conquista padrão:', err);
                }
            });
        }

        // Em seguida, incluir conquistas customizáveis
        let customRanksToUse = [];
        if (customResult && customResult.success && Array.isArray(customResult.ranks)) {
            customRanksToUse = customResult.ranks;
        } else {
            console.warn('[admin] getAllCustomRanks falhou ou retornou vazio, tentando fallback para getCustomRanks()', customResult);
            try {
                const publicResult = await AuthAPI.getCustomRanks();
                console.log('[admin] getCustomRanks fallback response:', publicResult);
                if (publicResult && publicResult.success && Array.isArray(publicResult.ranks)) customRanksToUse = publicResult.ranks;
            } catch (e) {
                console.error('[admin] Erro ao chamar getCustomRanks fallback:', e);
            }
        }

        if (Array.isArray(customRanksToUse) && customRanksToUse.length > 0) {
                const filteredRanks = customRanksToUse.filter(rank => {
                const explicit = String(rank?.rankGroup || rank?.group || '').trim().toLowerCase();
                const isSpecial = explicit === 'special' || explicit === 'especiais' || Number(rank?.isSpecial) === 1 || rank?.isSpecial === true;
                return !isSpecial;
            });

            const sortedRanks = [...filteredRanks].sort((a, b) => {
                const groupA = normalizeUserRankGroup(a);
                const groupB = normalizeUserRankGroup(b);
                const priorityDiff = getRankGroupSortPriority(groupA) - getRankGroupSortPriority(groupB);
                if (priorityDiff !== 0) return priorityDiff;

                return String(a?.name || '').localeCompare(String(b?.name || ''), 'pt-BR', { sensitivity: 'base' });
            });

            sortedRanks.forEach(rank => {
                const option = document.createElement('option');
                option.value = rank.id;
                option.textContent = rank.name;
                option.dataset.description = String(rank?.description || '').trim();
                option.dataset.group = normalizeUserRankGroup(rank);
                option.dataset.groupLabel = getUserRankGroupLabel(option.dataset.group);
                option.dataset.icon = String(rank?.icon || '').trim();
                select.appendChild(option);
            });
        } else {
            // nenhuma conquista customizável disponível
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = 'Nenhuma conquista customizável encontrada';
            noneOpt.disabled = true;
            select.appendChild(noneOpt);
        }

        syncThemedRankSelectMenu(select);
    } catch (error) {
        console.error('Erro ao carregar opeees de conquistas:', error);
    }
}

async function addUserRank(userId) {
    const select = document.getElementById(`rankSelect-${userId}`);
    if (!select) {
        showMessage('Não foi possível encontrar o seletor de conquistas.', 'error');
        return;
    }

    const customRankId = select.value;
    if (!customRankId) {
        showMessage('Selecione uma conquista primeiro', 'error');
        return;
    }

    const selectedOption = select.selectedOptions?.[0] || null;
    const selectedRankName = String(selectedOption?.textContent || '').trim();
    const selectedRankGroup = String(selectedOption?.dataset?.group || 'custom').trim();
    const selectedRankColor = String(selectedOption?.dataset?.color || '#EC4899').trim();
    const selectedRankIcon = String(selectedOption?.dataset?.icon || '').trim();

    try {
        let result;
        if (typeof customRankId === 'string' && customRankId.startsWith('default:')) {
            const defaultKey = customRankId.replace(/^default:/i, '').trim();
            result = await AuthAPI.addUserDefaultRank(userId, defaultKey);
        } else {
            result = await AuthAPI.addUserCustomRank(userId, customRankId);
        }

        if (result.success) {
            showMessage('Conquista atribuída com sucesso!', 'success');
            if (selectedRankName) {
                appendUserRankToUserRow(userId, {
                    id: customRankId,
                    name: selectedRankName,
                    color: selectedRankColor,
                    icon: selectedRankIcon,
                    rankGroup: selectedRankGroup
                });
            }
            select.value = '';
            syncThemedRankSelectMenu(select);

            setTimeout(() => {
                loadUserRanks(userId).catch((err) => console.error('[ADMIN] loadUserRanks fallback error', err));
                const usersContainer = document.getElementById('usersContainer');
                if (usersContainer) {
                    loadUsers().catch((err) => console.error('[ADMIN] loadUsers fallback error', err));
                }
            }, 100);
        } else {
            showMessage('Erro: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('Erro ao atribuir conquista: ' + (error?.message || String(error)), 'error');
    }
}

async function removeUserRank(userId, customRankId, rankName = '') {
    const confirmed = await showThemeConfirm(
        'Remover Conquista',
        'Tem certeza que deseja remover esta conquista do usuário?',
        {
            confirmText: 'Remover',
            cancelText: 'Cancelar',
            danger: true
        }
    );
    if (!confirmed) {
        return;
    }

    const idStr = String(customRankId || '');
    try {
        let result;
        if (/^fixed-/i.test(idStr)) {
            result = await AuthAPI.hideUserFixedRank(userId, customRankId);
        } else {
            result = await AuthAPI.removeUserCustomRank(userId, customRankId);
        }

        console.debug('[ADMIN] removeUserRank result', { userId, customRankId, rankName, result });
        if (result.success) {
            showMessage('conquista removido com sucesso!', 'success');
            loadUserRanks(userId);
            const usersContainer = document.getElementById('usersContainer');
            if (usersContainer) {
                loadUsers().catch((err) => console.error('[ADMIN] loadUsers fallback error', err));
            }
            return;
        }

        showMessage('Erro: ' + (result?.message || 'Falha ao remover conquista'), 'error');
    } catch (error) {
        console.error('[ADMIN] removeUserRank error', { userId, customRankId, rankName, error });
        showMessage('Erro ao remover conquista: ' + error.message, 'error');
    }
}

async function deleteUserAccount(userId) {
    if (!canRevealEmails) {
        showMessage('Somente o dono da conta pode excluir usuários', 'error');
        return;
    }

    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        showMessage('ID de usuário inválido', 'error');
        return;
    }

    const label = userLabelByUserId.get(String(normalizedId)) || `ID ${normalizedId}`;
    const confirmed = await confirmCriticalAction({
        title: 'Excluir conta',
        message: `Tem certeza que deseja excluir completamente a conta de ${label}? Esta ação remove perfil, conquistas, downloads e histórico relacionado.`,
        confirmText: 'Excluir conta',
        keyword: 'EXCLUIR'
    });

    if (!confirmed) return;

    try {
        const result = await AuthAPI.deleteUserAccount(normalizedId);
        if (result.success) {
            showMessage(result.message || 'Conta exclueda com sucesso!', 'success');
            await loadUsers();
            loadBans();
            loadPostPermissions();
        } else {
            showMessage('Erro: ' + (result.message || 'Falha ao excluir conta'), 'error');
        }
    } catch (error) {
        showMessage('Erro ao excluir conta: ' + error.message, 'error');
    }
}

async function removeUserAvatar(userId) {
    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        showMessage('ID de usuário inválido', 'error');
        return;
    }

    const label = userLabelByUserId.get(String(normalizedId)) || `ID ${normalizedId}`;
    const confirmed = await showThemeConfirm(
        'Remover foto de perfil',
        `Deseja remover a foto de perfil de ${label}? Essa ação é útil para moderar imagens inadequadas.`,
        {
            confirmText: 'Remover foto',
            cancelText: 'Cancelar',
            danger: true
        }
    );

    if (!confirmed) return;

    try {
        const result = await AuthAPI.removeUserAvatar(normalizedId);
        if (result?.success) {
            showMessage(result.message || 'Foto removida com sucesso!', 'success');
            await loadUsers();
            return;
        }
        showMessage(result?.message || 'Erro ao remover foto de perfil', 'error');
    } catch (error) {
        showMessage('Erro ao remover foto de perfil: ' + error.message, 'error');
    }
}

async function removeUserAnimatedBackground(userId) {
    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        showMessage('ID de usuário inválido', 'error');
        return;
    }

    const label = userLabelByUserId.get(String(normalizedId)) || `ID ${normalizedId}`;
    const confirmed = await showThemeConfirm(
        'Remover fundo animado',
        `Deseja remover o GIF/fundo animado de ${label}? Isso limpa o fundo usado no perfil e nos cards de downloads, sem apagar a conta.`,
        {
            confirmText: 'Remover fundo',
            cancelText: 'Cancelar',
            danger: true
        }
    );

    if (!confirmed) return;

    try {
        const result = await AuthAPI.removeUserAnimatedBackground(normalizedId);
        if (result?.success) {
            showMessage(result.message || 'Fundo animado removido com sucesso!', 'success');
            await loadUsers();
            return;
        }
        showMessage(result?.message || 'Erro ao remover fundo animado', 'error');
    } catch (error) {
        showMessage('Erro ao remover fundo animado: ' + error.message, 'error');
    }
}

async function saveUserCustomTitle(userId, customTitle, customTitleSubtitle, buttonEl) {
    const normalizedId = Number(userId);
    if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        showMessage('ID de usuário inválido', 'error');
        return;
    }

    const label = userLabelByUserId.get(String(normalizedId)) || `ID ${normalizedId}`;
    const titleToSave = String(customTitle || '').trim();
    const subtitleToSave = String(customTitleSubtitle || '').trim();
    
    if (titleToSave && titleToSave.length > 100) {
        showMessage('Título deve ter no máximo 100 caracteres', 'error');
        return;
    }
    
    if (subtitleToSave && subtitleToSave.length > 100) {
        showMessage('Subtítulo deve ter no máximo 100 caracteres', 'error');
        return;
    }

    if (!buttonEl) return;
    
    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = 'Salvando...';

    try {
        const result = await AuthAPI.updateCustomTitle(normalizedId, titleToSave || null, subtitleToSave || null);
        
        if (result?.success) {
            const displayTitle = titleToSave ? `"${titleToSave}"` : 'vazio';
            showMessage(`Título de ${label} definido para ${displayTitle} com sucesso!`, 'success');
            
            // Atualizar o atributo customTitle do usuário no cache se existir
            const cachedUser = cachedUsers.find(u => u.id === normalizedId);
            if (cachedUser) {
                cachedUser.customTitle = titleToSave || null;
                cachedUser.customTitleSubtitle = subtitleToSave || null;
            }
        } else {
            const errorMsg = result?.message || 'Erro ao salvar título';
            showMessage(errorMsg, 'error');
        }
    } catch (error) {
        showMessage('Erro ao salvar título: ' + error.message, 'error');
    } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}

function openSendTicketModal(userId, options = {}) {
    const isBroadcast = options?.broadcast === true;
    const normalizedId = Number(userId);
    if (!isBroadcast && (!Number.isInteger(normalizedId) || normalizedId <= 0)) {
        showMessage('ID de usuário inválido', 'error');
        return;
    }

    const label = isBroadcast
        ? 'Todos os usuários (exceto sua conta)'
        : (userLabelByUserId.get(String(normalizedId)) || `ID ${normalizedId}`);
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10020;
        padding: 20px;
    `;

    modal.innerHTML = `
        <div style="width: min(100%, 560px); background: linear-gradient(180deg, rgba(29, 18, 74, 0.98), rgba(19, 16, 49, 0.98)); border: 1px solid rgba(236, 72, 153, 0.4); border-radius: 16px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42); padding: 22px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px;">
                <div>
                    <h3 style="margin:0; color:#F8FAFC; font-size:22px;">Enviar chamado</h3>
                    <p style="margin:6px 0 0 0; color:rgba(226,232,240,0.78); font-size:13px;">${isBroadcast ? 'Todos os usuários selecionados receberão este chamado na caixa de entrada e no sino do perfil.' : 'O usuário receberá este chamado na caixa de entrada e no sino do perfil.'}</p>
                </div>
                <button type="button" data-close-ticket-modal="1" style="border:none; background:transparent; color:#FBCFE8; font-size:24px; line-height:1; cursor:pointer;">&times;</button>
            </div>
            <div style="margin-bottom:12px; color:#F9A8D4; font-size:13px; font-weight:700;">Destino: ${escapeHtmlAdmin(label)}</div>
            <div style="display:flex; flex-direction:column; gap:12px;">
                ${isBroadcast ? `
                <label style="display:flex; flex-direction:column; gap:6px; color:#E2E8F0; font-size:13px; font-weight:600;">
                    Enviar para
                    <select id="adminTicketRecipientGroup" style="padding:11px 12px; border-radius:10px; border:1px solid rgba(236,72,153,0.45); background:rgba(8,11,27,0.62); color:#fff;">
                        <option value="all">Todos os usuários</option>
                        <option value="post_achievement">Usuários com conquistas de postagens</option>
                        <option value="like_achievement">Usuários com conquistas de likes</option>
                        <option value="general">Usuários com conquistas personalizadas</option>
                        <option value="specific_rank">Uma conquista específica</option>
                    </select>
                </label>
                <label id="adminTicketSpecificRankWrap" style="display:none; flex-direction:column; gap:6px; color:#E2E8F0; font-size:13px; font-weight:600;">
                    Conquista específica
                    <select id="adminTicketSpecificRankSelect" style="padding:11px 12px; border-radius:10px; border:1px solid rgba(236,72,153,0.45); background:rgba(8,11,27,0.62); color:#fff;">
                        <option value="">Selecione uma conquista</option>
                    </select>
                </label>
                ` : ''}
                <label style="display:flex; flex-direction:column; gap:6px; color:#E2E8F0; font-size:13px; font-weight:600;">
                    Título
                    <input id="adminTicketTitleInput" type="text" maxlength="120" placeholder="Ex.: Aviso importante sobre sua conta" style="padding:11px 12px; border-radius:10px; border:1px solid rgba(236,72,153,0.45); background:rgba(8,11,27,0.62); color:#fff;">
                </label>
                <label style="display:flex; flex-direction:column; gap:6px; color:#E2E8F0; font-size:13px; font-weight:600;">
                    Mensagem
                    <textarea id="adminTicketMessageInput" maxlength="3000" rows="8" placeholder="Escreva a mensagem que o usuário verá na caixa de entrada..." style="padding:11px 12px; border-radius:10px; border:1px solid rgba(236,72,153,0.45); background:rgba(8,11,27,0.62); color:#fff; resize:vertical;"></textarea>
                </label>
                <label style="display:flex; flex-direction:column; gap:6px; color:#E2E8F0; font-size:13px; font-weight:600;">
                    Anexo (opcional)
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:11px 12px; border-radius:10px; border:1px solid rgba(236,72,153,0.45); background:rgba(8,11,27,0.62);">
                        <label for="adminTicketAttachmentInput" style="display:inline-flex; align-items:center; justify-content:center; min-height:34px; padding:8px 12px; border-radius:9px; border:1px solid rgba(236,72,153,0.7); background:linear-gradient(135deg, #EC4899, #7C3AED); color:#fff; font-size:12px; font-weight:800; cursor:pointer;">Escolher arquivo</label>
                        <span id="adminTicketAttachmentName" style="color:rgba(226,232,240,0.72); font-size:12px;">Nenhum arquivo escolhido</span>
                        <input id="adminTicketAttachmentInput" type="file" accept=".gif,.png,.jpg,.jpeg,.webp,.bmp,.svg,.pdf,.txt,.zip,.rar,.7z,.apk,.iso,.exe,.msi,.mp3,.mp4,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.json" style="display:none;">
                    </div>
                </label>
                <div style="margin-top:-6px; color:rgba(226,232,240,0.62); font-size:12px;">Aceita arquivo, imagem, GIF e anexos gerais. Limite de 500MB.</div>
                <div id="adminTicketError" style="min-height:18px; color:#FCA5A5; font-size:12px;"></div>
                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button type="button" data-close-ticket-modal="1" style="padding:10px 14px; border-radius:10px; border:1px solid rgba(148,163,184,0.35); background:rgba(15,23,42,0.65); color:#E2E8F0; font-weight:700; cursor:pointer;">Cancelar</button>
                    <button type="button" id="adminTicketSubmitBtn" style="padding:10px 16px; border-radius:10px; border:1px solid rgba(236,72,153,0.65); background:linear-gradient(135deg, #EC4899, #8B5CF6); color:#fff; font-weight:800; cursor:pointer;">${isBroadcast ? 'Enviar para todos' : 'Enviar chamado'}</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('[data-close-ticket-modal="1"]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    const titleInput = modal.querySelector('#adminTicketTitleInput');
    const messageInput = modal.querySelector('#adminTicketMessageInput');
    const attachmentInput = modal.querySelector('#adminTicketAttachmentInput');
    const attachmentNameEl = modal.querySelector('#adminTicketAttachmentName');
    const recipientGroupSelect = modal.querySelector('#adminTicketRecipientGroup');
    const specificRankWrap = modal.querySelector('#adminTicketSpecificRankWrap');
    const specificRankSelect = modal.querySelector('#adminTicketSpecificRankSelect');
    const errorEl = modal.querySelector('#adminTicketError');
    const submitBtn = modal.querySelector('#adminTicketSubmitBtn');
    titleInput?.focus();

    if (attachmentInput && attachmentNameEl) {
        attachmentInput.addEventListener('change', () => {
            const file = attachmentInput.files?.[0] || null;
            attachmentNameEl.textContent = file ? file.name : 'Nenhum arquivo escolhido';
        });
    }

    if (isBroadcast && recipientGroupSelect && specificRankWrap && specificRankSelect) {
        AuthAPI.getAllCustomRanks().then((result) => {
            if (!result?.success || !Array.isArray(result?.ranks)) return;
            const optionsHtml = result.ranks
                .map((rank) => `<option value="${escapeHtmlAdmin(String(rank.id || ''))}">${escapeHtmlAdmin(String(rank.name || 'Conquista'))}</option>`)
                .join('');
            specificRankSelect.innerHTML = `<option value="">Selecione uma conquista</option>${optionsHtml}`;
        }).catch(() => {});

        recipientGroupSelect.addEventListener('change', () => {
            specificRankWrap.style.display = recipientGroupSelect.value === 'specific_rank' ? 'flex' : 'none';
        });
    }

    submitBtn?.addEventListener('click', async () => {
        const title = String(titleInput?.value || '').trim();
        const message = String(messageInput?.value || '').trim();
        const attachment = attachmentInput?.files?.[0] || null;
        const recipientGroup = String(recipientGroupSelect?.value || 'all').trim();
        const customRankId = String(specificRankSelect?.value || '').trim();

        if (!title || !message) {
            if (errorEl) {
                errorEl.textContent = 'Preencha o título e a mensagem do chamado.';
            }
            return;
        }

        if (isBroadcast && recipientGroup === 'specific_rank' && !customRankId) {
            if (errorEl) {
                errorEl.textContent = 'Selecione a conquista específica para esse envio.';
            }
            return;
        }

        if (errorEl) {
            errorEl.textContent = '';
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        try {
            const result = isBroadcast
                ? await AuthAPI.sendTicketToAll(title, message, attachment, { recipientGroup, customRankId })
                : await AuthAPI.sendUserTicket(normalizedId, title, message, attachment);
            if (result?.success) {
                closeModal();
                showMessage(result.message || 'Chamado enviado com sucesso!', 'success');
                return;
            }
            if (errorEl) {
                errorEl.textContent = result?.message || 'Erro ao enviar chamado.';
            }
        } catch (error) {
            if (errorEl) {
                errorEl.textContent = 'Erro ao enviar chamado: ' + error.message;
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar chamado';
        }
    });
}

// ===================== UTILITeRIOS =====================
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'));
        reader.readAsDataURL(file);
    });
}

async function resolveImageUrlFromInputs(urlValue, fileValue) {
    const cleanUrl = String(urlValue || '').trim();
    if (fileValue) {
        const mimeType = String(fileValue.type || '').toLowerCase();
        const fileName = String(fileValue.name || '').toLowerCase();
        const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
        const ext = extMatch ? `.${extMatch[1]}` : '';
        const byMime = ALLOWED_RANK_BACKGROUND_FILE_TYPES.has(mimeType);
        const byExt = ALLOWED_RANK_BACKGROUND_FILE_EXT.has(ext);
        const mimeUnknown = !mimeType || mimeType === 'application/octet-stream';

        if (!(byExt && (byMime || mimeUnknown))) {
            throw new Error('A imagem da conquista deve ser GIF, PNG, JPG ou WEBP.');
        }

        if (Number(fileValue.size || 0) > MAX_RANK_BACKGROUND_FILE_BYTES) {
            throw new Error('Arquivo muito grande. Limite de 500MB para imagem da conquista.');
        }

        const uploadResult = await AuthAPI.uploadCustomRankBackground(fileValue);
        if (uploadResult?.success && uploadResult?.backgroundImageUrl) {
            return String(uploadResult.backgroundImageUrl);
        }

        const status = Number(uploadResult?.status || 0);
        const missingUploadRoute = status === 404 || String(uploadResult?.message || '').includes('404');
        const sizeMb = (Number(fileValue.size || 0) / (1024 * 1024)).toFixed(2);
        if (missingUploadRoute) {
            if (Number(fileValue.size || 0) > MAX_INLINE_RANK_BACKGROUND_FILE_BYTES) {
                throw new Error(`Backend sem rota de upload (404). GIF atual: ${sizeMb}MB. Reinicie o backend atualizado para enviar GIF grande.`);
            }

            // Fallback de compatibilidade para backend antigo: envia como data URL no JSON.
            return await readFileAsDataUrl(fileValue);
        }

        throw new Error(uploadResult?.message || 'Erro ao enviar imagem da conquista.');
    }
    return cleanUrl;
}

function showThemeConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            danger = false
        } = options;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.74);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
            padding: 16px;
        `;

        const confirmBg = danger
            ? 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)'
            : 'linear-gradient(135deg, #6B46C1 0%, #8B5CF6 100%)';

        overlay.innerHTML = `
            <div style="
                width: 100%;
                max-width: 460px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 1px solid rgba(236, 72, 153, 0.55);
                border-radius: 14px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.45);
                padding: 22px;
                color: #fff;
            ">
                <h3 style="margin: 0 0 10px 0; font-size: 22px; color: #EC4899;">${title}</h3>
                <p style="margin: 0 0 18px 0; line-height: 1.45; color: rgba(255,255,255,0.9);">${message}</p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" id="themeConfirmCancel" style="padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.45); background: transparent; color: #fff; cursor: pointer; font-weight: 600;">${cancelText}</button>
                    <button type="button" id="themeConfirmOk" style="padding: 10px 16px; border-radius: 8px; border: none; background: ${confirmBg}; color: #fff; cursor: pointer; font-weight: 700;">${confirmText}</button>
                </div>
            </div>
        `;

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        overlay.querySelector('#themeConfirmCancel')?.addEventListener('click', () => cleanup(false));
        overlay.querySelector('#themeConfirmOk')?.addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });

        document.body.appendChild(overlay);
    });
}

function showKeywordConfirm(title, message, keyword) {
    return new Promise((resolve) => {
        const expected = String(keyword || '').trim().toUpperCase();
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.78);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 21000;
            padding: 16px;
        `;

        overlay.innerHTML = `
            <div style="
                width: 100%;
                max-width: 460px;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: 1px solid rgba(236, 72, 153, 0.55);
                border-radius: 14px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.45);
                padding: 22px;
                color: #fff;
            ">
                <h3 style="margin: 0 0 10px 0; font-size: 22px; color: #EC4899;">${title}</h3>
                <p style="margin: 0 0 12px 0; line-height: 1.45; color: rgba(255,255,255,0.9);">${message}</p>
                <p style="margin: 0 0 10px 0; color: #FBCFE8; font-size: 13px;">Digite <strong>${expected}</strong> para confirmar:</p>
                <input id="keywordConfirmInput" type="text" autocomplete="off" style="width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.45); background: rgba(15, 23, 42, 0.65); color: #fff; outline: none;">
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px;">
                    <button type="button" id="keywordConfirmCancel" style="padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(236,72,153,0.45); background: transparent; color: #fff; cursor: pointer; font-weight: 600;">Cancelar</button>
                    <button type="button" id="keywordConfirmOk" style="padding: 10px 16px; border-radius: 8px; border: none; background: linear-gradient(135deg, #EC4899 0%, #DB2777 100%); color: #fff; cursor: pointer; font-weight: 700;" disabled>Confirmar</button>
                </div>
            </div>
        `;

        const input = overlay.querySelector('#keywordConfirmInput');
        const confirmBtn = overlay.querySelector('#keywordConfirmOk');

        const cleanup = (result) => {
            overlay.remove();
            resolve(result);
        };

        input?.addEventListener('input', () => {
            const current = String(input.value || '').trim().toUpperCase();
            confirmBtn.disabled = current !== expected;
        });

        overlay.querySelector('#keywordConfirmCancel')?.addEventListener('click', () => cleanup(false));
        confirmBtn?.addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });

        document.body.appendChild(overlay);
        input?.focus();
    });
}

async function confirmCriticalAction(options = {}) {
    const {
        title = 'Confirmar ação',
        message = 'Tem certeza que deseja continuar?',
        confirmText = 'Confirmar',
        keyword = ''
    } = options;

    const firstStep = await showThemeConfirm(title, message, {
        confirmText,
        cancelText: 'Cancelar',
        danger: true
    });
    if (!firstStep) return false;

    const normalizedKeyword = String(keyword || '').trim();
    if (!normalizedKeyword) return true;

    return showKeywordConfirm(
        'Confirmação adicional',
        'Ação crítica detectada.',
        normalizedKeyword
    );
}

function showMessage(message, type) {
    const fallbackMessageDiv = document.getElementById('sendmailStatus');
    const messageDiv = document.getElementById('message') || fallbackMessageDiv;
    if (!messageDiv) return;

    if (messageTimeoutId) {
        clearTimeout(messageTimeoutId);
        messageTimeoutId = null;
    }

    const normalizedType = String(type || 'info').toLowerCase();

    if (messageDiv.id === 'sendmailStatus') {
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
        messageDiv.style.padding = '10px 12px';
        messageDiv.style.borderRadius = '8px';
        messageDiv.style.border = '1px solid rgba(148, 163, 184, 0.25)';
        messageDiv.style.background = normalizedType === 'success'
            ? 'rgba(16, 185, 129, 0.12)'
            : normalizedType === 'error'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(59, 130, 246, 0.12)';
        messageDiv.style.color = normalizedType === 'success'
            ? '#A7F3D0'
            : normalizedType === 'error'
                ? '#FCA5A5'
                : '#BFDBFE';
        messageDiv.style.fontSize = '13px';
        messageDiv.setAttribute('role', 'status');
        messageDiv.setAttribute('aria-live', 'polite');
    } else {
        messageDiv.className = 'message ' + normalizedType;
        messageDiv.textContent = message;
        messageDiv.setAttribute('role', 'status');
        messageDiv.setAttribute('aria-live', 'polite');
        messageDiv.style.display = 'block';
    }

    messageTimeoutId = setTimeout(() => {
        messageDiv.style.display = 'none';
        messageTimeoutId = null;
    }, 5000);
}

// ===================== BANIMENTOS =====================
async function loadBans() {
    const container = document.getElementById('bansListContainer');
    try {
        const result = await AuthAPI.getBans();
        if (result.success && result.bans && result.bans.length > 0) {
            let html = '';
            result.bans.forEach(ban => {
                if (isExampleEmail(ban.email)) {
                    return;
                }

                const banDate = new Date(ban.createdAt).toLocaleDateString('pt-BR');
                const expiryDate = ban.banType === 'suspension' && ban.expiresAt ? 
                    new Date(ban.expiresAt).toLocaleDateString('pt-BR') : 
                    'Permanente';
                const isExpired = ban.banType === 'suspension' && ban.expiresAt && new Date(ban.expiresAt) < new Date();
                
                html += `
                    <div class="ban-card" data-ban-id="${ban.id}">
                        <div class="ban-info">
                            <h3>${ban.nickname} (${maskEmail(ban.email)})</h3>
                            <div class="ban-details">
                                <strong>Tipo:</strong> ${ban.banType === 'suspension' ? 'Suspens\u00e3o Tempor\u00e1ria' : 'Ban Permanente'} ${isExpired ? '(Expirado)' : ''}
                            </div>
                            <div class="ban-details">
                                <strong>Motivo:</strong> ${ban.reason || 'Nenhum motivo fornecido'}
                            </div>
                            <div class="ban-details">
                                <strong>Data do Ban:</strong> ${banDate}
                            </div>
                            ${ban.banType === 'suspension' && ban.expiresAt ? `<div class="ban-details"><strong>Expira em:</strong> ${expiryDate}</div>` : ''}
                        </div>
                        <div class="ban-actions">
                            <button class="unban" onclick="unbanUser(${ban.id})">Desbanir</button>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhum usuário banido</p>';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Erro ao carregar banimentos</p>';
        console.error('Erro ao carregar bans:', error);
    }
}

async function unbanUser(banId) {
    const confirmed = await confirmCriticalAction({
        title: 'Desbanir usuário',
        message: 'Tem certeza que deseja remover este banimento?',
        confirmText: 'Desbanir',
        keyword: 'DESBANIR'
    });
    if (!confirmed) {
        return;
    }
    
    try {
        const result = await AuthAPI.unbanUser(banId);
        if (result.success) {
            showMessage('Usuário desbanido com sucesso!', 'success');
            loadBans();
        } else {
            showMessage('Erro: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('Erro ao desbanir: ' + error.message, 'error');
    }
}

// ===================== GERENCIAR POSTAGENS SUSPENSAS =====================

async function loadSuspendedPosts() {
    const container = document.getElementById('suspendedPostsContainer');
    if (!container) return;

    if (container.dataset.suspensionActionsBound !== '1') {
        container.dataset.suspensionActionsBound = '1';
        container.addEventListener('click', async (event) => {
            const target = event.target;
            const button = target instanceof Element
                ? target.closest('button[data-suspension-action]')
                : null;
            if (!button || !container.contains(button)) return;

            const downloadId = Number(button.closest('.suspension-card')?.dataset.downloadId);
            if (!Number.isInteger(downloadId) || downloadId <= 0) {
                showMessage('Não foi possível identificar a postagem.', 'error');
                return;
            }

            if (button.dataset.suspensionAction === 'review') {
                const reviewDetails = button.closest('.suspension-card')?.querySelector('.suspension-review-details');
                if (!reviewDetails) return;

                const isExpanded = button.getAttribute('aria-expanded') === 'true';
                reviewDetails.hidden = isExpanded;
                button.setAttribute('aria-expanded', String(!isExpanded));
                button.textContent = isExpanded ? 'Ir para Revisão' : 'Ocultar Revisão';
                if (!isExpanded) {
                    reviewDetails.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            if (button.dataset.suspensionAction === 'unsuspend') {
                await unsuspendPost(downloadId, button);
            } else if (button.dataset.suspensionAction === 'delete') {
                await deleteSuspendedPost(downloadId, button);
            }
        });
    }

    try {
        const result = await AuthAPI.getSuspendedDownloads();
        console.log('[LOAD-SUSPENSIONS] Dados recebidos da API:', result);
        if (result.success && result.suspensions && result.suspensions.length > 0) {
            let html = '';
            result.suspensions.forEach(suspension => {
                console.log('[LOAD-SUSPENSIONS] Processando suspension:', suspension);
                const suspensionDate = new Date(suspension.createdAt).toLocaleDateString('pt-BR');
                const statusLabel = suspension.status === 'suspended' ? 'Suspensa' : 
                                  suspension.status === 'under_review' ? 'Em Revisão' : 'Resolvida';
                
                const statusBgColor = suspension.status === 'suspended' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(236, 72, 153, 0.2)';
                const statusBorderColor = suspension.status === 'suspended' ? '#F97316' : '#EC4899';
                const statusTextColor = suspension.status === 'suspended' ? '#FDBA74' : '#F9A8D4';
                
                html += `
                    <div class="suspension-card" data-suspension-id="${suspension.id}" data-download-id="${suspension.downloadId}" style="border: 2px solid ${statusBorderColor}; background: ${statusBgColor}; padding: 15px; border-radius: 8px; margin-bottom: 12px;">
                        <div class="suspension-info" style="margin-bottom: 12px;">
                            <h3 style="margin: 0 0 10px 0; color: #FDF2F8; font-size: 16px;">${escapeHtmlAdmin(suspension.name)}</h3>
                            <div class="suspension-details" style="margin: 6px 0;">
                                <strong style="color: ${statusTextColor};">Usuário:</strong> <span style="color: #E2E8F0;">${escapeHtmlAdmin(suspension.nickname)}</span>
                            </div>
                            <div class="suspension-details" style="margin: 6px 0;">
                                <strong style="color: ${statusTextColor};">Status:</strong> <span style="background: ${statusBgColor}; padding: 3px 8px; border-radius: 4px; color: ${statusTextColor}; font-weight: 600;">${statusLabel}</span>
                            </div>
                            <div class="suspension-details" style="margin: 6px 0;">
                                <strong style="color: ${statusTextColor};">Motivo:</strong> <span style="color: #E2E8F0;">${escapeHtmlAdmin(suspension.reason)}</span>
                            </div>
                            <div class="suspension-details" style="margin: 6px 0;">
                                <strong style="color: ${statusTextColor};">Data da Suspensão:</strong> <span style="color: #E2E8F0;">${suspensionDate}</span>
                            </div>
                            <div class="suspension-details" style="margin-top: 10px;">
                                <strong style="color: ${statusTextColor};">Descrição da postagem:</strong> <br>
                                <p style="margin-top: 5px; color: #AAA; font-size: 0.9em; max-height: 80px; overflow-y: auto;">${escapeHtmlAdmin(suspension.description || 'Sem descrição')}</p>
                            </div>
                        </div>
                        <div class="suspension-actions" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${statusBorderColor};">
                            ${suspension.status === 'under_review' ? `<button type="button" class="btn-review" data-suspension-action="review" aria-expanded="false" style="flex: 1; padding: 10px 16px; background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); border: 1px solid #60A5FA; color: white; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">Ir para Revisão</button>` : ''}
                            <button type="button" class="btn-unsuspend" data-suspension-action="unsuspend" style="flex: 1; padding: 10px 16px; background: linear-gradient(135deg, #6B46C1 0%, #8B5CF6 100%); border: 1px solid #A78BFA; color: white; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">Reabrir Postagem</button>
                            <button type="button" class="btn-delete" data-suspension-action="delete" style="flex: 1; padding: 10px 16px; background: linear-gradient(135deg, #EF4444 0%, #B91C1C 100%); border: 1px solid #F87171; color: white; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.3s;">Remover Postagem</button>
                        </div>
                        ${suspension.status === 'under_review' ? `
                            <div class="suspension-review-details" hidden style="margin-top: 12px; padding: 12px; border: 1px solid rgba(96, 165, 250, 0.5); border-radius: 6px; background: rgba(15, 23, 42, 0.35);">
                                <strong style="color: #BFDBFE;">Mensagem enviada para revisão:</strong>
                                <p style="margin: 6px 0 0; color: #E2E8F0; white-space: pre-wrap;">${escapeHtmlAdmin(suspension.userMessage || 'O usuário não enviou uma mensagem junto com a solicitação.')}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhuma postagem suspensa</p>';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Erro ao carregar postagens suspensas</p>';
        console.error('Erro ao carregar postagens suspensas:', error);
    }
}

async function unsuspendPost(downloadId, buttonElement) {
    const confirmed = await confirmCriticalAction({
        title: 'Reabrir Postagem',
        message: 'Deseja reabrir esta postagem? Ela voltará ao normal e o usuário verá que foi resolvido.',
        confirmText: 'Reabrir',
        keyword: 'REABRIR'
    });
    if (!confirmed) {
        return;
    }
    
    // Mostrar loading
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.innerHTML = 'Aprovando...';
    
    try {
        console.log('[UNSUSPEND] Iniciando aprovação de postagem:', downloadId);
        const result = await AuthAPI.unsuspendDownload(downloadId);
        console.log('[UNSUSPEND] Resposta recebida:', result);
        
        if (result && result.success) {
            showMessage('Postagem reabierta! Chamado resolvido', 'success');
            await new Promise(resolve => setTimeout(resolve, 1500));
            loadedTabs.delete('suspended-posts');
            loadSuspendedPosts();
        } else {
            showMessage('Erro: ' + (result?.message || 'Resposta inválida da API'), 'error');
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    } catch (error) {
        console.error('[UNSUSPEND] Erro ao reabrir postagem:', error);
        showMessage('Erro ao reabrir: ' + error.message, 'error');
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
    }
}

async function deleteSuspendedPost(downloadId, buttonElement) {
    const confirmed = await confirmCriticalAction({
        title: 'Remover Postagem Permanentemente',
        message: 'Tem certeza que deseja remover esta postagem? Esta ação é irreversível. O usuário será notificado.',
        confirmText: 'Remover',
        keyword: 'REMOVER'
    });
    if (!confirmed) {
        return;
    }
    
    // Mostrar loading
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent;
    buttonElement.innerHTML = 'Removendo...';
    
    try {
        console.log('[DELETE-SUSPENSION] Iniciando remoção de postagem:', downloadId);
        const result = await AuthAPI.deleteSuspendedDownload(downloadId);
        console.log('[DELETE-SUSPENSION] Resposta recebida:', result);
        
        if (result && result.success) {
            showMessage('Postagem removida! Chamado resolvido e usuário notificado', 'success');
            await new Promise(resolve => setTimeout(resolve, 1500));
            loadedTabs.delete('suspended-posts');
            loadSuspendedPosts();
        } else {
            showMessage('Erro: ' + (result?.message || 'Resposta inválida da API'), 'error');
            buttonElement.disabled = false;
            buttonElement.textContent = originalText;
        }
    } catch (error) {
        console.error('[DELETE-SUSPENSION] Erro ao remover postagem:', error);
        showMessage('Erro ao remover: ' + error.message, 'error');
        buttonElement.disabled = false;
        buttonElement.textContent = originalText;
    }
}
// ===================== GERENCIAR PERMISSOES DE POSTAGEM =====================

async function loadPostPermissions() {
    const container = document.getElementById('postPermissionsContainer');
    const table = document.getElementById('postPermissionsTable');
    const tbody = document.getElementById('postPermissionsTableBody');
    
    try {
        const result = await AuthAPI.getUsersWithPostPermission();
        
        const users = (result.users || []).filter((user) => !isExampleEmail(user.email));

        if (result.success && users.length > 0) {
            tbody.innerHTML = users.map(user => `
                <tr>
                    <td><strong>${user.nickname}</strong></td>
                    <td>${maskEmail(user.email)}</td>
                    <td><span style="background: rgba(236, 72, 153, 0.3); padding: 4px 8px; border-radius: 3px;">${user.downloadCount}</span></td>
                    <td>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${user.canPostDownloads ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(244,114,182,0.2); border: 1px solid rgba(244,114,182,0.45); color: #F9A8D4; font-size: 11px;">Postar</span>' : ''}
                            ${user.canUploadDownloads ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(167,139,250,0.2); border: 1px solid rgba(167,139,250,0.45); color: #C4B5FD; font-size: 11px;">Enviar Arquivos</span>' : ''}
                            ${user.canManageDownloads ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(236,72,153,0.2); border: 1px solid rgba(236,72,153,0.45); color: #F472B6; font-size: 11px;">Administração de Downloads</span>' : ''}
                            ${user.canOrderFixedRanks ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.45); color: #FBBF24; font-size: 11px;">Ordenar Fixos</span>' : ''}
                            ${user.canAccessAdminPanel ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(16,185,129,0.2); border: 1px solid rgba(16,185,129,0.45); color: #34D399; font-size: 11px;">Painel Admin</span>' : ''}
                            ${user.canUseAnimatedProfile ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(56,189,248,0.2); border: 1px solid rgba(56,189,248,0.45); color: #38BDF8; font-size: 11px;">Card Animado</span>' : ''}
                            ${user.canChangeRankColor ? '<span style="padding: 3px 8px; border-radius: 999px; background: rgba(244,114,182,0.2); border: 1px solid rgba(244,114,182,0.45); color: #F472B6; font-size: 11px;">Mudar Cor da Conquista</span>' : ''}
                        </div>
                    </td>
                    <td>
                        <div style="display:flex; gap:8px; flex-wrap: wrap;">
                            <button
                                type="button"
                                class="edit-individual-permission-btn"
                                data-username="${escapeHtmlAdmin(user.nickname)}"
                                data-can-post-downloads="${Number(user.canPostDownloads) === 1 ? '1' : '0'}"
                                data-can-upload-downloads="${Number(user.canUploadDownloads) === 1 ? '1' : '0'}"
                                data-can-manage-downloads="${Number(user.canManageDownloads) === 1 ? '1' : '0'}"
                                data-can-order-fixed-ranks="${Number(user.canOrderFixedRanks) === 1 ? '1' : '0'}"
                                data-can-access-admin-panel="${Number(user.canAccessAdminPanel) === 1 ? '1' : '0'}"
                                data-can-use-animated-profile="${Number(user.canUseAnimatedProfile) === 1 ? '1' : '0'}"
                                data-can-change-rank-color="${Number(user.canChangeRankColor) === 1 ? '1' : '0'}"
                                style="padding: 6px 12px; background: #6B46C1; border: none; border-radius: 3px; color: white; cursor: pointer; font-weight: 600;"
                            >Editar</button>
                            <button
                                type="button"
                                class="clear-individual-permission-btn"
                                data-username="${escapeHtmlAdmin(user.nickname)}"
                                style="padding: 6px 12px; background: #FF6B6B; border: none; border-radius: 3px; color: white; cursor: pointer; font-weight: 600;"
                            >Revogar tudo</button>
                        </div>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('.edit-individual-permission-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const username = String(btn.dataset.username || '').trim();
                    if (!username) return;
                    prefillPermissionsForm(
                        username,
                        datasetBooleanFlag(btn.dataset.canPostDownloads),
                        datasetBooleanFlag(btn.dataset.canUploadDownloads),
                        datasetBooleanFlag(btn.dataset.canManageDownloads),
                        datasetBooleanFlag(btn.dataset.canOrderFixedRanks),
                        datasetBooleanFlag(btn.dataset.canAccessAdminPanel),
                        datasetBooleanFlag(btn.dataset.canUseAnimatedProfile),
                        datasetBooleanFlag(btn.dataset.canChangeRankColor)
                    );
                });
            });

            tbody.querySelectorAll('.clear-individual-permission-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const username = String(btn.dataset.username || '').trim();
                    if (!username) return;
                    clearIndividualPermissions(username);
                });
            });
            
            table.style.display = 'table';
            container.style.display = 'none';
        } else {
            container.innerHTML = '<p style="text-align: center; color: #999;">Nenhum usuário com permissões individuais</p>';
            container.style.display = 'block';
            table.style.display = 'none';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Erro ao carregar permissões</p>';
        console.error('Erro ao carregar permissões:', error);
    }
}

function datasetBooleanFlag(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function parsePermissionFlagsFromTableRow(row) {
    const tokens = Array.from(row?.querySelectorAll('td:nth-child(4) span') || [])
        .map((el) => String(el.textContent || '').trim().toLowerCase());

    const hasToken = (needle) => tokens.some((token) => token.includes(needle));
    return {
        canPostDownloads: hasToken('postar'),
        canUploadDownloads: hasToken('enviar arquivos'),
        canManageDownloads: hasToken('gerenciar downloads') || hasToken('administracao de downloads') || hasToken('administração de downloads'),
        canOrderFixedRanks: hasToken('ordenar fixos'),
        canAccessAdminPanel: hasToken('painel admin'),
        canUseAnimatedProfile: hasToken('card animado'),
        canChangeRankColor: hasToken('mudar cor da conquista')
    };
}

async function loadPostageRanks() {
    const container = document.getElementById('postageRanksContainer');
    
    try {
        const result = await AuthAPI.getPostageRanks();
        
        if (result.success && result.ranks && result.ranks.length > 0) {
            container.innerHTML = result.ranks.map(rank => `
                <div class="rank-card" style="flex-direction: column; align-items: flex-start; background: linear-gradient(135deg, ${rank.color}22, ${rank.color}11);">
                    <div style="display: flex; align-items: center; gap: 10px; width: 100%; margin-bottom: 10px;">
                        <div style="font-size: 32px;">${rank.icon}</div>
                        <div>
                            <h3 style="margin: 0; color: ${rank.color};">${rank.name}</h3>
                            <p style="margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.6);">Nevel ${rank.rankLevel}/10</p>
                        </div>
                    </div>
                    <p style="margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.7); width: 100%;">
                        <strong>${rank.minPostages} postagens</strong> necesserias
                    </p>
                    <small style="color: rgba(255, 255, 255, 0.6); margin-top: 8px;">${rank.description}</small>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<p style="text-align: center; color: #999;">Erro ao carregar conquistas</p>';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Erro ao carregar conquistas de postagem</p>';
        console.error('Erro:', error);
    }
}

function getPermissionsFromForm() {
    return {
        canPostDownloads: Boolean(document.getElementById('permCanPostDownloads')?.checked),
        canUploadDownloads: Boolean(document.getElementById('permCanUploadDownloads')?.checked),
        canManageDownloads: Boolean(document.getElementById('permCanManageDownloads')?.checked),
        canOrderFixedRanks: Boolean(document.getElementById('permCanOrderFixedRanks')?.checked),
        canAccessAdminPanel: Boolean(document.getElementById('permCanAccessAdminPanel')?.checked),
        canUseAnimatedProfile: Boolean(document.getElementById('permCanUseAnimatedProfile')?.checked),
        canChangeRankColor: Boolean(document.getElementById('permCanChangeRankColor')?.checked)
    };
}

function applyPermissionsToForm(permissions = {}) {
    if (document.getElementById('permCanPostDownloads')) {
        document.getElementById('permCanPostDownloads').checked = Boolean(permissions.canPostDownloads);
    }
    if (document.getElementById('permCanUploadDownloads')) {
        document.getElementById('permCanUploadDownloads').checked = Boolean(permissions.canUploadDownloads);
    }
    if (document.getElementById('permCanManageDownloads')) {
        document.getElementById('permCanManageDownloads').checked = Boolean(permissions.canManageDownloads);
    }
    if (document.getElementById('permCanOrderFixedRanks')) {
        document.getElementById('permCanOrderFixedRanks').checked = Boolean(permissions.canOrderFixedRanks);
    }
    if (document.getElementById('permCanAccessAdminPanel')) {
        document.getElementById('permCanAccessAdminPanel').checked = Boolean(permissions.canAccessAdminPanel);
    }
    if (document.getElementById('permCanUseAnimatedProfile')) {
        document.getElementById('permCanUseAnimatedProfile').checked = Boolean(permissions.canUseAnimatedProfile);
    }
    if (document.getElementById('permCanChangeRankColor')) {
        document.getElementById('permCanChangeRankColor').checked = Boolean(permissions.canChangeRankColor);
    }
}

function prefillPermissionsForm(username, canPostDownloads, canUploadDownloads, canManageDownloads, canOrderFixedRanks, canAccessAdminPanel, canUseAnimatedProfile, canChangeRankColor) {
    const userInput = document.getElementById('userForPermission');
    if (userInput) userInput.value = username;
    applyPermissionsToForm({
        canPostDownloads,
        canUploadDownloads,
        canManageDownloads,
        canOrderFixedRanks,
        canAccessAdminPanel,
        canUseAnimatedProfile,
        canChangeRankColor
    });

    const form = document.getElementById('grantPermissionForm');
    if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (userInput) {
        userInput.focus();
        userInput.select();
    }
    showMessage(`Permissões de ${username} carregadas para edição.`, 'success');
}

async function saveIndividualPermissions(username) {
    const permissions = getPermissionsFromForm();
    try {
        const result = await AuthAPI.setUserPermissions(username, permissions);
        if (result.success) {
            showMessage(`Permissões salvas para ${username}!`, 'success');
            document.getElementById('userForPermission').value = '';
            applyPermissionsToForm({
                canPostDownloads: false,
                canUploadDownloads: false,
                canManageDownloads: false,
                canOrderFixedRanks: false,
                canAccessAdminPanel: false,
                canUseAnimatedProfile: false,
                canChangeRankColor: false
            });
            loadPostPermissions();
        } else {
            showMessage('Erro: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('Erro ao salvar permissões: ' + error.message, 'error');
    }
}

async function clearIndividualPermissions(username) {
    const confirmed = await showThemeConfirm(
        'Revogar Permissões',
        `Tem certeza que deseja revogar todas as permissões de ${username}?`,
        {
            confirmText: 'Revogar',
            cancelText: 'Cancelar',
            danger: true
        }
    );
    if (!confirmed) {
        return;
    }
    
    try {
        const result = await AuthAPI.setUserPermissions(username, {
            canPostDownloads: false,
            canUploadDownloads: false,
            canManageDownloads: false,
            canOrderFixedRanks: false,
            canAccessAdminPanel: false,
            canUseAnimatedProfile: false,
            canChangeRankColor: false
        });
        if (result.success) {
            showMessage(`Permissões removidas de ${username}!`, 'success');
            loadPostPermissions();
        } else {
            showMessage('Erro: ' + result.message, 'error');
        }
    } catch (error) {
        showMessage('Erro ao remover permissões: ' + error.message, 'error');
    }
}

if (typeof window !== 'undefined') {
    window.prefillPermissionsForm = prefillPermissionsForm;
    window.clearIndividualPermissions = clearIndividualPermissions;
}

    } catch (err) {
        console.error('Erro no admin script (DOMContentLoaded):', err);
    }
});
