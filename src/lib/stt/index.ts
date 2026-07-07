import { prisma } from '@/lib/db';
import { geminiSttProvider } from './gemini';
import { openaiSttProvider } from './openai';

export interface SttProvider {
  name: string;
  transcribe(audio: Uint8Array, mime: string): Promise<string>;
}

// 음성만으로 접수된 건의 임시 본문 — STT 성공 시 변환 텍스트로 교체된다
export const VOICE_PLACEHOLDER = '🎤 음성 접수 (텍스트 변환 전)';

function getProvider(): SttProvider | null {
  switch (process.env.STT_PROVIDER) {
    case 'gemini':
      return geminiSttProvider;
    case 'openai':
      return openaiSttProvider;
    default:
      return null;
  }
}

// 변환 실패가 접수 본 플로우를 깨지 않도록 예외를 삼킨다 (SMS와 동일한 정책).
// 고객 응답을 지연시키지 않도록 호출부에서 await 하지 않는다.
export async function transcribeVoiceNote(
  requestId: string,
  audio: Uint8Array,
  mime: string,
): Promise<void> {
  const provider = getProvider();
  if (!provider) return;
  try {
    const text = (await provider.transcribe(audio, mime)).trim().slice(0, 2000);
    if (!text) return;
    await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { voiceTranscript: text },
    });
    // 음성만으로 접수된 건은 변환 텍스트를 본문으로 승격
    await prisma.serviceRequest.updateMany({
      where: { id: requestId, description: VOICE_PLACEHOLDER },
      data: { description: text },
    });
  } catch (e) {
    console.error(
      `[STT 변환 실패 requestId=${requestId}]`,
      e instanceof Error ? e.message : e,
    );
  }
}
