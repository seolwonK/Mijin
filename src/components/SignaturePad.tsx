'use client';

import { useEffect, useRef, useState } from 'react';

// 캔버스 손글씨 서명 패드. 획이 끝날 때마다 PNG data URL 을 onChange 로 전달하고,
// 지우면 null 을 전달한다. 터치·마우스 모두 pointer 이벤트로 처리한다.
export default function SignaturePad({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
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
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    paintBackground(canvas);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
  }, []);

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
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
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-xl border border-border bg-white"
        // 강제 다크 모드(안드로이드 자동 다크 등)에서도 서명면은 항상 흰 종이 + 짙은 획 유지
        style={{ colorScheme: 'only light', backgroundColor: '#ffffff' }}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">
          {empty ? '위 칸에 손가락 또는 마우스로 서명해 주세요' : '서명됨'}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="text-sm font-medium text-brand-600 underline disabled:opacity-50"
        >
          지우기
        </button>
      </div>
    </div>
  );
}
