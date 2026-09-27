'use client';

import {
  TIME_SLOTS,
  TIME_SLOT_RANGE,
  TIME_SLOT_SHORT,
  type TimeSlot,
} from '@/lib/inspection';

// 희망 시간대 선택 — 신청서와 마이페이지의 회차 예약이 같은 것을 쓴다.
//
// 셋 중 하나만 고르는 선택이라 토글 버튼이 아니라 **라디오**다. 네이티브 radio 를 그대로 두고
// 모양만 입히면 방향키 이동·그룹 낭독("3개 중 1번째")을 브라우저가 맡아 준다.
export default function InspectionTimeSlotPicker({
  name,
  value,
  onChange,
}: {
  /** 한 화면에 여러 개가 뜰 수 있으므로(회차 카드) 라디오 그룹 이름을 밖에서 받는다. */
  name: string;
  value: TimeSlot;
  onChange: (slot: TimeSlot) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">희망 시간대</legend>
      <div className="grid grid-cols-3 gap-2">
        {TIME_SLOTS.map((slot) => {
          const checked = value === slot;
          return (
            <label
              key={slot}
              className={`flex min-h-14 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40 ${
                checked
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-border bg-white text-fg'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={slot}
                checked={checked}
                onChange={() => onChange(slot)}
                className="sr-only"
              />
              <span>{TIME_SLOT_SHORT[slot]}</span>
              <span className="text-xs font-normal opacity-75">{TIME_SLOT_RANGE[slot]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
