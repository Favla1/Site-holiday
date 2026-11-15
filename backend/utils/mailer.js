import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { emailUser, emailPass, emailHost, emailPort, emailRelayUrl, emailRelayToken } from '../config/env.js';

// Configurar nodemailer
const transporter = nodemailer.createTransport({
    host: emailHost,
    port: Number(emailPort) || 465,
    secure: Number(emailPort) === 465,
    requireTLS: Number(emailPort) === 587,
    auth: {
        user: emailUser,
        pass: emailPass
    }
});

async function serializeAttachment(attachment) {
    let content;
    if (Buffer.isBuffer(attachment.content) || attachment.content instanceof Uint8Array) {
        content = Buffer.from(attachment.content);
    } else if (typeof attachment.content === 'string') {
        const encoding = String(attachment.encoding || 'utf8').toLowerCase();
        const supportedEncodings = new Set(['ascii', 'base64', 'binary', 'hex', 'latin1', 'ucs-2', 'ucs2', 'utf-8', 'utf8', 'utf16le']);
        if (!supportedEncodings.has(encoding)) {
            throw new Error(`Encoding de anexo não suportado: ${encoding}`);
        }
        content = Buffer.from(attachment.content, encoding);
    } else if (attachment.path) {
        content = await readFile(attachment.path);
    } else {
        throw new Error('Anexo sem conteúdo ou caminho de arquivo válido');
    }

    return {
        filename: String(attachment.filename || (attachment.path ? basename(attachment.path) : 'attachment')),
        contentType: String(attachment.contentType || 'application/octet-stream'),
        contentBase64: content.toString('base64'),
        size: content.length
    };
}

async function sendViaEmailRelay({ to, subject, html, text, attachments }) {
    if (!emailRelayUrl || !emailRelayToken) {
        throw new Error('EMAIL_RELAY_URL e EMAIL_RELAY_TOKEN precisam ser configurados juntos');
    }

    let relayUrl;
    try {
        relayUrl = new URL(emailRelayUrl);
    } catch {
        throw new Error('EMAIL_RELAY_URL inválida');
    }
    if (relayUrl.protocol !== 'https:') {
        throw new Error('EMAIL_RELAY_URL precisa usar HTTPS');
    }

    const serializedAttachments = [];
    let totalAttachmentBytes = 0;
    for (const attachment of attachments) {
        const serialized = await serializeAttachment(attachment);
        totalAttachmentBytes += serialized.size;
        if (totalAttachmentBytes > 20 * 1024 * 1024) {
            throw new Error('O tamanho total dos anexos excede o limite de 20 MB');
        }
        delete serialized.size;
        serializedAttachments.push(serialized);
    }

    const response = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            token: emailRelayToken,
            to,
            subject,
            html,
            text,
            attachments: serializedAttachments
        }),
        signal: AbortSignal.timeout(30_000)
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('O relay de e-mail retornou uma resposta inválida');
    }

    if (!response.ok || result?.success !== true) {
        throw new Error(result?.error || `Falha no relay de e-mail (HTTP ${response.status})`);
    }

    return result;
}

export async function sendEmail(to, subject, html, attachments = [], text = '') {
    if (!to) {
        throw new Error('Destinatário de e-mail inválido');
    }

    if (Boolean(emailRelayUrl) !== Boolean(emailRelayToken)) {
        throw new Error('EMAIL_RELAY_URL e EMAIL_RELAY_TOKEN precisam ser configurados juntos');
    }

    try {
        if (emailRelayUrl && emailRelayToken) {
            console.log('[EMAIL] Transporte selecionado: relay HTTPS');
            const result = await sendViaEmailRelay({ to, subject, html, text, attachments });
            console.log(`[EMAIL] Email enviado pelo relay para ${to}`);
            return result;
        }

        console.log('[EMAIL] Transporte selecionado: SMTP');
        if (!emailUser || !emailPass) {
            throw new Error('SMTP não configurado: faltam EMAIL_USER ou EMAIL_PASS');
        }

        const mailOptions = {
            from: `"HOLIDAY Guild" <${emailUser}>`,
            replyTo: emailUser,
            to: to,
            subject: subject,
            html: html,
            ...(text ? { text } : {})
        };

        if (Array.isArray(attachments) && attachments.length > 0) {
            mailOptions.attachments = attachments;
        }

        const result = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Email enviado com sucesso para ${to}`);
        return result;
    } catch (error) {
        console.error(`[EMAIL] Erro ao enviar email para ${to}:`, error.message || error);
        throw error;
    }
}

export default transporter;
