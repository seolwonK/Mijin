'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Keeps one mounted surface while switching between modal and inline layouts. */
export default function AdminDrawer({ children, label, className, onClose, closeDisabled = false, inlineAt }: {
  children: ReactNode; label: string; className: string; onClose: () => void;
  closeDisabled?: boolean; inlineAt?: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const media = inlineAt ? window.matchMedia(`(min-width: ${inlineAt}px)`) : null;
    let previousOverflow: string | null = null;
    const unlock = () => {
      if (previousOverflow !== null) document.body.style.overflow = previousOverflow;
      previousOverflow = null;
    };
    const adapt = () => {
      const inline = media?.matches ?? false;
      const scrollTop = node.scrollTop;
      node.close(); unlock();
      node.setAttribute('role', inline ? 'region' : 'dialog');
      if (inline) { node.removeAttribute('aria-modal'); node.show(); }
      else {
        node.setAttribute('aria-modal', 'true');
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        node.showModal();
      }
      node.scrollTop = scrollTop;
    };
    adapt();
    media?.addEventListener('change', adapt);
    return () => { media?.removeEventListener('change', adapt); node.close(); unlock(); };
  }, [inlineAt]);
  return <dialog ref={dialog} className={className} aria-label={label}
    onCancel={event => {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      if (!closeDisabled) onClose();
    }}
    onClick={event => {
      if (event.target !== event.currentTarget || closeDisabled || !event.currentTarget.matches(':modal')) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}
    onKeyDown={event => {
      if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
      if (event.key === 'Escape' && !event.currentTarget.matches(':modal')) {
        event.stopPropagation();
        if (!closeDisabled) onClose();
        return;
      }
      if (event.key !== 'Tab' || !event.currentTarget.matches(':modal')) return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
  >{children}</dialog>;
}
