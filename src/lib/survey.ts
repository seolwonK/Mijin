import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { sendSms } from '@/lib/sms';
import { smsSurveyRequest } from '@/lib/sms/templates';

// 완료 훅에서 호출 — 만족도 조사 행을 만들고 고객에게 참여 링크를 문자로 보낸다.
// 실패해도 완료 처리 응답을 깨면 안 되므로, 호출부는 결과를 기다리지 않고 void로 던진다.
export async function createSurveyAndNotify(params: {
  requestId: string;
  providerId: string | null;
  technicianId: string | null;
  phone: string;
  origin?: string;
}): Promise<void> {
  try {
    const token = randomBytes(24).toString('base64url');
    let survey;
    try {
      survey = await prisma.satisfactionSurvey.create({
        data: {
          requestId: params.requestId,
          token,
          providerId: params.providerId,
          technicianId: params.technicianId,
        },
      });
    } catch (e) {
      // requestId는 @unique — 동시 요청 등으로 이미 생성된 경우 기존 행(토큰)을 재사용한다(멱등).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        survey = await prisma.satisfactionSurvey.findUnique({
          where: { requestId: params.requestId },
        });
        if (!survey) throw e;
      } else {
        throw e;
      }
    }

    const base = process.env.APP_BASE_URL ?? params.origin ?? 'http://localhost:3000';
    const url = `${base}/survey/${survey.token}`;
    void sendSms(params.phone, smsSurveyRequest(url), params.requestId);
  } catch (e) {
    console.error('[survey] 조사 생성/문자 발송 실패', e);
  }
}
