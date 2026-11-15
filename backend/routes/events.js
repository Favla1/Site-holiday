import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// Rota pública: retornar evento especial ativo (primeiro que combinar com datas)
router.get('/active', async (req, res) => {
    try {
        const nowIso = new Date().toISOString();

        db.get(`SELECT * FROM custom_ranks WHERE isSpecial = 1 AND COALESCE(generatedFromTemplate, 0) = 0 AND (eventStartDate IS NULL OR DATE(eventStartDate) <= DATE(?)) AND (eventEndDate IS NULL OR DATE(eventEndDate) >= DATE(?)) ORDER BY eventStartDate ASC LIMIT 1`, [nowIso, nowIso], (err, row) => {
            if (err) {
                console.error('[EVENTS] active', err);
                return res.status(500).json({ success: false, message: 'Erro ao buscar evento ativo' });
            }
            if (!row) return res.json({ success: true, event: null });
            let eventAttachments = [];
            try { eventAttachments = row.eventAttachments ? JSON.parse(row.eventAttachments) : []; } catch (e) { eventAttachments = []; }
            return res.json({ success: true, event: { ...row, eventAttachments } });
        });
    } catch (error) {
        console.error('[EVENTS] active', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// Rota pública: listar eventos especiais públicos
router.get('/', async (req, res) => {
    try {
        db.all(`SELECT id, name, color, icon, description, themeName, themeCssUrl, eventStartDate, eventEndDate, eventCategory, eventAttachments FROM custom_ranks WHERE isSpecial = 1 AND COALESCE(generatedFromTemplate, 0) = 0 ORDER BY createdAt DESC`, [], (err, rows) => {
            if (err) {
                console.error('[EVENTS] list', err);
                return res.status(500).json({ success: false, message: 'Erro ao listar eventos' });
            }
            const events = (rows || []).map((row) => {
                let eventAttachments = [];
                try { eventAttachments = row.eventAttachments ? JSON.parse(row.eventAttachments) : []; } catch (e) { eventAttachments = []; }
                return { ...row, eventAttachments };
            });
            res.json({ success: true, events });
        });
    } catch (error) {
        console.error('[EVENTS] list', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

export default router;
