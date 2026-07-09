'use client';

import { useCallback, useRef, useState } from 'react';
import { buttonClasses } from '@/components/Button';

// 네이티브 window.confirm 대신 앱 톤의 확인 모달. 컴포넌트에서
//   const [confirm, confirmUI] = useConfirm();
//   if (!(await confirm({ message: '…', danger: true }))) return;
//   ...  {confirmUI}  // JSX 어딘가에 렌더
type ConfirmOpts = {
  title?: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
};

export function useConfirm(): [(o: ConfirmOpts) => Promise<boolean>, React.ReactNode] {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  const ui = opts ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="닫기"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => close(false)}
      />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-pop">
        {opts.title && <h2 className="text-base font-bold">{opts.title}</h2>}
        <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{opts.message}</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className={buttonClasses('secondary', 'md', 'flex-1')}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={buttonClasses(opts.danger ? 'danger' : 'primary', 'md', 'flex-1')}
          >
            {opts.confirmText ?? '확인'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return [confirm, ui];
}
