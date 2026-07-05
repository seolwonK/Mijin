'use client';

import { useEffect, useRef, useState } from 'react';

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionInstance)
    | null;
}

export default function SpeechInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const baseRef = useRef('');
  const finalRef = useRef('');

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => recRef.current?.stop();
  }, []);

  function toggleListening() {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.interimResults = true;
    rec.continuous = true;
    baseRef.current = value ? value.trim() + ' ' : '';
    finalRef.current = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += t;
        else interim += t;
      }
      onChange(baseRef.current + finalRef.current + interim);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '예) 안방 콘센트에서 타는 냄새가 나고 전기가 나갔어요'}
        rows={4}
        className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
      />
      {supported && (
        <button
          type="button"
          onClick={toggleListening}
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium ${
            listening
              ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
              : 'border-gray-300 bg-white text-gray-700'
          }`}
        >
          {listening ? '🔴 듣는 중… 탭하여 종료' : '🎤 음성으로 입력하기'}
        </button>
      )}
    </div>
  );
}
