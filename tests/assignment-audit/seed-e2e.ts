import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const url = new URL(process.env.DATABASE_URL!);
if (!url.pathname.startsWith('/mijin_assignment_audit_')) throw new Error('Isolated audit DB required');
const prisma = new PrismaClient();
async function main() {
  try {
    await prisma.appSettings.upsert({ where: { id: 1 }, create: { id: 1, autoAssignEnabled: true }, update: { autoAssignEnabled: true } });
    await prisma.user.upsert({ where: { loginId: 'admin' }, update: {}, create: {
      loginId: 'admin', passwordHash: await bcrypt.hash('admin1234', 10),
      name: '배정 검증 관리자', phone: '01000000000', role: 'ADMIN',
    } });
    await prisma.user.upsert({ where: { loginId: 'audit-inactive-provider' }, update: {}, create: {
      loginId: 'audit-inactive-provider', passwordHash: 'unused', name: '통계 검증 업체',
      phone: '01000000003', role: 'PROVIDER',
      provider: { create: { address: '서울특별시 강남구', isActive: false, approvalStatus: 'APPROVED' } },
    } });
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
