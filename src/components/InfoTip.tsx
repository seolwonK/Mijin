'use client';

import { useEffect, useId, useState } from 'react';

export default function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="산식 안내"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-400 text-xs font-bold text-neutral-600 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        ?
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-0 top-6 z-10 w-64 rounded-admin-sm bg-neutral-800 px-3 py-2 text-xs leading-5 text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
