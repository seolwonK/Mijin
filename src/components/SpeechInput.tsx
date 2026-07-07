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

// 실시간 STT(Web Speech API)는 삼성인터넷·iOS Chrome 등에서 미지원 —
// MediaRecorder 녹음을 병행해 지원 폭을 넓히고, 녹음본은 접수와 함께 서버로 전송된다.
function recorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

// 브라우저별 지원 컨테이너가 다르다 (Chrome/삼성인터넷: webm+opus, iOS Safari: mp4)
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

const MAX_RECORD_MS = 180_000; // 3분 자동 종료

export type VoiceNote = { blob: Blob; mime: string };

export default function SpeechInput({
  value,
  onChange,
  voice,
  onVoiceChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  voice: VoiceNote | null;
  onVoiceChange: (v: VoiceNote | null) => void;
  placeholder?: string;
}) {
  const [sttSupported, setSttSupported] = useState(false);
  const [recSupported, setRecSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const srRef = useRef<SpeechRecognitionInstance | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRef = useRef('');
  const finalRef = useRef('');

  useEffect(() => {
    setSttSupported(getSpeechRecognition() !== null);
    setRecSupported(recorderSupported());
    return () => {
      srRef.current?.stop();
      if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 녹음 미리듣기 URL 수명 관리
  useEffect(() => {
    if (!voice) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(voice.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [voice]);

  function stopAll() {
    srRef.current?.stop();
    srRef.current = null;
    if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop();
    mrRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setListening(false);
  }

  function startStt(): boolean {
    const SR = getSpeechRecognition();
    if (!SR) return false;
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
    // STT는 침묵 시 스스로 끝날 수 있다 — 녹음이 진행 중이면 계속, 아니면 종료 처리
    rec.onend = () => {
      srRef.current = null;
      if (!mrRef.current || mrRef.current.state !== 'recording') setListening(false);
    };
    rec.onerror = () => {
      srRef.current = null;
      if (!mrRef.current || mrRef.current.state !== 'recording') setListening(false);
    };
    srRef.current = rec;
    rec.start();
    return true;
  }

  async function startRecorder(): Promise<boolean> {
    if (!recorderSupported()) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = (mr.mimeType || mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        if (blob.size > 0) onVoiceChange({ blob, mime: type });
      };
      mrRef.current = mr;
      mr.start();
      return true;
    } catch {
      return false;
    }
  }

  async function toggleListening() {
    if (listening) {
      stopAll();
      return;
    }
    setMicError(null);
    onVoiceChange(null); // 새 녹음 시작 → 기존 녹음 대체
    const recording = await startRecorder();
    const stt = startStt();
    if (!recording && !stt) {
      setMicError('마이크를 사용할 수 없습니다. 권한을 확인하거나 직접 입력해 주세요.');
      return;
    }
    timerRef.current = setTimeout(stopAll, MAX_RECORD_MS);
    setListening(true);
  }

  const voiceAvailable = sttSupported || recSupported;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '예) 안방 콘센트에서 타는 냄새가 나고 전기가 나갔어요'}
        rows={4}
        className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
      />
      {voiceAvailable && (
        <button
          type="button"
          onClick={toggleListening}
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium ${
            listening
              ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
              : 'border-gray-300 bg-white text-gray-700'
          }`}
        >
          {listening
            ? recSupported
              ? '🔴 녹음 중… 탭하여 종료'
              : '🔴 듣는 중… 탭하여 종료'
            : '🎤 음성으로 입력하기'}
        </button>
      )}
      {listening && recSupported && (
        <p className="mt-1 text-xs text-gray-400">
          말씀이 끝나면 종료를 눌러 주세요. 녹음본이 접수와 함께 전달됩니다.
        </p>
      )}
      {micError && <p className="mt-1 text-xs text-red-500">{micError}</p>}
      {voice && previewUrl && !listening && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
          <audio controls src={previewUrl} className="h-10 min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => onVoiceChange(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-red-500"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}
