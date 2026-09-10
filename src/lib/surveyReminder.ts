import { prisma } from '@/lib/db';
import { sendReservedSms } from '@/lib/sms';
import { smsSurveyRequest } from '@/lib/sms/templates';

export const SURVEY_REMINDER_COOLDOWN_MS = 60_000;

export async function resendSurvey(surveyId: string, origin: string) {
  // Reserve a log under a per-survey DB lock. Network I/O happens after commit,
  // so concurrent admins cannot send the same reminder twice.
  const reservation = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`survey-reminder:${surveyId}`}))`;
    const survey = await tx.satisfactionSurvey.findUnique({
      where: { id: surveyId }, select: { token: true, submittedAt: true, requestId: true, request: { select: { customerPhone: true } } },
    });
    if (!survey) return { error: '설문을 찾을 수 없습니다.', status: 404 } as const;
    if (survey.submittedAt) return { error: '이미 응답한 설문입니다. 목록을 새로고침해 주세요.', status: 409 } as const;
    const latest = await tx.smsLog.findFirst({
      where: { requestId: survey.requestId, body: { contains: `/survey/${survey.token}` } }, orderBy: { createdAt: 'desc' },
    });
    const remaining = latest ? SURVEY_REMINDER_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime()) : 0;
    if (remaining > 0) return { error: '방금 발송을 요청한 설문입니다. 1분 후 다시 시도해 주세요.', status: 429, retryAfter: Math.ceil(remaining / 1000) } as const;
    const base = (process.env.APP_BASE_URL ?? origin).replace(/\/$/, '');
    const log = await tx.smsLog.create({ data: {
      to: survey.request.customerPhone, body: smsSurveyRequest(`${base}/survey/${survey.token}`),
      requestId: survey.requestId, provider: process.env.SMS_PROVIDER === 'solapi' ? 'solapi' : 'console', status: 'PENDING',
    } });
    return { log };
  });
  if ('error' in reservation) return reservation;
  const result = await sendReservedSms(reservation.log);
  if (result.status === 'FAILED') return { error: '문자 발송에 실패했습니다. 발송 서비스 설정·잔액을 확인한 뒤 다시 시도해 주세요.', status: 502 } as const;
  return { status: 200, simulated: result.provider === 'console', sentAt: reservation.log.createdAt.toISOString() } as const;
}
