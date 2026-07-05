import crypto from 'crypto';
import type { SmsProvider } from './index';

// Solapi HMAC-SHA256 인증 (https://developers.solapi.com/references/authentication)
export const solapiProvider: SmsProvider = {
  name: 'solapi',
  async send(to, body) {
    const apiKey = process.env.SOLAPI_API_KEY;
    const apiSecret = process.env.SOLAPI_API_SECRET;
    const sender = process.env.SOLAPI_SENDER;
    if (!apiKey || !apiSecret || !sender) {
      throw new Error('SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_SENDER 환경변수가 필요합니다');
    }
    const date = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString('hex');
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(date + salt)
      .digest('hex');

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({ message: { to, from: sender, text: body } }),
    });
    if (!res.ok) {
      throw new Error(`SOLAPI ${res.status}: ${await res.text()}`);
    }
  },
};
