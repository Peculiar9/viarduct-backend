export type ResolvedEmailSmtpConfig = {
    providerLabel: string;
    host: string;
    port: number;
    username: string;
    password: string;
    fromEmail: string;
};

/**
 * Resolves SMTP settings from env based on EMAIL_PROVIDER.
 * - smtp  → SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM
 * - brevo → BREVO_SMTP_* + BREVO_SENDER_EMAIL (default port 2525; 587 is often blocked by ISPs)
 */
export function resolveEmailSmtpConfig(): ResolvedEmailSmtpConfig {
    const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

    if (provider === 'brevo') {
        const password =
            (process.env.BREVO_SMTP_PASSWORD || '').trim() ||
            (process.env.BREVO_API_KEY || '').trim();

        if (password.startsWith('xkeysib-')) {
            throw new Error(
                'BREVO_API_KEY is an REST API key (xkeysib-). For EMAIL_PROVIDER=brevo use SMTP: ' +
                    'set BREVO_SMTP_PASSWORD to your xsmtpsib-... key from Brevo → SMTP settings.'
            );
        }

        return {
            providerLabel: 'Brevo SMTP',
            host: (process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com').trim(),
            port: parseInt(process.env.BREVO_SMTP_PORT || '2525', 10),
            username: (process.env.BREVO_SMTP_USERNAME || '').trim(),
            password,
            fromEmail:
                (process.env.BREVO_SENDER_EMAIL || '').trim() ||
                (process.env.EMAIL_FROM || '').trim()
        };
    }

    return {
        providerLabel: 'SMTP',
        host: (process.env.SMTP_HOST || '').trim(),
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        username: (process.env.SMTP_USERNAME || '').trim(),
        password: (process.env.SMTP_PASSWORD || '').trim(),
        fromEmail: (process.env.EMAIL_FROM || '').trim()
    };
}
