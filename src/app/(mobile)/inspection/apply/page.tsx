import type { Metadata } from 'next';
import ApplyForm from './apply-form';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readInspectionAccount } from '@/lib/inspectionAccount';
import { INSPECTION_PRICE_WON } from '@/lib/inspection';

export const metadata: Metadata = {
  title: '정기 전기점검 신청',
  description: `연 ${INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원 정기 전기점검을 신청합니다. 점검받을 주소와 1회차 희망 날짜를 남기면 입금 계좌를 안내해 드립니다.`,
  alternates: { canonical: '/inspection/apply' },
};

// 세션(쿠키)을 읽어 갱신 신청을 분기하므로 정적 렌더가 불가능하다. SEO 는 랜딩(/inspection)이
// 맡고 이 화면은 전환 경로라, 매 요청 렌더의 비용을 감수하는 쪽이 맞다.
export const dynamic = 'force-dynamic';

/** 지난 구독에서 방문지·연락처를 끌어와 갱신 신청을 다시 타이핑하지 않게 한다. */
async function loadRenewalPrefill(userId: string) {
  try {
    const last = await prisma.inspectionPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        contactName: true,
        contactPhone: true,
        address: true,
        addressDetail: true,
      },
    });
    return last ?? null;
  } catch {
    return null;
  }
}

export default async function InspectionApplyPage() {
  const [account, session] = await Promise.all([readInspectionAccount(), getSession()]);
  const customerUserId = session?.role === 'CUSTOMER' ? session.userId : null;
  const prefill = customerUserId ? await loadRenewalPrefill(customerUserId) : null;

  return (
    <ApplyForm
      account={account}
      renewal={customerUserId != null}
      prefill={
        prefill && {
          name: prefill.contactName,
          phone: prefill.contactPhone,
          address: prefill.address,
          addressDetail: prefill.addressDetail ?? '',
        }
      }
    />
  );
}
