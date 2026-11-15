import express from 'express';

const router = express.Router();

router.get('/config', (_req, res) => {
    const apiKey = String(process.env.GIPHY_API_KEY || '').trim();
    if (!apiKey) {
        return res.status(503).json({
            success: false,
            message: 'Configure GIPHY_API_KEY no arquivo .env para ativar a busca de GIFs.'
        });
    }

    return res.json({ success: true, apiKey });
});

export default router;
