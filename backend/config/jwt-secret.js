const DEVELOPMENT_JWT_SECRET = 'holiday-dev-secret-key';

export function getJwtSecret() {
    const secret = String(process.env.JWT_SECRET || '').trim();
    if (secret) {
        if (process.env.NODE_ENV === 'production' && secret.length < 32) {
            throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres em produção.');
        }
        return secret;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET precisa ser configurado para executar em produção.');
    }

    return DEVELOPMENT_JWT_SECRET;
}
