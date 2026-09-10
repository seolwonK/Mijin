'use client';

import { useEffect, useState } from 'react';
import { RESPONSE_TIMEOUT_MINUTES } from '@/lib/responseTimeout';

// 응답 대기(REQUESTED) 건에 보여주는 응대 넛지(#11).
//
// 두 가지 시계가 동시에 돈다. 하나는 고객에게 약속한 긴급도별 응대 목표(1시간/2시간)이고,
// 다른 하나는 응답이 없으면 배정을 회수해 다음 순위로 넘기는 제한시간이다(v1.2, 전 긴급도 10분).
// 업체가 실제로 지켜야 하는 쪽은 후자라서 남은 시간을 분 단위로 직접 보여준다 — 예전에는
// 응대 목표만 적어 두어, 왜 배정이 사라졌는지 화면만 봐서는 알 수 없었다.
const TARGET: Record<string, { label: string; targetMin: number | null }> = {
  CRITICAL: { label: '초긴급 — 1시간 내 응대 목표', targetMin: 60 },
  URGENT: { label: '긴급 — 2시간 내 응대 목표', targetMin: 120 },
  NORMAL: { label: '일반 — 순차 처리', targetMin: null },
};

export default function ResponseDeadlineNote({
  assignedAt,
  urgency,
  compact = false,
}: {
  assignedAt: string;
  urgency: string;
  compact?: boolean;
}) {
  // 렌더 순수성 규칙상 Date.now()는 렌더 밖에서 — 지연 초기화 + 30초 틱으로 경과분을 갱신한다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const t = TARGET[urgency] ?? TARGET.NORMAL;
  const recallMin =
    RESPONSE_TIMEOUT_MINUTES[
      urgency as keyof typeof RESPONSE_TIMEOUT_MINUTES
    ] ?? RESPONSE_TIMEOUT_MINUTES.NORMAL;
  const elapsedMin = Math.max(
    0,
    Math.floor((now - new Date(assignedAt).getTime()) / 60_000),
  );
  const leftMin = recallMin - elapsedMin;
  // 회수가 임박했거나 응대 목표를 넘겼으면 붉게. 회수 시한이 훨씬 짧아 사실상 이쪽이 먼저 걸린다.
  const urgent =
    leftMin <= 3 || (t.targetMin != null && elapsedMin >= t.targetMin);
  return (
    <p
      className={compact
        ? `text-sm font-medium ${urgent ? 'text-red-700' : 'text-amber-800'}`
        : `rounded-xl p-3 text-sm font-medium md:col-span-2 ${urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}
    >
      {compact ? (
        leftMin > 0 ? (
          `응답 시간 ${leftMin}분 남음`
        ) : (
          '응답 기한 경과 · 회수 여부를 확인해 주세요'
        )
      ) : (
        <>
          {elapsedMin < 1 ? '방금 배정됨' : `배정 후 ${elapsedMin}분 경과`} ·{' '}
          {t.label} ·{' '}
          {leftMin > 0
            ? `${leftMin}분 안에 수락 또는 거절하지 않으면 자동으로 회수되어 다음 순서로 넘어갑니다.`
            : '응답이 없어 곧 회수되어 다음 순서로 넘어갑니다.'}
        </>
      )}
    </p>
  );
}
