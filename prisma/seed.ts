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

  console.log('seed 완료: admin/admin1234, partner1~3/partner1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
