import db from './database.js';

const OWNER_EMAIL = 'sustmanrft@hotmail.com';

export async function initializeAdmin() {
    return new Promise((resolve, reject) => {
        // Verificar se já existe um admin
        db.get(
            'SELECT id FROM users WHERE email = ? AND isAdmin = 1',
            [OWNER_EMAIL],
            (err, row) => {
                if (err) {
                    console.error('[INIT] Erro ao verificar admin:', err);
                    return reject(err);
                }

                if (row) {
                    console.log('[INIT] Admin já existe');
                    return resolve();
                }

                // Admin não existe, tentar encontrar o usuário pelo email e torná-lo admin
                db.get(
                    'SELECT id FROM users WHERE email = ?',
                    [OWNER_EMAIL],
                    (err, user) => {
                        if (err) {
                            console.error('[INIT] Erro ao buscar usuário:', err);
                            return reject(err);
                        }

                        if (user) {
                            // Usuário existe, fazer admin
                            db.run(
                                'UPDATE users SET isAdmin = 1, canAccessAdminPanel = 1 WHERE id = ?',
                                [user.id],
                                (err) => {
                                    if (err) {
                                        console.error('[INIT] Erro ao atualizar admin:', err);
                                        return reject(err);
                                    }
                                    console.log('[INIT] Admin promovido com sucesso');
                                    resolve();
                                }
                            );
                        } else {
                            // Usuário não existe, apenas resolver (será criado no primeiro login)
                            console.log('[INIT] Usuário owner não encontrado (será criado no primeiro login)');
                            resolve();
                        }
                    }
                );
            }
        );
    });
}
