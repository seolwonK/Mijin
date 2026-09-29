'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buttonClasses } from '@/components/Button';
import { INSPECTION_RESULTS, RESULT_LABEL, type InspectionResult } from '@/lib/inspection';

// 점검 결과 배지와 결과 입력 모달. 관리자 일정표·고객 상세, 고객 마이페이지가 같은 색을 쓴다 —
// 한쪽에서 "주의"가 노랑인데 다른 쪽에서 빨강이면 고객과 통화할 때 말이 어긋난다.

const RESULT_TONE: Record<InspectionResult, string> = {
  NORMAL: 'bg-green-100 text-green-800',
  CAUTION: 'bg-amber-100 text-amber-900',
  NEEDS_VISIT: 'bg-red-100 text-red-800',
};

export function ResultBadge({ result }: { result: InspectionResult }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_TONE[result]}`}
    >
      {RESULT_LABEL[result]}
    </span>
  );
}

export type ResultInput = { result: InspectionResult | null; resultNote: string | null };

/**
 * 점검 결과 입력 — 완료 처리와 함께 쓰거나(confirmText "완료 처리"), 이미 완료한 회차의 결과를
 * 나중에 고칠 때 쓴다. 결과는 고르지 않아도 된다(통화가 짧게 끝난 회차 등).
 */
export function InspectionResultDialog({
  title,
  description,
  confirmText,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  description?: string;
  confirmText: string;
  initial?: ResultInput;
  onClose: () => void;
  onSubmit: (input: ResultInput) => Promise<void> | void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [result, setResult] = useState<InspectionResult | null>(initial?.result ?? null);
  const [note, setNote] = useState(initial?.resultNote ?? '');

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="inspection-result-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md overflow-visible rounded-2xl border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/40"
    >
      <form
        className="rounded-2xl bg-white p-6 shadow-pop"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ result, resultNote: note.trim() || null });
        }}
      >
        <h2 id="inspection-result-title" className="text-base font-bold">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
        )}
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-semibold">점검 결과</legend>
          <div className="flex flex-wrap gap-2">
            {([null, ...INSPECTION_RESULTS] as const).map((value) => (
              <label
                key={value ?? 'none'}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-admin-md border px-3 text-sm ${
                  result === value ? 'border-admin-cyan-ink bg-admin-cyan-ink/5 font-semibold' : 'border-border'
                }`}
              >
                <input
                  type="radio"
                  name="inspection-result"
                  checked={result === value}
                  onChange={() => setResult(value)}
                />
                {value ? RESULT_LABEL[value] : '기록 안 함'}
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor="inspection-result-note" className="mt-4 block text-sm font-semibold">
          결과 설명 <span className="font-normal text-muted">(선택)</span>
        </label>
        <textarea
          id="inspection-result-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={4}
          aria-describedby="inspection-result-hint"
          className="mt-1 w-full rounded-admin-md border border-border p-3 text-sm"
          placeholder="예) 분전반 누전차단기 정상 작동 확인. 욕실 콘센트 덮개 교체 권장."
        />
        <p id="inspection-result-hint" className="mt-1 text-xs text-amber-700">
          결과와 설명은 고객의 마이페이지에 그대로 표시됩니다.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={buttonClasses('secondary', 'md', 'flex-1')}
          >
            닫기
          </button>
          <button type="submit" className={buttonClasses('primary', 'md', 'flex-1')}>
            {confirmText}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
