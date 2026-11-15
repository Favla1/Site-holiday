function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderEmail({ preheader, title, greeting = '', intro, content, noticeTitle, notice, signature = 'Equipe HOLIDAY Guild' }) {
    const safePreheader = escapeHtml(preheader);
    const safeTitle = escapeHtml(title);
    const safeGreeting = greeting ? `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#111827;">Olá, ${escapeHtml(greeting)}.</p>` : '';
    const safeIntro = escapeHtml(intro);
    const securityNotice = notice
        ? `<tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-left:4px solid #6B46C1;background:#F5F3FF;border-radius:4px;"><tr><td style="padding:14px 16px;"><p style="margin:0 0 4px;color:#4C1D95;font-size:13px;font-weight:700;">${escapeHtml(noticeTitle || 'Importante')}</p><p style="margin:0;color:#4B5563;font-size:13px;line-height:1.6;">${escapeHtml(notice)}</p></td></tr></table></td></tr>`
        : '';

    const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${safeTitle}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="display:none;font-size:1px;color:#F3F4F6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePreheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
<tr><td style="padding:22px 32px;background:#111827;border-bottom:4px solid #EC4899;"><p style="margin:0;color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:2px;">HOLIDAY <span style="color:#F9A8D4;">GUILD</span></p><p style="margin:7px 0 0;color:#CBD5E1;font-size:12px;">SEGURANÇA E ACESSO À SUA CONTA</p></td></tr>
<tr><td style="padding:30px 32px 8px;"><h1 style="margin:0;color:#111827;font-size:23px;line-height:1.35;">${safeTitle}</h1></td></tr>
<tr><td style="padding:10px 32px 22px;">${safeGreeting}<p style="margin:0;color:#374151;font-size:15px;line-height:1.7;">${safeIntro}</p></td></tr>
${content}
${securityNotice}
<tr><td style="padding:0 32px 24px;"><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">Atenciosamente,<br><strong>${escapeHtml(signature)}</strong></p></td></tr>
<tr><td style="padding:17px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;"><p style="margin:0;color:#6B7280;font-size:11px;line-height:1.6;">Esta é uma mensagem automática relacionada à segurança e ao acesso da sua conta. Por favor, não responda a este e-mail.</p></td></tr>
</table>
<p style="margin:14px 0 0;color:#9CA3AF;font-size:11px;line-height:1.5;text-align:center;">© HOLIDAY Guild</p>
</td></tr></table>
</body>
</html>`;

    return html;
}

export function buildCodeEmail({
    title,
    greeting,
    intro,
    code,
    codeLabel = 'SEU CÓDIGO DE VERIFICAÇÃO',
    expiresIn,
    notice = 'Por segurança, não compartilhe este código com ninguém.',
    noticeTitle = 'Aviso de segurança',
    signature
}) {
    const safeCode = escapeHtml(code);
    const safeCodeLabel = escapeHtml(codeLabel);
    const safeExpiry = escapeHtml(expiresIn);
    const content = `<tr><td align="center" style="padding:0 32px 24px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;"><tr><td align="center" style="padding:20px 16px 18px;"><p style="margin:0 0 12px;color:#6B7280;font-size:11px;font-weight:700;letter-spacing:1.5px;">${safeCodeLabel}</p><div style="display:inline-block;padding:12px 20px;border:1px solid #DDD6FE;border-radius:8px;background:#FFFFFF;color:#4C1D95;font-family:Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:7px;line-height:1.3;user-select:all;-webkit-user-select:all;">${safeCode}</div><p style="margin:14px 0 0;color:#374151;font-size:13px;line-height:1.6;">Selecione e copie o código acima; depois, cole-o no campo indicado na HOLIDAY Guild.</p><p style="margin:8px 0 0;color:#B45309;font-size:13px;font-weight:700;">Este código expira em ${safeExpiry}.</p></td></tr></table></td></tr>`;
    const html = renderEmail({
        preheader: `${title}. Seu código está destacado nesta mensagem.`,
        title,
        greeting,
        intro,
        content,
        noticeTitle,
        notice,
        signature
    });
    const text = [
        'HOLIDAY GUILD',
        title,
        '',
        greeting ? `Olá, ${greeting}.` : '',
        intro,
        '',
        `${codeLabel}:`,
        String(code),
        '',
        `Copie o código acima e cole-o no campo indicado na HOLIDAY Guild. Ele expira em ${expiresIn}.`,
        '',
        noticeTitle ? `${noticeTitle}: ${notice}` : notice,
        '',
        'Atenciosamente,',
        signature || 'Equipe HOLIDAY Guild',
        '',
        'Mensagem automática. Por favor, não responda a este e-mail.'
    ].filter(Boolean).join('\n');

    return { html, text };
}

export function buildNoticeEmail({
    title,
    greeting,
    intro,
    details = [],
    action,
    status,
    notice,
    noticeTitle,
    signature
}) {
    const detailRows = details.map(({ label, value }) => (
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;color:#111827;font-size:13px;font-weight:600;line-height:1.5;vertical-align:top;">${escapeHtml(value)}</td></tr>`
    )).join('');
    const statusBlock = status
        ? `<tr><td align="center" style="padding:0 32px 20px;"><span style="display:inline-block;padding:7px 12px;border-radius:999px;background:#F3F4F6;color:#374151;font-size:12px;font-weight:700;">${escapeHtml(status)}</span></td></tr>`
        : '';
    const detailsBlock = details.length
        ? `<tr><td style="padding:0 32px 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E5E7EB;border-radius:8px;">${detailRows}</table></td></tr>`
        : '';
    let actionBlock = '';
    let safeActionUrl = '';
    const actionLabel = String(action?.label || '').trim();
    try {
        const parsedActionUrl = new URL(String(action?.url || '').trim());
        if (parsedActionUrl.protocol === 'https:' || parsedActionUrl.protocol === 'http:') {
            safeActionUrl = parsedActionUrl.toString();
        }
    } catch {
        safeActionUrl = '';
    }
    if (safeActionUrl && actionLabel) {
        actionBlock = `<tr><td align="center" style="padding:0 32px 24px;"><a href="${escapeHtml(safeActionUrl)}" style="display:inline-block;padding:13px 22px;border-radius:8px;background:#7C3AED;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(actionLabel)}</a></td></tr>`;
    }
    const html = renderEmail({
        preheader: title,
        title,
        greeting,
        intro,
        content: `${statusBlock}${detailsBlock}${actionBlock}`,
        noticeTitle,
        notice,
        signature
    });
    const text = [
        'HOLIDAY GUILD',
        title,
        '',
        greeting ? `Olá, ${greeting}.` : '',
        intro,
        status ? `Status: ${status}` : '',
        ...details.map(({ label, value }) => `${label}: ${value}`),
        safeActionUrl && actionLabel ? `${actionLabel}: ${safeActionUrl}` : '',
        notice ? `${noticeTitle || 'Importante'}: ${notice}` : '',
        '',
        'Atenciosamente,',
        signature || 'Equipe HOLIDAY Guild',
        '',
        'Mensagem automática. Por favor, não responda a este e-mail.'
    ].filter(Boolean).join('\n');

    return { html, text };
}
