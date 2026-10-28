import crypto from 'crypto';
import type { SmsProvider } from './index';

// Solapi HMAC-SHA256 인증 (https://developers.solapi.com/references/authentication)
function authorization(): string {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('SOLAPI_API_KEY / SOLAPI_API_SECRET 환경변수가 필요합니다');
  }
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString('hex');
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(date + salt)
    .digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

export const solapiProvider: SmsProvider = {
  name: 'solapi',
  async send(to, body) {
    const sender = process.env.SOLAPI_SENDER;
    if (!sender) throw new Error('SOLAPI_SENDER 환경변수가 필요합니다');

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization(),
      },
      body: JSON.stringify({ message: { to, from: sender, text: body } }),
    });
    if (!res.ok) {
      throw new Error(`SOLAPI ${res.status}: ${await res.text()}`);
    }
  },
};

// 충전 잔액 조회. SOLAPI 는 허용 IP 에서 온 요청만 받으므로 운영 서버에서만 성공한다.
// 응답 필드(balance·point 등)는 SOLAPI 가 주는 그대로 넘긴다.
export async function getSolapiBalance(): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.solapi.com/cash/v1/balance', {
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: authorization() },
  });
  if (!res.ok) {
    throw new Error(`SOLAPI ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
