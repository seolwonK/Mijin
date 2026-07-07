import type { SttProvider } from './index';

// Gemini 멀티모달 음성 이해로 받아쓰기 (generateContent + inlineData).
// 공식 지원 포맷: wav/mp3/aac/ogg/flac — webm(Chrome 녹음)·mp4(iOS 녹음)도 처리된다.
export const geminiSttProvider: SttProvider = {
  name: 'gemini',
  async transcribe(audio, mime) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 필요합니다');
    const model = process.env.GEMINI_STT_MODEL ?? 'gemini-2.5-flash';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mime,
                    data: Buffer.from(audio).toString('base64'),
                  },
                },
                {
                  // 무음/잡음에서 프롬프트 문구를 따라 말하는 환각 방지: 말이 없으면 빈 출력
                  text: '고객이 남긴 음성 메모입니다. 들리는 말을 한국어로 정확히 받아쓰세요. 설명·요약·덧붙임 없이 받아쓴 문장만 출력하고, 알아들을 수 있는 말이 없으면 아무것도 출력하지 마세요.',
                },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini STT ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  },
};
