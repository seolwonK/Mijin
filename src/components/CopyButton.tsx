'use client';

import { useState } from 'react';
import { ClipboardIcon } from '@/components/icons';

// 텍스트(접수번호 등)를 클립보드에 복사하는 작은 버튼. 복사 후 1.5초간 확인 표시.
export default function CopyButton({
  value,
  label = '복사',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없거나 실패해도 조용히 무시 (접수번호는 화면에 그대로 보임)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-muted transition active:scale-[0.98] hover:bg-neutral-50 active:bg-neutral-100"
    >
      {copied ? (
        '✓ 복사됨'
      ) : (
        <>
          <ClipboardIcon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </>
      )}
    </button>
  );
}
