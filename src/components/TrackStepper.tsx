// "결"(C) 파이프라인 진행 표시 — 5개 배지를 나열하는 대신 단일 트랙 바 + 점으로 절제해 표현한다.
// 접수→배정→수락→출동→완료 공통 5단계(StatusPill의 상태 키와 순서를 그대로 따름).
// 홈 화면 서비스 소개, 추후 /lookup 진행 상황 타임라인 등에서 재사용 가능한 범용 프리미티브.
const STEPS = ['접수', '배정', '수락', '출동', '완료'] as const;

export default function TrackStepper({ currentIndex }: { currentIndex: number }) {
  const clamped = Math.max(0, Math.min(currentIndex, STEPS.length - 1));
  const pct = (clamped / (STEPS.length - 1)) * 100;

  return (
    <div>
      <div className="relative mx-[3px] h-[3px] rounded-full bg-neutral-200">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-brand-600 transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="-mt-[4.5px] flex justify-between">
        {STEPS.map((label, i) => (
          <span
            key={label}
            aria-hidden="true"
            className={`h-[9px] w-[9px] rounded-full ring-[3px] ring-surface ${
              i < clamped
                ? 'bg-brand-600'
                : i === clamped
                  ? 'bg-white ring-[2.5px] ring-brand-600'
                  : 'bg-neutral-200'
            }`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex justify-between">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`w-1/5 text-center text-[10.5px] ${
              i <= clamped ? 'font-bold text-fg' : 'text-muted'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
