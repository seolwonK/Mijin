import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { eggChargeAccountSelect } from '@/lib/eggChargeAccount';
import { EGG_PACK_SIZE, EGG_PRICE_WON } from '@/lib/eggPricing';

export async function portalEggChargeResponse(role: 'PROVIDER' | 'TECHNICIAN') {
  const session = await requireSession(role);
  const id = role === 'PROVIDER' ? session?.providerId : session?.technicianId;
  if (!session || !id) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const select = { eggBalance: true, user: { select: { name: true } } } as const;
  const profile = role === 'PROVIDER'
    ? await prisma.provider.findUnique({ where: { id }, select })
    : await prisma.technician.findUnique({ where: { id }, select });
  if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다' }, { status: 404 });
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 }, select: eggChargeAccountSelect });
  const account = settings?.eggBankName && settings.eggBankAccountNumber && settings.eggBankAccountHolder
    ? { bankName: settings.eggBankName, accountNumber: settings.eggBankAccountNumber, accountHolder: settings.eggBankAccountHolder }
    : null;
  return NextResponse.json({
    account, balance: profile.eggBalance, depositorName: profile.user.name,
    packSize: EGG_PACK_SIZE, unitPrice: EGG_PRICE_WON,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
