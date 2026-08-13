'use client';

import Image from 'next/image';
import { use, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { surfaceClasses } from '@/components/Surface';
import { StarIcon } from '@/components/icons';

type SurveyStatus = {
  submitted: boolean;
  completedAt: string | null;
};

function StarRating({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div role="group" aria-label="별점" className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange(n)}
          className="rounded-lg p-1 text-neutral-300 transition-colors ease-brand duration-brand-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <StarIcon
            filled={value != null && n <= value}
            className={`h-11 w-11 ${value != null && n <= value ? 'text-amber-400' : ''}`}
          />
        </button>
      ))}
    </div>
  );
}

// 완료/무효(=만료) 결과 화면 공통 골격 — 아이콘 대신 전기아저씨 캐릭터가 톤을 전달한다
// (G0 §5: 완료 포즈/난감 포즈). request/complete 페이지의 결과 화면과 같은 시각 계열.
function CenterScreen({
  image,
  title,
  desc,
}: {
  image: { src: string; width: number; height: number };
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <div className="flex w-full flex-col items-center gap-4 text-center md:max-w-md md:rounded-3xl md:bg-white md:p-12 md:shadow-surface-md">
        <Image
          src={image.src}
          alt=""
          width={image.width}
          height={image.height}
          className="h-28 w-auto md:h-36"
        />
        <h1 className="text-xl font-bold text-fg">{title}</h1>
        {desc && <p className="text-muted">{desc}</p>}
      </div>
    </div>
  );
}

export default function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [status, setStatus] = useState<
    'loading' | 'invalid' | 'loadError' | 'submitted' | 'form'
  >('loading');
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [amountDigits, setAmountDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setStatus('loading');
    try {
      const res = await fetch(`/api/survey/${token}`, { cache: 'no-store' });
      if (res.status === 404) {
        setStatus('invalid');
        return;
      }
      if (!res.ok) {
        setStatus('loadError');
        return;
      }
      const data: SurveyStatus = await res.json();
      setCompletedAt(data.completedAt);
      setStatus(data.submitted ? 'submitted' : 'form');
    } catch {
      setStatus('loadError');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const amount = amountDigits ? Number(amountDigits) : null;
  // 금액은 선택 입력 — 입력했을 때만 범위를 검증한다.
  const amountValid = amount == null || (amount >= 0 && amount <= 100_000_000);

  // 유효성 실패 시 안내 + 해당 위치로 스크롤 (request/new의 fail 패턴과 동일 계열)
  function fail(msg: string, id?: string) {
    setError(msg);
    const el = id ? document.getElementById(id) : null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function submit() {
    if (busy) return;
    if (rating == null) return fail('별점을 선택해 주세요', 'survey-rating');
    if (!amountValid) return fail('지불 금액을 확인해 주세요', 'survey-amount');
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/survey/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          paidAmount: amount,
        }),
      });
      if (res.ok || res.status === 409) {
        // 409(이미 제출)도 사용자 입장에서는 참여 완료와 동일하게 안내한다.
        setStatus('submitted');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? '제출에 실패했습니다');
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="만족도 조사" width="max-w-lg" />
        <p className="flex-1 p-6 text-center text-muted">불러오는 중…</p>
      </main>
    );
  }

  if (status === 'invalid') {
    // 접수 존재 여부에 대한 힌트를 주지 않는 중립 문구 — 링크 오류·만료를 구분하지 않는다.
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="만족도 조사" width="max-w-lg" />
        <CenterScreen
          image={{ src: '/brand/ajeossi-puzzled.webp', width: 418, height: 723 }}
          title="설문을 찾을 수 없습니다"
          desc="링크를 다시 확인해 주세요."
        />
      </main>
    );
  }

  if (status === 'loadError') {
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="만족도 조사" width="max-w-lg" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-muted">정보를 불러오지 못했습니다.</p>
          <button type="button" onClick={load} className={buttonClasses('secondary', 'sm')}>
            다시 시도
          </button>
        </div>
      </main>
    );
  }

  if (status === 'submitted') {
    return (
      <main className="flex min-h-screen flex-col">
        <PageHeader title="만족도 조사" width="max-w-lg" />
        <CenterScreen
          image={{ src: '/brand/ajeossi-complete.webp', width: 401, height: 689 }}
          title="참여 완료"
          desc="소중한 의견 감사합니다."
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col">
      <PageHeader title="만족도 조사" width="max-w-lg" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="contents"
      >
        <div className="mx-auto w-full max-w-lg flex-1 p-4 pb-32 md:py-10 md:pb-8">
          <div className="text-center">
            <p className="text-sm font-semibold text-brand-600">전기아저씨가 여쭤봐요</p>
            <h1 className="mt-1 text-2xl font-bold text-fg">수리는 어떠셨나요?</h1>
            {completedAt && (
              <p className="mt-1 text-sm text-muted">
                {new Date(completedAt).toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                완료
              </p>
            )}
          </div>

          {/* 핵심 존 — 유일한 필수 입력(별점)을 브랜드 틴트 카드로 격상. */}
          <section
            id="survey-rating"
            className={surfaceClasses('mt-6 rounded-3xl p-6 text-center md:p-8', true)}
          >
            <h2 className="mb-3 text-lg font-bold text-fg">
              서비스에 만족하셨나요? <span className="text-red-500">*</span>
              <span className="sr-only"> 필수</span>
            </h2>
            <StarRating value={rating} onChange={setRating} />
          </section>

          {/* 부가 존 — 후기·지불 금액은 둘 다 선택 입력이라 카드 표면 없이 가볍게 묶는다. */}
          <section className="mt-6 border-t border-border pt-6 md:mt-8">
            <h2 className="mb-2 text-base font-bold text-fg">후기 (선택)</h2>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={4}
              placeholder="수리 과정에 대한 의견을 남겨 주세요"
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg transition-colors ease-brand duration-brand-base placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
            />
            <p className="mt-1 text-right text-xs text-muted">{comment.length}/500</p>

            <div id="survey-amount" className="mt-6">
              <h2 className="mb-2 text-base font-bold text-fg">
                실제 지불 금액 <span className="font-normal text-muted">(선택)</span>
              </h2>
              <p className="mb-2 text-xs text-muted">
                지불하신 금액을 알려 주시면 서비스 품질 관리에 활용됩니다.
              </p>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountDigits ? Number(amountDigits).toLocaleString('ko-KR') : ''}
                  onChange={(e) => setAmountDigits(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  placeholder="0"
                  className="w-full rounded-xl border border-neutral-300 bg-white p-3 pr-10 text-right text-base text-fg transition-colors ease-brand duration-brand-base placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
                  원
                </span>
              </div>
              {amountDigits && !amountValid && (
                <p className="mt-1 text-sm font-medium text-red-600">지불 금액이 너무 큽니다</p>
              )}
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"
            >
              {error}
            </p>
          )}
        </div>

        <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 border-t border-border bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:static md:left-auto md:mx-auto md:max-w-lg md:translate-x-0 md:border-t-0 md:bg-transparent md:px-4 md:pt-0 md:pb-12">
          <button
            type="submit"
            disabled={busy}
            className={buttonClasses('primary', 'lg', 'w-full')}
          >
            {busy ? '제출 중…' : '제출하기'}
          </button>
        </div>
      </form>
    </main>
  );
}
