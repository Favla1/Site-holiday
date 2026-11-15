import db from '../config/database.js';

export class PostageRank {
    /**
     * Calcula o nível de conquista baseado no número de postagens
     * Retorna informações do conquista correspondente
     */
    static async calculateRankByPostages(userId) {
        return new Promise((resolve, reject) => {
            // Contar postagens do usuário
            db.get(
                `SELECT COUNT(*) as postageCount FROM downloads WHERE userId = ?`,
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    
                    const postageCount = row ? row.postageCount : 0;
                    
                    // Encontrar o conquista correspondente
                    db.get(
                        `SELECT * FROM postage_ranks 
                         WHERE minPostages <= ? 
                         ORDER BY rankLevel DESC 
                         LIMIT 1`,
                        [postageCount],
                        (err, rank) => {
                            if (err) reject(err);
                            
                            resolve({
                                postageCount,
                                rank: rank || {
                                    rankLevel: 0,
                                    minPostages: 0,
                                    name: 'Sem conquista',
                                    color: '#6B7280',
                                    icon: '-',
                                    description: 'Faça sua primeira postagem'
                                }
                            });
                        }
                    );
                }
            );
        });
    }

    /**
     * Obtém o próximo conquista que o usuário pode conquistar
     */
    static getNextRank(currentPostageCount) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM postage_ranks 
                 WHERE minPostages > ? 
                 ORDER BY rankLevel ASC 
                 LIMIT 1`,
                [currentPostageCount],
                (err, rank) => {
                    if (err) reject(err);
                    
                    if (rank) {
                        const needed = rank.minPostages - currentPostageCount;
                        resolve({
                            ...rank,
                            postagensNeeded: needed
                        });
                    } else {
                        resolve(null); // J? tem o máximo
                    }
                }
            );
        });
    }

    /**
     * Obtém todos os conquistas disponíveis
     */
    static getAllRanks() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM postage_ranks ORDER BY rankLevel ASC`,
                (err, rows) => {
                    if (err) reject(err);
                    resolve(rows || []);
                }
            );
        });
    }

    /**
     * Obtém informações do conquista de um usuário e próximo conquista
     */
    static getUserRankInfo(userId) {
        return new Promise(async (resolve, reject) => {
            try {
                const currentInfo = await this.calculateRankByPostages(userId);
                const nextRank = await this.getNextRank(currentInfo.postageCount);
                
                resolve({
                    postageCount: currentInfo.postageCount,
                    currentRank: currentInfo.rank,
                    nextRank: nextRank,
                    progress: nextRank ? {
                        current: currentInfo.postageCount,
                        needed: nextRank.minPostages,
                        remaining: nextRank.postagensNeeded,
                        percentage: Math.round((currentInfo.postageCount / nextRank.minPostages) * 100)
                    } : {
                        current: currentInfo.postageCount,
                        needed: 300,
                        remaining: 0,
                        percentage: 100
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }
}

export default PostageRank;


