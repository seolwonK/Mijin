import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import CopyButton from '@/components/CopyButton';

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
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="flex w-full flex-col items-center gap-6 text-center md:max-w-lg md:rounded-3xl md:bg-white md:p-12 md:shadow-sm">
        <div className="text-6xl">✅</div>
        <h1 className="text-2xl font-bold">접수가 완료되었습니다</h1>
        <div>
          <p className="mb-2 text-gray-500">접수번호</p>
          <p className="text-5xl font-extrabold tracking-widest text-blue-600">
            {request.lookupCode}
          </p>
          <div className="mt-3 flex justify-center">
            <CopyButton value={request.lookupCode} label="접수번호 복사" />
          </div>
        </div>
        <p className="text-gray-500">
          접수 확인 문자가 발송되었습니다.
          <br />
          진행 상황은 전화번호만으로 조회할 수 있으며,
          <br />
          업체가 배정되면 업체에서 직접 연락드립니다.
        </p>
        <div className="mt-4 flex w-full flex-col gap-3">
          <Link
            href={`/lookup?phone=${encodeURIComponent(request.customerPhone)}`}
            className="rounded-2xl bg-blue-600 p-4 text-center font-bold text-white transition-colors hover:bg-blue-700"
          >
            진행 상황 조회하기
          </Link>
          <Link
            href="/"
            className="rounded-2xl border border-gray-300 p-4 text-center font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            처음으로
          </Link>
        </div>
      </div>
    </main>
  );
}
