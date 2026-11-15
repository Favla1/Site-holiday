const RELAY_TOKEN_PROPERTY = 'EMAIL_RELAY_TOKEN';
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function initializeRelayToken() {
    const token = Utilities.getUuid().replace(/-/g, '')
        + Utilities.getUuid().replace(/-/g, '')
        + Utilities.getUuid().replace(/-/g, '');
    PropertiesService.getScriptProperties().setProperty(RELAY_TOKEN_PROPERTY, token);
    console.log('Copy this token into the Discloud variable EMAIL_RELAY_TOKEN:', token);
}

function authorizeGmailRelay() {
    MailApp.getRemainingDailyQuota();
}

function doPost(event) {
    let payload;
    try {
        payload = JSON.parse(event.postData.contents);
    } catch (error) {
        return jsonResponse({ success: false, error: 'invalid_request' });
    }

    const expectedToken = PropertiesService.getScriptProperties().getProperty(RELAY_TOKEN_PROPERTY);
    if (!expectedToken || payload.token !== expectedToken) {
        return jsonResponse({ success: false, error: 'unauthorized' });
    }

    const to = String(payload.to || '').trim();
    const subject = String(payload.subject || '').trim();
    const html = String(payload.html || '');
    const text = String(payload.text || '').trim() || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!to || !subject || (!html && !text) || /[\r\n]/.test(subject)) {
        return jsonResponse({ success: false, error: 'invalid_email' });
    }

    try {
        const attachments = [];
        let totalAttachmentBytes = 0;
        const requestedAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        for (const attachment of requestedAttachments) {
            const bytes = Utilities.base64Decode(String(attachment.contentBase64 || ''));
            totalAttachmentBytes += bytes.length;
            if (totalAttachmentBytes > MAX_ATTACHMENT_BYTES) {
                return jsonResponse({ success: false, error: 'attachments_too_large' });
            }

            const filename = String(attachment.filename || 'attachment').replace(/[\\/\r\n]/g, '_');
            const contentType = String(attachment.contentType || 'application/octet-stream');
            attachments.push(Utilities.newBlob(bytes, contentType, filename));
        }

        const options = { name: 'HOLIDAY Guild' };
        if (html) options.htmlBody = html;
        if (attachments.length) options.attachments = attachments;
        MailApp.sendEmail(to, subject, text || ' ', options);
        return jsonResponse({ success: true });
    } catch (error) {
        console.error('Gmail relay send failed:', error.message);
        return jsonResponse({ success: false, error: 'send_failed' });
    }
}

function jsonResponse(payload) {
    return ContentService
        .createTextOutput(JSON.stringify(payload))
        .setMimeType(ContentService.MimeType.JSON);
}
