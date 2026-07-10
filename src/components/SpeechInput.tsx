'use client';

import { useEffect, useRef, useState } from 'react';
import { MicIcon } from '@/components/icons';

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

// iOS의 비-Safari 브라우저(크롬·엣지 등)와 인앱 웹뷰는 Web Speech API가 없고,
// getUserMedia 호출이 권한창도 거부도 없이 무한 대기한다 → 음성 입력 자체가 불가능(iOS는 Safari 전용).
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iP(hone|od|ad)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// getUserMedia가 무한 대기하는 브라우저를 대비해 타임아웃을 건다. 타임아웃 후 뒤늦게
// 스트림이 도착하면 트랙을 정리해 마이크를 놓아준다.
function getMicStream(timeoutMs: number): Promise<MediaStream | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (s: MediaStream | null) => {
      if (settled) {
        s?.getTracks().forEach((t) => t.stop());
        return;
      }
      settled = true;
      resolve(s);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (s) => {
        clearTimeout(timer);
        done(s);
      },
      () => {
        clearTimeout(timer);
        done(null);
      },
    );
  });
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
  const [voiceBlocked, setVoiceBlocked] = useState(false);
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const srRef = useRef<SpeechRecognitionInstance | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseRef = useRef('');
  const finalRef = useRef('');

  useEffect(() => {
    const stt = getSpeechRecognition() !== null;
    setSttSupported(stt);
    setRecSupported(recorderSupported());
    // iOS인데 Web Speech가 없으면 Safari가 아니라는 신호 — 녹음(getUserMedia)도 무한 대기하므로
    // 버튼을 숨기고 안내로 대체한다.
    setVoiceBlocked(isIos() && !stt);
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
      // 무한 대기 브라우저 대비 타임아웃 — 못 얻으면 조용히 실패 처리
      const stream = await getMicStream(5000);
      if (!stream) return false;
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
    setPreparing(true);
    const recording = await startRecorder();
    const stt = startStt();
    setPreparing(false);
    if (!recording && !stt) {
      setMicError('마이크를 사용할 수 없습니다. 권한을 확인하거나 직접 입력해 주세요.');
      return;
    }
    timerRef.current = setTimeout(stopAll, MAX_RECORD_MS);
    setListening(true);
  }

  const voiceAvailable = (sttSupported || recSupported) && !voiceBlocked;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '예) 안방 콘센트에서 타는 냄새가 나고 전기가 나갔어요'}
        rows={4}
        className="w-full rounded-xl border border-neutral-300 p-3 text-base focus:border-brand-500 focus:outline-none"
      />
      {voiceAvailable && (
        <button
          type="button"
          onClick={toggleListening}
          disabled={preparing}
          className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl border p-3 text-base font-medium disabled:opacity-60 ${
            listening
              ? 'animate-pulse border-red-300 bg-red-50 text-red-600'
              : 'border-neutral-300 bg-white text-neutral-700'
          }`}
        >
          {preparing ? (
            '마이크 준비 중…'
          ) : listening ? (
            <>
              <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              {recSupported ? '녹음 중… 탭하여 종료' : '듣는 중… 탭하여 종료'}
            </>
          ) : (
            <>
              <MicIcon className="h-4 w-4 shrink-0" />
              음성으로 입력하기
            </>
          )}
        </button>
      )}
      {voiceBlocked && (
        <p className="mt-2 text-xs text-neutral-500">
          아이폰·아이패드에서는 <b className="font-semibold">Safari</b>에서만 음성 입력이 됩니다.
          Safari로 열거나 위 칸에 직접 입력해 주세요.
        </p>
      )}
      {listening && recSupported && (
        <p className="mt-1 text-xs text-neutral-400">
          말씀이 끝나면 종료를 눌러 주세요. 녹음본이 접수와 함께 전달됩니다.
        </p>
      )}
      {micError && <p className="mt-1 text-xs text-red-500">{micError}</p>}
      {voice && previewUrl && !listening && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2">
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
