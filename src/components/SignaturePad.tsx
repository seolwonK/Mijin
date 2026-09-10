'use client';

import { useEffect, useId, useRef, useState } from 'react';

// 캔버스 손글씨 서명 패드. 획이 끝날 때마다 PNG data URL 을 onChange 로 전달하고,
// 지우면 null 을 전달한다. 터치·마우스 모두 pointer 이벤트로 처리한다.
export default function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [empty, setEmpty] = useState(true);

  // 흰 배경을 비트맵에 직접 채운다 — 투명 PNG 로 내보내면 다크 배경(강제 다크 모드,
  // 어두운 뷰어) 위에서 짙은 획이 보이지 않는다. 내보내는 서명 자체를 흰 종이로 만든다.
  function paintBackground(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1000;
    canvas.height = 400;
    paintBackground(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvasRef.current!.width) / rect.width,
      y: ((e.clientY - rect.top) * canvasRef.current!.height) / rect.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || mode !== 'draw') return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pointFrom(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasDrawn.current) {
      hasDrawn.current = true;
      setEmpty(false);
    }
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasDrawn.current) onChange(canvasRef.current!.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current!;
    paintBackground(canvas); // 투명이 아니라 흰 종이로 되돌린다
    hasDrawn.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <fieldset disabled={disabled} className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-medium">서명 방법</legend>
        {[
          ['draw', '직접 그리기'],
          ['type', '이름 입력하기'],
        ].map(([value, label]) => (
          <label
            key={value}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
          >
            <input
              type="radio"
              name={`${inputId}-mode`}
              checked={mode === value}
              onChange={() => {
                setMode(value as 'draw' | 'type');
                setConsent(false);
                clear();
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {mode === 'type' && (
        <div className="space-y-2">
          <label htmlFor={inputId} className="block text-sm font-medium">
            서명에 사용할 성명
          </label>
          <input
            id={inputId}
            value={name}
            maxLength={50}
            disabled={disabled}
            onChange={(e) => {
              setName(e.target.value);
              clear();
            }}
            className="min-h-12 w-full rounded-lg border border-border px-3"
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              disabled={disabled}
              onChange={(e) => {
                setConsent(e.target.checked);
                clear();
              }}
            />
            입력한 이름을 내 서명으로 사용합니다.
          </label>
          <button
            type="button"
            disabled={disabled || !name.trim() || !consent}
            onClick={() => {
              const canvas = canvasRef.current!;
              paintBackground(canvas);
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = '#111827';
              ctx.font = '64px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(
                name.trim(),
                canvas.width / 2,
                canvas.height / 2,
                canvas.width - 80,
              );
              hasDrawn.current = true;
              setEmpty(false);
              onChange(canvas.toDataURL('image/png'));
            }}
            className="min-h-11 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            이름으로 서명 적용
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        role="img"
        aria-label={
          empty
            ? '서명 영역 · 직접 그리거나 이름 입력하기를 선택해 주세요'
            : '작성한 서명'
        }
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className="h-40 w-full touch-none rounded-xl border border-border bg-white"
        // 강제 다크 모드(안드로이드 자동 다크 등)에서도 서명면은 항상 흰 종이 + 짙은 획 유지
        style={{ colorScheme: 'only light', backgroundColor: '#ffffff' }}
      />
      <div className="flex items-center justify-between">
        <span role="status" className="text-sm text-muted">
          {empty
            ? mode === 'draw'
              ? '위 칸에 손가락 또는 마우스로 서명해 주세요'
              : '이름 입력 후 서명 적용을 눌러 주세요'
            : '서명됨'}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="min-h-11 px-3 text-sm font-medium text-brand-600 underline disabled:opacity-50"
        >
          지우기
        </button>
      </div>
    </div>
  );
}
