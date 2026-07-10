import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import CopyButton from '@/components/CopyButton';
import { buttonClasses } from '@/components/Button';
import { CheckIcon } from '@/components/icons';

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
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex w-full flex-col items-center gap-6 text-center md:max-w-lg md:rounded-3xl md:bg-white md:p-12 md:shadow-surface-md">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckIcon className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-fg">접수가 완료되었습니다</h1>
          <div className="w-full rounded-2xl bg-brand-50 px-6 py-5">
            <p className="mb-2 text-sm font-medium text-muted">접수번호</p>
            <p className="text-5xl font-extrabold tracking-widest text-brand-600">
              {request.lookupCode}
            </p>
            <div className="mt-3 flex justify-center">
              <CopyButton value={request.lookupCode} label="접수번호 복사" />
            </div>
          </div>
          <p className="text-muted">
            접수 확인 문자가 발송되었습니다.
            <br />
            진행 상황은 전화번호만으로 조회할 수 있으며,
            <br />
            업체가 배정되면 업체에서 직접 연락드립니다.
          </p>
          <div className="mt-4 flex w-full flex-col gap-3">
            <Link
              href={`/lookup?phone=${encodeURIComponent(request.customerPhone)}`}
              className={buttonClasses('primary', 'md', 'w-full')}
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
