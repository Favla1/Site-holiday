// Shared navigation script (menu only)
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    const navItems = document.querySelectorAll('.nav-link');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (navLinks) navLinks.classList.remove('active');
        });
    });

    document.addEventListener('click', (e) => {
        if (navLinks && !e.target.closest('.navbar')) {
            navLinks.classList.remove('active');
        }
    });

    function toDataUri(svg) {
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    function svgBase(label = 'IMG') {
        return toDataUri(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#1f1b3f"/>
                        <stop offset="100%" stop-color="#3d2f7a"/>
                    </linearGradient>
                </defs>
                <rect width="160" height="100" rx="10" fill="url(#g)"/>
                <text x="80" y="58" text-anchor="middle" font-size="16" fill="#80e9ff" font-family="Arial, sans-serif">${label}</text>
            </svg>`
        );
    }

    function svgIcon(type = 'unknown') {
        const paths = {
            whatsapp: '<path d="M12.04 2a9.93 9.93 0 0 0-8.52 15.03L2 22l5.12-1.34A9.93 9.93 0 1 0 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.04.8.81-2.96-.2-.3a8.12 8.12 0 1 1 6.86 3.77Zm4.45-6.08c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.58.18 1.1.15 1.51.09.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/>',
            discord: '<path d="M19.7 5.3A18.2 18.2 0 0 0 15.2 4l-.56 1.14a16.7 16.7 0 0 0-5.28 0L8.8 4a18.2 18.2 0 0 0-4.5 1.3C1.45 9.5.68 13.6 1.07 17.64a18.3 18.3 0 0 0 5.52 2.8l1.2-1.95c-.66-.24-1.28-.55-1.87-.91l.46-.36a13 13 0 0 0 11.24 0l.46.36c-.59.36-1.21.67-1.87.91l1.2 1.95a18.3 18.3 0 0 0 5.52-2.8c.47-4.68-.8-8.74-3.23-12.34ZM8.7 14.9c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2.02.99 2 2.2c0 1.21-.88 2.2-2 2.2Zm6.6 0c-1.1 0-2-.99-2-2.2s.88-2.2 2-2.2 2.02.99 2 2.2c0 1.21-.88 2.2-2 2.2Z"/>',
            notifications: '<path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/>',
            login: '<path d="M10 17v-3H3v-4h7V7l5 5-5 5Zm9-14H5a2 2 0 0 0-2 2v2h2V5h14v14H5v-2H3v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/>',
            logout: '<path d="M14 17v-3H3v-4h11V7l5 5-5 5Zm5-14H5a2 2 0 0 0-2 2v2h2V5h14v14H5v-2H3v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/>',
            unknown: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm2.07-7.75-.9.92C13.45 11.9 13 12.5 13 14h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26A2 2 0 1 0 10 8H8a4 4 0 1 1 7.07 2.25Z"/>'
        };
        if (paths[type]) {
            return toDataUri(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${paths[type]}</svg>`
            );
        }

        return toDataUri(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                <rect x="1" y="1" width="30" height="30" rx="8" fill="#1f1b3f" stroke="#ec4899" stroke-width="2"/>
                <text x="16" y="21" text-anchor="middle" font-size="14" fill="#80e9ff" font-family="Arial, sans-serif">${type}</text>
            </svg>`
        );
    }

    function svgAvatar() {
        return toDataUri(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
                <defs>
                    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#1f1b3f"/>
                        <stop offset="100%" stop-color="#3d2f7a"/>
                    </linearGradient>
                </defs>
                <circle cx="60" cy="60" r="58" fill="url(#a)" stroke="#ec4899" stroke-width="4"/>
                <circle cx="60" cy="45" r="18" fill="#80e9ff" fill-opacity="0.85"/>
                <rect x="28" y="68" width="64" height="30" rx="15" fill="#80e9ff" fill-opacity="0.85"/>
            </svg>`
        );
    }

    function svgUpload() {
        return toDataUri(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                <rect x="1" y="1" width="30" height="30" rx="8" fill="#1f1b3f" stroke="#ec4899" stroke-width="2"/>
                <path d="M16 8l-6 6h4v7h4v-7h4z" fill="#80e9ff"/>
            </svg>`
        );
    }

    function resolveFallbackSource(img) {
        const alt = String(img.alt || '').toLowerCase();

        if (img.classList.contains('navbar-icon')) {
            if (alt.includes('whatsapp')) return svgIcon('whatsapp');
            if (alt.includes('discord')) return svgIcon('discord');
            if (alt.includes('notifica')) return svgIcon('notifications');
            if (alt.includes('login')) return svgIcon('login');
            if (alt.includes('sair') || img.closest('.btn-logout')) return svgIcon('logout');
            return svgIcon('unknown');
        }

        if (img.classList.contains('banner-img')) {
            return svgBase(String(img.alt || 'CARD').slice(0, 10).toUpperCase());
        }

        if (
            img.classList.contains('user-avatar') ||
            img.classList.contains('profile-avatar') ||
            alt.includes('avatar')
        ) {
            return svgAvatar();
        }

        if (img.classList.contains('upload-btn-icon')) {
            return svgUpload();
        }

        if (alt.includes('verificado')) {
            return svgIcon('V');
        }

        return svgBase('IMG');
    }

    function applyImageFallback(img) {
        if (!(img instanceof HTMLImageElement)) return;
        if (img.dataset.fallbackApplied === '1') return;
        img.dataset.fallbackApplied = '1';
        img.src = resolveFallbackSource(img);
    }

    function createEventBanner(event) {
        if (!event || !event.name) return null;

        const banner = document.createElement('div');
        banner.className = 'active-event-banner';
        banner.style.cssText = [
            'background:#111827',
            'color:#f8fafc',
            'padding:12px 14px',
            'font-size:0.95rem',
            'text-align:center',
            'position:relative',
            'z-index:9999',
            'box-shadow:0 2px 14px rgba(0,0,0,0.18)',
            'border-bottom:1px solid rgba(255,255,255,0.08)',
            'font-family:system-ui, sans-serif'
        ].join(';');

        const title = document.createElement('strong');
        title.textContent = `${event.name} está ativo`;
        banner.appendChild(title);

        if (event.description) {
            const text = document.createElement('span');
            text.textContent = ` — ${event.description}`;
            text.style.marginLeft = '8px';
            banner.appendChild(text);
        }

        if (event.eventStartDate || event.eventEndDate) {
            const dateText = document.createElement('span');
            dateText.textContent = ` (${event.eventStartDate || 'início desconhecido'} → ${event.eventEndDate || 'fim desconhecido'})`;
            dateText.style.marginLeft = '8px';
            banner.appendChild(dateText);
        }

        return banner;
    }

    function scanBrokenImages() {
        document.querySelectorAll('img').forEach((img) => {
            if (img.dataset.fallbackApplied === '1') return;
            // Complete + largura zero normalmente indica erro de carregamento.
            if (img.complete && (!img.naturalWidth || img.naturalWidth < 1)) {
                applyImageFallback(img);
            }
        });
    }

    document.addEventListener(
        'error',
        (event) => {
            const target = event.target;
            if (target instanceof HTMLImageElement) {
                applyImageFallback(target);
            }
        },
        true
    );

    // Primeira varredura imediata
    scanBrokenImages();

    // Aplicar tema de evento ativo (se houver)
    (async () => {
        try {
            const resp = await fetch('/api/events/active');
            const data = await resp.json();
            if (data?.success && data?.event) {
                const ev = data.event;
                const themeCss = ev.themeCssUrl || (ev.themeName ? `/themes/${ev.themeName}.css` : null);
                if (themeCss) {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = themeCss;
                    document.head.appendChild(link);
                }
                document.body.dataset.activeEvent = ev.name;

                const banner = createEventBanner(ev);
                if (banner) {
                    const firstChild = document.body.firstElementChild;
                    if (firstChild) {
                        document.body.insertBefore(banner, firstChild);
                    } else {
                        document.body.appendChild(banner);
                    }
                }
            }
        } catch (e) {
            console.warn('Não foi possível aplicar tema de evento ativo:', e);
        }
    })();

    // Segunda varredura quando tudo da pagina terminar de carregar
    window.addEventListener('load', () => {
        scanBrokenImages();
    });

    // Varreduras extras para casos de 404 que chegam depois do DOMContentLoaded
    let retries = 0;
    const maxRetries = 8;
    const timer = setInterval(() => {
        retries += 1;
        scanBrokenImages();
        if (retries >= maxRetries) {
            clearInterval(timer);
        }
    }, 1200);
});
