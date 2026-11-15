// As variáveis de ambiente já foram carregadas pelo server.js
// Nós simplesmente as exportamos aqui para usar em outros arquivos

export const emailUser = process.env.EMAIL_USER;
export const emailPass = process.env.EMAIL_PASS;
export const emailHost = process.env.EMAIL_HOST || 'smtp.gmail.com';
export const emailPort = process.env.EMAIL_PORT || 465;
export const emailRelayUrl = String(process.env.EMAIL_RELAY_URL || '').trim();
export const emailRelayToken = String(process.env.EMAIL_RELAY_TOKEN || '').trim();
export const googleClientId = process.env.GOOGLE_CLIENT_ID;

console.log('[CONFIG] Email credentials loaded:');
console.log('[CONFIG] EMAIL_USER:', emailUser ? 'SET' : 'NOT SET');
console.log('[CONFIG] EMAIL_PASS:', emailPass ? 'SET' : 'NOT SET');
