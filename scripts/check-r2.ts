import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { r2Config, r2Delete, r2Get, r2Put, signRequest } from '../src/lib/storage/r2';

async function main() {
  const config = r2Config();
  if (!config) throw new Error('R2 환경변수 4개를 설정해 주세요.');
  const prefix = `connection-check/${randomUUID()}`;
  const files = [
    { name: 'image.png', mime: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64') },
    { name: 'voice.wav', mime: 'audio/wav', body: Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x40\x1f\x00\x00\x80\x3e\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00', 'binary') },
    { name: 'certificate.pdf', mime: 'application/pdf', body: Buffer.from('%PDF-1.4\n% synthetic storage connection test\n%%EOF\n') },
  ];
  for (const file of files) {
    const key = `${prefix}/${file.name}`;
    try {
      await r2Put(key, file.body, file.mime);
      const actual = await r2Get(key);
      assert(actual);
      assert.deepEqual(Buffer.from(actual.body), file.body);
      assert.equal(actual.contentType, file.mime);
      const { url } = signRequest(config, 'GET', key, null);
      const anonymous = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      assert([400, 401, 403].includes(anonymous.status), `비인증 조회가 허용됨: ${anonymous.status}`);
      console.log(JSON.stringify({ file: file.name, upload: 'PASS', byteMatch: 'PASS', mime: 'PASS', anonymousBlocked: anonymous.status }));
    } finally {
      await r2Delete(key);
    }
    assert.equal(await r2Get(key), null);
    console.log(JSON.stringify({ file: file.name, deleteVerified: 'PASS' }));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'R2 검사 실패');
  process.exitCode = 1;
});
