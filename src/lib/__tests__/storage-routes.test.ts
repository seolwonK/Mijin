import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ session: vi.fn(), request: vi.fn(), provider: vi.fn(), file: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireSession: mocks.session }));
vi.mock('@/lib/db', () => ({ prisma: {
  serviceRequest: { findUnique: mocks.request }, provider: { findUnique: mocks.provider },
  storedFile: { findUnique: mocks.file },
} }));
vi.mock('@/lib/storage/r2', () => ({ r2Get: mocks.get }));
import { GET as voice } from '@/app/api/admin/requests/[id]/voice/route';
import { GET as bizCert } from '@/app/api/admin/providers/[id]/cert/route';
import { GET as elecCert } from '@/app/api/admin/providers/[id]/elec-cert/route';

const body = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17]);
const context = { params: Promise.resolve({ id: 'entity' }) };
const request = (range?: string) => new NextRequest('http://localhost/api/file', { headers: range ? { range } : {} });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ role: 'ADMIN' });
  mocks.request.mockResolvedValue({ voiceFileId: 'file', voiceMime: 'audio/wav' });
  mocks.provider.mockResolvedValue({ bizCertFileId: 'file', elecCertFileId: 'file' });
  mocks.file.mockResolvedValue({ storageKey: 'r2-key', data: null, mime: 'application/pdf' });
  mocks.get.mockResolvedValue({ body, contentType: 'application/octet-stream' });
});

describe.each([['음성', voice], ['사업자등록증', bizCert], ['전기공사업등록증', elecCert]] as const)('%s 파일 조회', (_, handler) => {
  it('R2 본문 조회 + 비공개 캐시 + MIME 보호', async () => {
    const res = await handler(request(), context);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.session).toHaveBeenCalledWith('ADMIN');
  });
  it('관리자 인증 실패 시 저장소 호출 전 차단', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await handler(request(), context)).status).toBe(401);
    expect(mocks.file).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('R2 객체 누락은 404', async () => {
    mocks.get.mockResolvedValue(null);
    expect((await handler(request(), context)).status).toBe(404);
  });
  it('R2 연결 장애는 502', async () => {
    mocks.get.mockRejectedValue(new Error('timeout'));
    expect((await handler(request(), context)).status).toBe(502);
  });
  it('기존 DB 파일 조회 유지', async () => {
    mocks.file.mockResolvedValue({ storageKey: null, data: body, mime: 'application/pdf' });
    const res = await handler(request(), context);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('R2 음성 Range 재생', () => {
  it.each([
    ['bytes=0-2', 0, 2], ['bytes=3-', 3, 7], ['bytes=-3', 5, 7],
    ['bytes=0-999', 0, 7], ['bytes=-999', 0, 7],
  ])('%s → 206 정확한 바이트', async (range, start, end) => {
    const res = await voice(request(range), context);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes ${start}-${end}/8`);
    expect(res.headers.get('content-length')).toBe(String(end - start + 1));
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(body.subarray(start, end + 1));
  });
  it.each(['bytes=8-', 'bytes=4-2', 'bytes=-0'])('%s → 416', async range => {
    const res = await voice(request(range), context);
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */8');
  });
});
