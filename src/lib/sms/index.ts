import { prisma } from '@/lib/db';
import { consoleProvider } from './console';
import { solapiProvider } from './solapi';

export interface SmsProvider {
  name: string;
  send(to: string, body: string): Promise<void>;
}

function getProvider(): SmsProvider {
  return process.env.SMS_PROVIDER === 'solapi' ? solapiProvider : consoleProvider;
}

/** Delivers a previously reserved log and reports the real provider result. */
export async function sendReservedSms(log: { id: string; to: string; body: string }) {
  const provider = getProvider();
  let status: 'SENT' | 'FAILED' = 'SENT';
  let error: string | null = null;
  try { await provider.send(log.to, log.body); }
  catch (e) { status = 'FAILED'; error = e instanceof Error ? e.message : String(e); }
  await prisma.smsLog.update({ where: { id: log.id }, data: { status, error, provider: provider.name } });
  return { status, provider: provider.name };
}

// 발송 실패가 접수/배정 본 플로우를 깨지 않도록 예외를 삼키고 SmsLog에 기록만 한다.
export async function sendSms(
  to: string,
  body: string,
  requestId?: string,
): Promise<void> {
  const provider = getProvider();
  let status = 'SENT';
  let error: string | null = null;
  try {
    await provider.send(to, body);
  } catch (e) {
    status = 'FAILED';
    error = e instanceof Error ? e.message : String(e);
    console.error(`[SMS 발송 실패 → ${to}]`, error);
  }
  try {
    await prisma.smsLog.create({
      data: { to, body, provider: provider.name, status, error, requestId },
    });
  } catch (e) {
    console.error('[SmsLog 기록 실패]', e);
  }
}
