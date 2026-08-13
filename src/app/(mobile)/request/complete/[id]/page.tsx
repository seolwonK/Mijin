import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import CopyButton from '@/components/CopyButton';
import { buttonClasses } from '@/components/Button';

export default async function RequestCompletePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { lookupCode: true, customerPhone: true },
  });
  if (!request) notFound();

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader title="접수 완료" width="max-w-lg" />
      <div className="flex flex-1 justify-center p-6 md:items-center md:p-10">
        <div className="w-full max-w-lg md:rounded-3xl md:bg-white md:p-10 md:shadow-surface-md">
          {/* 인사 존 — 완료 포즈 캐릭터가 등장하는 지점(G0 §5): 체크 아이콘 클리셰 대신
              브랜드 캐릭터가 그 역할을 대신한다("접수 완료, 아저씨가 확인했다"). */}
          <div className="flex items-center gap-4">
            <Image
              src="/brand/ajeossi-complete.webp"
              alt=""
              width={401}
              height={689}
              className="h-28 w-auto shrink-0 md:h-36"
              preload={true}
            />
            <div>
              <p className="text-sm font-semibold text-brand-600">전기아저씨가 확인했어요</p>
              <h1 className="text-2xl font-bold text-fg md:text-3xl">접수가 완료되었습니다</h1>
            </div>
          </div>

          {/* 접수번호 존 — 티켓 스텁 형태로 구성해 센터 스택에서 탈피, 코드는 여전히 크게(text-5xl). */}
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl bg-brand-50 px-5 py-6 md:px-7">
            <div>
              <p className="text-sm font-medium text-muted">접수번호</p>
              <p className="mt-1 text-5xl font-extrabold tracking-widest text-brand-600">
                {request.lookupCode}
              </p>
            </div>
            <CopyButton value={request.lookupCode} label="접수번호 복사" />
          </div>

          <p className="mt-6 text-muted">
            접수 확인 문자가 발송되었습니다. 진행 상황은 전화번호만으로 조회할 수 있으며, 업체가
            배정되면 업체에서 직접 연락드립니다.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href={`/lookup?phone=${encodeURIComponent(request.customerPhone)}`}
              className={buttonClasses('primary', 'lg', 'w-full')}
            >
              진행 상황 조회하기
            </Link>
            <Link href="/" className={buttonClasses('secondary', 'md', 'w-full')}>
              처음으로
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
