'use client';

export type UrgencyValue = 'CRITICAL' | 'URGENT' | 'NORMAL';

const OPTIONS: {
  value: UrgencyValue;
  label: string;
  desc: string;
  selectedClass: string;
}[] = [
  {
    value: 'CRITICAL',
    label: '초긴급',
    desc: '1시간 내',
    selectedClass: 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-400',
  },
  {
    value: 'URGENT',
    label: '긴급',
    desc: '2시간 내',
    selectedClass: 'border-orange-500 bg-orange-50 text-orange-700 ring-2 ring-orange-400',
  },
  {
    value: 'NORMAL',
    label: '일반',
    desc: '순차 처리',
    selectedClass: 'border-neutral-500 bg-neutral-100 text-neutral-800 ring-2 ring-neutral-400',
  },
];

export default function UrgencySelect({
  value,
  onChange,
}: {
  value: UrgencyValue | null;
  onChange: (v: UrgencyValue) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-xl border p-3 text-center ${
            value === opt.value
              ? opt.selectedClass
              : 'border-border bg-white text-muted'
          }`}
        >
          <div className="text-base font-bold">{opt.label}</div>
          <div className="mt-0.5 text-xs">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}
