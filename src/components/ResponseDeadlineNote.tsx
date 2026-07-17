'use client';

import { useEffect, useState } from 'react';

// 응답 대기(REQUESTED) 건에 보여주는 응대 목표 넛지(#11).
// 자동 회수 타이머는 존재하지 않으므로(회수는 관리자 수동) 가짜 카운트다운 대신
// "배정 후 경과시간 + 긴급도별 응대 목표"라는 정직한 정보만 보여준다.
const TARGET: Record<string, { label: string; targetMin: number | null }> = {
  CRITICAL: { label: '초긴급 — 1시간 내 응대 목표', targetMin: 60 },
  URGENT: { label: '긴급 — 2시간 내 응대 목표', targetMin: 120 },
  NORMAL: { label: '일반 — 순차 처리', targetMin: null },
};

export default function ResponseDeadlineNote({
  assignedAt,
  urgency,
}: {
  assignedAt: string;
  urgency: string;
}) {
  // 렌더 순수성 규칙상 Date.now()는 렌더 밖에서 — 지연 초기화 + 30초 틱으로 경과분을 갱신한다.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const t = TARGET[urgency] ?? TARGET.NORMAL;
  const elapsedMin = Math.max(0, Math.floor((now - new Date(assignedAt).getTime()) / 60_000));
  const overdue = t.targetMin != null && elapsedMin >= t.targetMin;
  return (
    <p
      className={`rounded-xl p-3 text-sm font-medium md:col-span-2 ${
        overdue ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
      }`}
    >
      {elapsedMin < 1 ? '방금 배정됨' : `배정 후 ${elapsedMin}분 경과`} · {t.label} · 응답이
      늦으면 배정이 회수될 수 있습니다.
    </p>
  );
}
