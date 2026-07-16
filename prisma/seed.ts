import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  const adminHash = await bcrypt.hash('admin1234', 10);
  await prisma.user.upsert({
    where: { loginId: 'admin' },
    update: {},
    create: {
      loginId: 'admin',
      passwordHash: adminHash,
      name: '관리자',
      phone: '01000000000',
      role: 'ADMIN',
    },
  });

  const partnerHash = await bcrypt.hash('partner1234', 10);
  const providers = [
    {
      loginId: 'partner1',
      name: '강남전기',
      phone: '01011110001',
      address: '서울 강남구 테헤란로 152',
      lat: 37.5006,
      lng: 127.0364,
    },
    {
      loginId: 'partner2',
      name: '마포전기',
      phone: '01011110002',
      address: '서울 마포구 월드컵북로 396',
      lat: 37.5663,
      lng: 126.9019,
    },
    {
      loginId: 'partner3',
      name: '노원전기',
      phone: '01011110003',
      address: '서울 노원구 동일로 1414',
      lat: 37.6542,
      lng: 127.0568,
    },
  ];

  for (const p of providers) {
    await prisma.user.upsert({
      where: { loginId: p.loginId },
      update: {},
      create: {
        loginId: p.loginId,
        passwordHash: partnerHash,
        name: p.name,
        phone: p.phone,
        role: 'PROVIDER',
        provider: {
          create: {
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
          },
        },
      },
    });
  }

  // 소개(추천) 관계 + 정산 데모 데이터 — 관리자 정산 화면(/admin/commissions) 로컬 확인용(선택).
  // 기존 시드 계정은 건드리지 않고, partner1이 partner2·partner3을 소개한 것으로 설정한 뒤
  // 정산 화면이 비어 보이지 않도록 완료 접수 2건 + 조사 + 원장(PENDING 1건·PAID 1건)을 만든다.
  const partner1User = await prisma.user.findUnique({ where: { loginId: 'partner1' } });
  const partner2 = await prisma.provider.findFirst({ where: { user: { loginId: 'partner2' } } });
  const partner3 = await prisma.provider.findFirst({ where: { user: { loginId: 'partner3' } } });

  if (partner1User && partner2 && partner3) {
    await prisma.provider.update({
      where: { id: partner2.id },
      data: { referredByUserId: partner1User.id },
    });
    await prisma.provider.update({
      where: { id: partner3.id },
      data: { referredByUserId: partner1User.id },
    });

    const demoEntries = [
      { code: '900001', phone: '01099990001', paidAmount: 500_000, status: 'PENDING' as const },
      { code: '900002', phone: '01099990002', paidAmount: 2_000_000, status: 'PAID' as const },
    ];
    for (const d of demoEntries) {
      const already = await prisma.serviceRequest.findUnique({ where: { lookupCode: d.code } });
      if (already) continue; // 재실행(seed 재적용) 시 중복 생성 방지

      const request = await prisma.serviceRequest.create({
        data: {
          lookupCode: d.code,
          customerName: '데모 고객',
          customerPhone: d.phone,
          description: '시드 데모 접수 — 정산 화면 확인용',
          urgency: 'NORMAL',
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      const survey = await prisma.satisfactionSurvey.create({
        data: {
          requestId: request.id,
          token: `demo-${d.code}`,
          providerId: partner2.id,
          rating: 5,
          comment: '빠르고 친절했습니다',
          paidAmount: d.paidAmount,
          submittedAt: new Date(),
        },
      });
      await prisma.commissionEntry.create({
        data: {
          referrerUserId: partner1User.id,
          providerId: partner2.id,
          surveyId: survey.id,
          requestId: request.id,
          baseAmount: d.paidAmount,
          amount: Math.floor(d.paidAmount * 0.02),
          status: d.status,
          paidAt: d.status === 'PAID' ? new Date() : null,
        },
      });
    }
  }

  console.log('seed 완료: admin/admin1234, partner1~3/partner1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
