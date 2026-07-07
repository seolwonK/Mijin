import type { SttProvider } from './index';

// Whisper 는 파일 확장자로 포맷을 판별하므로 mime→확장자 매핑이 필요
const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

// OpenAI 호환 음성 인식 API (기본 Whisper).
// OPENAI_BASE_URL 로 Groq 등 OpenAI 호환 서비스도 사용 가능.
export const openaiSttProvider: SttProvider = {
  name: 'openai',
  async transcribe(audio, mime) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY 환경변수가 필요합니다');
    const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(
      /\/+$/,
      '',
    );
    const model = process.env.OPENAI_STT_MODEL ?? 'whisper-1';

    const form = new FormData();
    form.append(
      'file',
      new Blob([audio as BlobPart], { type: mime }),
      `voice.${EXT_BY_MIME[mime] ?? 'webm'}`,
    );
    form.append('model', model);
    form.append('language', 'ko');
    form.append('response_format', 'json');

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`STT ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { text?: string };
    return data.text ?? '';
  },
};
