import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const COMMISSION_RATE = 0.02; // 소개 수수료율 2% (평생, 요율 변경 시에도 과거 원장은 동결)

// 조사 제출 CAS 성공 직후 호출 — 제출된 조사의 배정 대상(업체 또는 기술자)에게 소개자가
// 있으면 floor(paidAmount * 0.02)원을 원장(CommissionEntry)에 적립한다.
// 호출부는 token만 보유하므로 여기서 단일 재조회로 필요한 필드를 한 번에 가져온다.
// 소개 관계가 없거나(가입 시 미지정/소급 지정 이전 조사) 적립액이 0원이면 원장을 만들지 않는다.
// surveyId는 @unique 멱등 키라 같은 조사에 재호출돼도 원장은 늘지 않는다(P2002 무시).
export async function accrueCommissionForSurvey(token: string): Promise<void> {
  const survey = await prisma.satisfactionSurvey.findUnique({
    where: { token },
    select: { id: true, providerId: true, technicianId: true, requestId: true, paidAmount: true },
  });
  if (!survey || survey.paidAmount == null) return;

  const referredByUserId = survey.providerId
    ? (
        await prisma.provider.findUnique({
          where: { id: survey.providerId },
          select: { referredByUserId: true },
        })
      )?.referredByUserId
    : (
        await prisma.technician.findUnique({
          where: { id: survey.technicianId! },
          select: { referredByUserId: true },
        })
      )?.referredByUserId;
  if (!referredByUserId) return;

  const amount = Math.floor(survey.paidAmount * COMMISSION_RATE);
  if (amount === 0) return; // 0원 적립은 "미지급 0원" 노이즈만 남기므로 생성 생략(의식적 결정)

  try {
    await prisma.commissionEntry.create({
      data: {
        referrerUserId: referredByUserId,
        providerId: survey.providerId,
        technicianId: survey.technicianId,
        surveyId: survey.id,
        requestId: survey.requestId,
        baseAmount: survey.paidAmount,
        amount,
      },
    });
  } catch (e) {
    // surveyId @unique — 동시/재시도 호출로 이미 적립된 경우 조용히 무시(멱등)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return;
    throw e;
  }
}
