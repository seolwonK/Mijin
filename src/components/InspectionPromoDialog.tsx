'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buttonClasses } from '@/components/Button';
import { CheckIcon } from '@/components/icons';
import {
  INSPECTION_PRICE_WON,
  INSPECTION_VISITS_PER_TERM,
  formatWon,
} from '@/lib/inspection';
import {
  PROMO_DELAY_MS,
  PROMO_STORAGE_KEY,
  type PromoDismissReason,
  isSnoozed,
  nextSnoozeUntil,
} from '@/lib/inspectionPromo';

// 첫 방문자에게 정기 전기점검을 한 번 확실히 보여 주는 팝업.
//
// 세 가지를 지키도록 만들었다:
//  1) **첫 화면을 가로채지 않는다.** 2.2초 뒤에 뜨고(PROMO_DELAY_MS), 서버 HTML 에는
//     존재하지 않는다 — 검색 유입 직후 본문을 덮는 "침입형 간지 광고"로 취급되면
//     이 사이트가 공들인 검색 노출을 그대로 깎아먹는다.
//  2) **한 번 거절하면 한동안 조용하다.** 빈도 규칙은 lib/inspectionPromo.ts 소유.
//  3) **키보드·스크린리더로 빠져나올 수 있다.** 네이티브 <dialog>+showModal 로
//     포커스 가둠·ESC 를 UA 에 맡기고, Tab 순환만 직접 잡는다(useConfirm 과 같은 문법).
//
// 모바일은 바텀시트, md+ 는 가운데 카드다. 화면 전체를 덮지 않는 형태를 고른 것도
// (1)과 같은 이유다.

const PER_VISIT_WON = INSPECTION_PRICE_WON / INSPECTION_VISITS_PER_TERM;

const FACTS = [
  { label: '연회비', value: formatWon(INSPECTION_PRICE_WON) },
  { label: '방문', value: `연 ${INSPECTION_VISITS_PER_TERM}회` },
  { label: '1회당', value: formatWon(PER_VISIT_WON) },
] as const;

const POINTS = [
  '분기마다 1번, 원하는 날짜에 방문',
  '분전반·누전차단기·콘센트·조명 점검',
  '출장비 없음 · 결과는 현장에서 바로 안내',
] as const;

export default function InspectionPromoDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(PROMO_STORAGE_KEY);
    } catch {
      // 사생활 보호 모드 등 — 저장소를 못 읽으면 그냥 띄운다(isSnoozed 가 false).
    }
    if (isSnoozed(stored)) return;
    const timer = setTimeout(() => setOpen(true), PROMO_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;
  return <PromoDialog onClose={() => setOpen(false)} />;
}

function PromoDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [never, setNever] = useState(false);

  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = dialog.current;
    node?.showModal();
    // 다음 프레임에 전환 클래스를 붙여야 진입 애니메이션이 실제로 재생된다.
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(frame);
      node?.close();
    };
  }, []);

  function close(reason: PromoDismissReason) {
    // "다시 보지 않기"에 체크했으면 닫기·CTA 어느 쪽이든 그 뜻을 우선한다.
    const effective: PromoDismissReason = never ? 'never' : reason;
    try {
      localStorage.setItem(PROMO_STORAGE_KEY, String(nextSnoozeUntil(effective)));
    } catch {
      // 저장 실패는 다음 방문에 한 번 더 보이는 것으로 끝난다 — 기능을 막지 않는다.
    }
    onClose();
    const target = opener.current;
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="inspection-promo-title"
      onCancel={(event) => {
        event.preventDefault();
        close('close');
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close('close');
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled)',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className="fixed bottom-0 left-0 right-0 top-auto m-0 max-h-[88dvh] w-full max-w-none overflow-visible border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/50 md:inset-0 md:m-auto md:w-[calc(100%_-_2rem)] md:max-w-md"
    >
      {/* showModal() 은 기본적으로 첫 포커스 가능 요소(닫기 버튼)에 포커스를 준다 —
          그러면 전역 :focus-visible 외곽선이 일러스트 위에 상자로 떠 광고 배너처럼 보인다.
          대신 패널 자체를 포커스 대상으로 삼아 스크린리더가 제목부터 읽게 하고(대화상자
          진입 관례), 눈에 보이는 링은 실제로 Tab 을 눌렀을 때만 나오게 한다. */}
      <div
        tabIndex={-1}
        autoFocus
        className={`relative overflow-hidden rounded-t-3xl bg-white shadow-pop transition duration-brand-slow ease-brand outline-none md:rounded-3xl motion-reduce:transition-none ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => close('close')}
          aria-label="닫기"
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/85 text-2xl leading-none text-muted shadow-sm backdrop-blur-sm transition-colors ease-brand duration-brand-base hover:bg-white hover:text-fg"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="bg-gradient-to-br from-brand-50 via-white to-brand-100/60 px-6 pb-5 pt-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-brand-600">고장 나기 전에, 미리 점검</p>
              <h2
                id="inspection-promo-title"
                className="mt-1.5 text-xl font-extrabold leading-snug text-fg"
              >
                1년에 {INSPECTION_PRICE_WON.toLocaleString('ko-KR')}원,
                <br />
                분기마다 전기를 봐 드려요
              </h2>
            </div>
            {/* 팝업에서는 상반신 크롭을 쓴다 — 96px 높이에 전신을 넣으면 얼굴도 분전반도
                뭉개져 무슨 그림인지 읽히지 않는다. 랜딩 히어로(176~240px)는 전신을 쓴다.
                mt-7 은 닫기 버튼(top-2 + h-11 = 52px)보다 아래에서 시작시키기 위한 값이다.
                제목이 뜻을 다 담으므로 그림은 장식으로 둔다(alt=""). */}
            <Image
              src="/brand/ajeossi-inspection-bust.webp"
              alt=""
              width={447}
              height={420}
              sizes="102px"
              className="mt-7 h-24 w-auto shrink-0"
            />
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2">
            {FACTS.map((fact) => (
              <div key={fact.label} className="rounded-2xl bg-white px-2 py-2.5 text-center">
                <dt className="text-xs text-muted">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-bold tabular-nums text-fg">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="px-6 pb-6 pt-4">
          <ul className="space-y-1.5">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-muted">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <Link
            href="/inspection"
            onClick={() => close('cta')}
            className={buttonClasses('primary', 'lg', 'mt-5 w-full')}
          >
            자세히 보기
            <span aria-hidden="true">→</span>
          </Link>
          <button
            type="button"
            onClick={() => close('close')}
            className={buttonClasses('ghost', 'sm', 'mt-1 w-full')}
          >
            나중에 볼게요
          </button>

          <label className="mt-2 flex items-center justify-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={never}
              onChange={(event) => setNever(event.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            다시 보지 않기
          </label>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
