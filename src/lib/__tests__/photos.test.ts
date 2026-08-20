import { describe, expect, it } from 'vitest';
import { collectPhotoUploads, MAX_PHOTOS, sniffPhotoMime } from '@/lib/photos';

function jpeg(extra = 0): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(extra).fill(0)]);
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([
  ...[0x52, 0x49, 0x46, 0x46], // "RIFF"
  0, 0, 0, 0,
  ...[0x57, 0x45, 0x42, 0x50], // "WEBP"
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

function file(bytes: ArrayLike<number>, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function formWith(...files: File[]): FormData {
  const fd = new FormData();
  fd.append('customerName', '홍길동');
  for (const f of files) fd.append('photos', f, f.name);
  return fd;
}

describe('sniffPhotoMime', () => {
  it('JPEG·PNG·WEBP 매직바이트를 알아본다', () => {
    expect(sniffPhotoMime(jpeg())).toBe('image/jpeg');
    expect(sniffPhotoMime(PNG)).toBe('image/png');
    expect(sniffPhotoMime(WEBP)).toBe('image/webp');
  });

  it('그 외 포맷과 잘린 파일은 null', () => {
    expect(sniffPhotoMime(GIF)).toBeNull();
    expect(sniffPhotoMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffPhotoMime(new Uint8Array())).toBeNull();
  });
});

describe('collectPhotoUploads', () => {
  it('사진이 없으면 빈 목록 (사진은 선택 항목)', async () => {
    expect(await collectPhotoUploads(formWith())).toEqual({ photos: [] });
  });

  it('첨부 순서대로 모은다', async () => {
    const result = await collectPhotoUploads(
      formWith(file(jpeg(), 'a.jpg', 'image/jpeg'), file(PNG, 'b.png', 'image/png')),
    );
    expect('photos' in result && result.photos.map((p) => p.mime)).toEqual([
      'image/jpeg',
      'image/png',
    ]);
  });

  it('선언된 MIME 이 아니라 실제 내용을 믿는다', async () => {
    // 브라우저가 붙이는 타입은 확장자에서 오므로 거짓말일 수 있다. 그대로 저장하면
    // 나중에 그 MIME 그대로 되돌려주게 된다.
    const result = await collectPhotoUploads(
      formWith(file(jpeg(), 'fake.png', 'image/png')),
    );
    expect('photos' in result && result.photos[0].mime).toBe('image/jpeg');
  });

  it('지원하지 않는 형식은 거부한다', async () => {
    const result = await collectPhotoUploads(formWith(file(GIF, 'x.gif', 'image/gif')));
    expect('error' in result && result.error).toBe('UNSUPPORTED');
  });

  it('빈 파일은 첨부로 치지 않는다', async () => {
    // 일부 브라우저는 선택 없이도 빈 File 을 실어 보낸다.
    const result = await collectPhotoUploads(
      formWith(file(new Uint8Array(), 'empty.jpg', 'image/jpeg')),
    );
    expect(result).toEqual({ photos: [] });
  });

  it(`${MAX_PHOTOS}장을 넘기면 거부한다`, async () => {
    const files = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) =>
      file(jpeg(), `${i}.jpg`, 'image/jpeg'),
    );
    const result = await collectPhotoUploads(formWith(...files));
    expect('error' in result && result.error).toBe('TOO_MANY');
  });

  it('장당 용량 상한을 넘기면 거부한다', async () => {
    const huge = file(jpeg(11 * 1024 * 1024), 'big.jpg', 'image/jpeg');
    const result = await collectPhotoUploads(formWith(huge));
    expect('error' in result && result.error).toBe('TOO_LARGE');
  });
});
