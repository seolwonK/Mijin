import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import ApplyForm from './apply-form';
import PageHeader from '@/components/PageHeader';
import LogoutButton from '@/components/LogoutButton';
import { getSession, type SessionRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readInspectionAccount } from '@/lib/inspectionAccount';
import { INSPECTION_MIN_MONTHLY_WON } from '@/lib/inspection';
import { expireDuePlans } from '@/lib/inspectionLifecycle';

export const metadata: Metadata = {
  title: '정기 전기점검 신청',
  description: `월 ${INSPECTION_MIN_MONTHLY_WON.toLocaleString('ko-KR')}원부터, 1년에 12회 전화로 점검하고 필요하면 전기기사가 방문하는 정기 전기점검을 신청합니다. 요금제와 첫 전화 점검 희망 날짜를 고르면 입금 계좌를 안내해 드립니다.`,
  alternates: { canonical: '/inspection/apply' },
};

// 세션(쿠키)을 읽어 갱신 신청을 분기하므로 정적 렌더가 불가능하다. SEO 는 랜딩(/inspection)이
// 맡고 이 화면은 전환 경로라, 매 요청 렌더의 비용을 감수하는 쪽이 맞다.
export const dynamic = 'force-dynamic';

/** 지난 구독에서 방문지·연락처를 끌어와 갱신 신청을 다시 타이핑하지 않게 한다. */
async function loadLastPlan(userId: string) {
  try {
    // 기간이 끝났는데 아직 ACTIVE 로 남은 구독을 먼저 내린다 — 그러지 않으면 갱신하러 온
    // 고객을 아래의 "진행 중" 판정이 /my 로 돌려보낸다.
    await expireDuePlans({ userId });
    const last = await prisma.inspectionPlan.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
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

const PORTAL_HOME: Record<Exclude<SessionRole, 'CUSTOMER'>, string> = {
  ADMIN: '/admin',
  TECHNICIAN: '/tech',
  PROVIDER: '/partner',
};

/**
 * 업체·기사·관리자로 로그인한 채 들어온 경우. 신청서를 다 채운 뒤에야 서버의 409 를 만나지 않게
 * 처음부터 로그아웃을 안내한다(서버는 새 고객 세션이 기존 세션을 덮어쓰지 않도록 막는다).
 */
function OtherRoleNotice({ role }: { role: Exclude<SessionRole, 'CUSTOMER'> }) {
  return (
    <main className="min-h-screen pb-28 md:pb-12">
      <PageHeader title="정기 전기점검 신청" back="/inspection" />
      <div className="mx-auto w-full max-w-2xl px-5 py-5">
        <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <p className="text-sm leading-relaxed">
            업체·전기기사·관리자 계정으로 로그인돼 있어요. 고객으로 신청하려면 먼저 로그아웃해
            주세요.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {/* 로그아웃 뒤 이 화면으로 돌아오면 세션이 없으니 바로 신청서가 보인다. */}
            <LogoutButton loginPath="/inspection/apply" />
            <Link
              href={PORTAL_HOME[role]}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-amber-900 underline"
            >
              내 포털로 돌아가기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default async function InspectionApplyPage() {
  const [account, session] = await Promise.all([readInspectionAccount(), getSession()]);
  if (session && session.role !== 'CUSTOMER') {
    return <OtherRoleNotice role={session.role} />;
  }
  const customerUserId = session?.role === 'CUSTOMER' ? session.userId : null;
  const prefill = customerUserId ? await loadLastPlan(customerUserId) : null;

  // 진행 중인 구독이 있으면 신청서를 다 채운 뒤에야 409 를 만난다 — 처음부터 현황으로 보낸다.
  // (redirect 는 예외를 던지므로 loadLastPlan 의 try/catch 밖에서 부른다.)
  if (prefill && (prefill.status === 'PENDING_PAYMENT' || prefill.status === 'ACTIVE')) {
    redirect('/my');
  }

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
