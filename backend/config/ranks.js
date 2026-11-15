// Sistema de 14 conquistas progressivas com progressão até 1095 dias
export const RANKS = [
    {
        level: 1,
        name: 'Membro Inicial',
        minDays: 0,
        maxDays: 7,
        color: '#64748B',
        icon: '\u{1F7E3}',
        description: 'Bem-vindo! Você é um novo membro da guild.'
    },
    {
        level: 2,
        name: 'Membro Novato',
        minDays: 7,
        maxDays: 21,
        color: '#3B82F6',
        icon: '\u{1F52E}',
        description: 'Você está se adaptando à comunidade.'
    },
    {
        level: 3,
        name: 'Membro Iniciado',
        minDays: 21,
        maxDays: 45,
        color: '#06B6D4',
        icon: '\u2B50',
        description: 'Iniciado nos mistérios da guild.'
    },
    {
        level: 4,
        name: 'Membro Aprendiz',
        minDays: 45,
        maxDays: 75,
        color: '#14B8A6',
        icon: '\u2728',
        description: 'Aprendiz dedicado.'
    },
    {
        level: 5,
        name: 'Membro Experiente',
        minDays: 75,
        maxDays: 120,
        color: '#22C55E',
        icon: '\u{1F331}',
        description: 'Novato em ascensão.'
    },
    {
        level: 6,
        name: 'Membro Adepto',
        minDays: 120,
        maxDays: 180,
        color: '#84CC16',
        icon: '\u{1F4DA}',
        description: 'Mestre em aprendizado.'
    },
    {
        level: 7,
        name: 'Membro Especialista',
        minDays: 180,
        maxDays: 250,
        color: '#FACC15',
        icon: '\u{1F525}',
        description: 'Especialista da guild.'
    },
    {
        level: 8,
        name: 'Membro Mestre',
        minDays: 250,
        maxDays: 335,
        color: '#F59E0B',
        icon: '\u2694\uFE0F',
        description: 'Mestre guerreiro.'
    },
    {
        level: 9,
        name: 'Grande Mestre',
        minDays: 335,
        maxDays: 430,
        color: '#F97316',
        icon: '\u{1F451}',
        description: 'Grande Mestre da guild.'
    },
    {
        level: 10,
        name: 'Membro Lendário',
        minDays: 430,
        maxDays: 540,
        color: '#EF4444',
        icon: '\u{1F3C6}',
        description: 'Lendário entre os seus.'
    },
    {
        level: 11,
        name: 'Membro Mítico',
        minDays: 540,
        maxDays: 665,
        color: '#E11D48',
        icon: '\u{1F984}',
        description: 'Ser mítico da comunidade.'
    },
    {
        level: 12,
        name: 'Membro Transcendente',
        minDays: 665,
        maxDays: 805,
        color: '#C026D3',
        icon: '\u{1F30C}',
        description: 'Transcendente em poder.'
    },
    {
        level: 13,
        name: 'Membro Eterno',
        minDays: 805,
        maxDays: 950,
        color: '#D946EF',
        icon: '\u{1F4AB}',
        description: 'Membro eterno da guild.'
    },
    {
        level: 14,
        name: 'Membro Imortal',
        minDays: 950,
        maxDays: 1095,
        color: '#FF2D95',
        icon: '\u{1F47C}',
        description: 'Imortal, símbolo vivo da HOLIDAY Guild.'
    }
];

function getFullDaysSince(createdAtDate) {
    const now = new Date();
    const created = new Date(createdAtDate);
    const diffTime = Math.abs(now - created);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function calculateRank(createdAtDate) {
    // Contar somente dias completos para evitar avançar rank antes da hora.
    const diffDays = getFullDaysSince(createdAtDate);

    for (let rank of RANKS) {
        if (diffDays >= rank.minDays && diffDays < rank.maxDays) {
            return rank;
        }
    }

    return RANKS[RANKS.length - 1];
}

// Retorna o último rank automático realmente conquistado.
// Exemplo: usuário no intervalo de Alpha ainda exibe Beta como conquistado.
export function calculateCompletedRank(createdAtDate) {
    const diffDays = getFullDaysSince(createdAtDate);
    let completedRank = RANKS[0];

    for (const rank of RANKS) {
        if (diffDays >= rank.maxDays) {
            completedRank = rank;
            continue;
        }
        break;
    }

    return completedRank;
}

export function calculateRankProgress(createdAtDate) {
    // Mesmo criterio da funcao calculateRank: apenas dias completos.
    const diffDays = getFullDaysSince(createdAtDate);

    // Encontrar o conquista atual
    let currentRank = null;
    for (let rank of RANKS) {
        if (diffDays >= rank.minDays && diffDays < rank.maxDays) {
            currentRank = rank;
            break;
        }
    }

    // Se não achou, é o imortal
    if (!currentRank) {
        currentRank = RANKS[RANKS.length - 1];
    }

    // Calcular progresso dentro do conquista atual
    const daysInRank = diffDays - currentRank.minDays;
    const rangeSize = currentRank.maxDays - currentRank.minDays;
    const progressPercent = Math.min(100, Math.max(0, (daysInRank / rangeSize) * 100));

    return {
        currentRank,
        currentDays: diffDays,
        daysInCurrentRank: daysInRank,
        daysUntilNextRank: Math.max(0, currentRank.maxDays - diffDays),
        progressPercent,
        totalDaysInRank: rangeSize
    };
}

export function getRankByLevel(level) {
    return RANKS.find(r => r.level === level) || RANKS[0];
}

// conquistas customizados - apenas para atribuição manual
export const CUSTOM_RANKS = {
    'Fundador': { 
        level: 'founder',
        color: '#FFD700', 
        icon: 'FOUNDER',
        description: 'Fundador e proprietario da HOLIDAY Guild'
    },
    'Administrador': { 
        level: 'admin',
        color: '#FF0000', 
        icon: '\u{1F6E1}\uFE0F',
        description: 'Administrador da guild'
    },
    'Moderador': { 
        level: 'mod',
        color: '#0066FF', 
        icon: '\u2696\uFE0F',
        description: 'Moderador da comunidade'
    },
    'Amigo (A)': { 
        level: 'friend',
        color: '#00FF00', 
        icon: '\u2764\uFE0F',
        description: 'Amigo especial da guild'
    },
    'Ajudante': { 
        level: 'helper',
        color: '#FF9900', 
        icon: '\u{1F91D}',
        description: 'Ajudante da comunidade'
    },
    'Experiente': { 
        level: 'experienced',
        color: '#FFD700', 
        icon: '\u{1F4D6}',
        description: 'Membro experiente'
    },
    'Ultraboss': { 
        level: 'ultraboss',
        color: '#FF00FF', 
        icon: '\u{1F479}',
        description: 'Boss supremo'
    },
    'Ex-PRO': { 
        level: 'expro',
        color: '#C0C0C0', 
        icon: '\u2B50',
        description: 'Ex-membro PRO'
    },
    'PRO': { 
        level: 'pro',
        color: '#FFD700', 
        icon: '\u{1F48E}',
        description: 'Membro PRO da guild'
    }
};

export function getCustomRankByName(rankName) {
    return CUSTOM_RANKS[rankName] || null;
}

export default RANKS;


