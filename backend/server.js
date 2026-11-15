import './load-env.js';

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './config/database.js';
import { initializeAdmin } from './config/init-admin.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import ranksRoutes from './routes/ranks.js';
import downloadsRoutes from './routes/downloads.js';
import gifsRoutes from './routes/gifs.js';
import eventsRoutes from './routes/events.js';
import { startEventBroadcaster } from './utils/event-broadcaster.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const frontendRoot = path.join(__dirname, '..');
const blockedFrontendPatterns = [
    /^\/backend(?:\/|$)/i,
    /^\/database(?:\/|$)/i,
    /^\/node_modules(?:\/|$)/i,
    /^\/ssl(?:\/|$)/i,
    /^\/(?:debug|test)[^/]*\.(?:html|js|py)$/i,
    /^\/(?:check|fix|create|verify|reset|manual|login-token|clear-and-test)[^/]*\.(?:html|js|py)$/i,
    /\.md$/i,
    /\.py$/i
];

// Evita que o processo caia silenciosamente durante erros inesperados em runtime.
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
const allowedOrigins = new Set([
    process.env.FRONTEND_URL
].filter(Boolean));
const localHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const allowVercelPreviews = String(process.env.ALLOW_VERCEL_PREVIEWS || 'true').toLowerCase() === 'true';
const allowDiscloudDomains = String(process.env.ALLOW_DISCLOUD_DOMAINS || 'true').toLowerCase() === 'true';

app.use(cors({
    origin: (origin, callback) => {
        // Permitir ferramentas sem origin (ex.: curl/postman)
        if (!origin) {
            callback(null, true);
            return;
        }

        if (allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }

        // Permitir frontend local durante desenvolvimento.
        try {
            const parsed = new URL(origin);
            if (localHostnames.has(parsed.hostname)) {
                callback(null, true);
                return;
            }
        } catch (error) {
            // Segue para as outras validações.
        }

        if (allowVercelPreviews) {
            try {
                const parsed = new URL(origin);
                if (parsed.hostname.endsWith('.vercel.app')) {
                    callback(null, true);
                    return;
                }
            } catch (error) {
                // Segue para rejeição abaixo
            }
        }

        if (allowDiscloudDomains) {
            try {
                const parsed = new URL(origin);
                if (parsed.hostname.endsWith('.discloud.app') || parsed.hostname.endsWith('.discloud.dev')) {
                    callback(null, true);
                    return;
                }
            } catch (error) {
                // Segue para rejeição abaixo
            }
        }

        callback(new Error('CORS bloqueado para esta origem'));
    },
    credentials: true
}));

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Servir arquivos estáticos (imagens)
app.use('/imagens', express.static(path.join(__dirname, '../imagens')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ranks', ranksRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/gifs', gifsRoutes);
app.use('/api/events', eventsRoutes);

// Fallback de frontend pela mesma porta da API para manter o site acessivel
// mesmo quando o servidor estatico separado nao estiver disponivel.
app.use((req, res, next) => {
    const requestPath = String(req.path || '');
    if (
        requestPath.startsWith('/api') ||
        requestPath.startsWith('/uploads') ||
        requestPath.startsWith('/imagens')
    ) {
        return next();
    }

    if (blockedFrontendPatterns.some((pattern) => pattern.test(requestPath))) {
        return res.status(404).send('Not Found');
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return next();
});

app.use(express.static(frontendRoot, { index: false }));

app.get('*.html', (req, res, next) => {
    const safePath = String(req.path || '').replace(/^\/+/, '');
    if (!safePath) return next();
    return res.sendFile(path.join(frontendRoot, safePath));
});

// Rota raiz
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendRoot, 'index.html'));
});

// Rota de teste
app.get('/api/health', (req, res) => {
    res.json({ status: 'API rodando' });
});

// Iniciar servidor
// Em produção, plataformas como Discloud normalmente exigem porta 8080.
// Handler de erros de upload para respostas JSON consistentes.
app.use((err, req, res, next) => {
    if (!err) return next();

    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            const isCommentAttachment = String(req.originalUrl || req.path || '').includes('/comments');
            const isDownloadUpload = String(req.originalUrl || req.path || '').includes('/downloads/upload-file');
            return res.status(400).json({
                success: false,
                message: isCommentAttachment
                    ? 'Arquivo muito grande. Limite de 500MB para anexos em comentários.'
                    : isDownloadUpload
                        ? 'Arquivo muito grande. Limite de 500MB para uploads de download.'
                        : 'Arquivo muito grande. Limite de 15MB.'
            });
        }

        return res.status(400).json({
            success: false,
            message: err.message || 'Erro no upload do arquivo.'
        });
    }

    if (String(err.message || '').includes('aceita apenas')) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }

    return next(err);
});

// Fallback de erro para API.
app.use((err, req, res, next) => {
    console.error('[API ERROR]', err);
    if (String(req.path || '').startsWith('/api/')) {
        return res.status(500).json({ success: false, message: 'Erro interno do servidor.' });
    }
    return next(err);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔════════════════════════════════════════╗
║  HOLIDAY Guild Auth System             ║
║  Servidor rodando na porta ${PORT}      ║
║  http://localhost:${PORT}              ║
╚════════════════════════════════════════╝
    `);

    // Inicializar admin/fundador
    try {
        await initializeAdmin();
    } catch (error) {
        console.error('[INIT] Erro ao inicializar admin:', error);
    }

    // Iniciar agendador de envio de e-mails de eventos
    try {
        startEventBroadcaster();
    } catch (e) {
        console.error('[INIT] Erro ao iniciar event broadcaster:', e);
    }
});

export default app;
