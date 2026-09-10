'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buttonClasses } from '@/components/Button';
import adminStyles from '@/components/admin-queue.module.css';

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

export function useConfirm(appearance: 'default' | 'admin' = 'default'): [(o: ConfirmOpts) => Promise<boolean>, React.ReactNode] {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const confirm = useCallback((o: ConfirmOpts) => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
    const returnTarget = trigger.current;
    requestAnimationFrame(() => {
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
    });
  }, []);

  return [confirm, opts ? <ConfirmDialog opts={opts} close={close} appearance={appearance} /> : null];
}

function ConfirmDialog({ opts, close, appearance }: { opts: ConfirmOpts; close: (value: boolean) => void; appearance: 'default' | 'admin' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      aria-label={opts.title ?? '확인'}
      onCancel={event => { event.preventDefault(); close(false); }}
      onClick={event => { if (event.target === event.currentTarget) close(false); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      className={`fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-sm overflow-visible rounded-2xl border-0 bg-transparent p-0 text-fg backdrop:bg-slate-900/40 ${appearance === 'admin' ? adminStyles.confirm : ''}`}
    >
      <div className="rounded-2xl bg-white p-6 shadow-pop">
        {opts.title && <h2 className="text-base font-bold">{opts.title}</h2>}
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{opts.message}</p>
        <div className="mt-6 flex gap-2">
          <button type="button" autoFocus onClick={() => close(false)} className={appearance === 'admin' ? `${adminStyles.button} flex-1` : buttonClasses('secondary', 'md', 'flex-1')}>취소</button>
          <button type="button" onClick={() => close(true)} className={appearance === 'admin' && !opts.danger ? `${adminStyles.primary} flex-1` : buttonClasses(opts.danger ? 'danger' : 'primary', 'md', 'flex-1')}>{opts.confirmText ?? '확인'}</button>
        </div>
      </div>
    </dialog>, document.body,
  );
}
