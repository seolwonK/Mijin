import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(),
  configured: vi.fn(), put: vi.fn(), get: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: { storedFile: {
  create: mocks.create, findUnique: mocks.findUnique, delete: mocks.delete,
} } }));
vi.mock('@/lib/storage/r2', () => ({
  isR2Configured: mocks.configured, r2Put: mocks.put, r2Get: mocks.get, r2Delete: mocks.remove,
}));
import { deleteStoredFile, readStoredFile, saveStoredFile } from '@/lib/storage/files';

const body = new Uint8Array([0, 1, 127, 255]);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.put.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ id: 'file-1' });
});

describe('업로드 파일 저장소', () => {
  it.each(['voice', 'biz-cert', 'elec-cert'] as const)('%s 파일은 R2에 본문, DB에는 키만 저장', async category => {
    expect(await saveStoredFile(category, 'test/type', body)).toEqual({ id: 'file-1' });
    const key = mocks.put.mock.calls[0][0];
    expect(key).toMatch(new RegExp(`^files/${category}/[a-f0-9-]+$`));
    expect(mocks.put).toHaveBeenCalledWith(key, body, 'test/type');
    expect(mocks.create).toHaveBeenCalledWith({ data: { mime: 'test/type', storageKey: key }, select: { id: true } });
  });
  it('같은 종류/본문도 고유 키로 저장', async () => {
    await Promise.all([saveStoredFile('voice', 'audio/wav', body), saveStoredFile('voice', 'audio/wav', body)]);
    expect(mocks.put.mock.calls[0][0]).not.toBe(mocks.put.mock.calls[1][0]);
  });
  it('미설정 개발 환경은 DB 저장', async () => {
    mocks.configured.mockReturnValue(false);
    await saveStoredFile('voice', 'audio/wav', body);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({ data: { mime: 'audio/wav', data: body }, select: { id: true } });
  });
  it('R2 업로드 실패는 성공으로 숨기지 않고 DB 메타를 남기지 않는다', async () => {
    mocks.put.mockRejectedValue(new Error('unavailable'));
    await expect(saveStoredFile('voice', 'audio/wav', body)).rejects.toThrow('unavailable');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('DB 메타 저장 실패 시 업로드한 객체를 회수', async () => {
    mocks.create.mockRejectedValue(new Error('db failed'));
    await expect(saveStoredFile('biz-cert', 'application/pdf', body)).rejects.toThrow('db failed');
    expect(mocks.remove).toHaveBeenCalledWith(mocks.put.mock.calls[0][0]);
  });
  it('기존 DB 파일은 R2 호출 없이 동일 본문을 읽는다', async () => {
    mocks.findUnique.mockResolvedValue({ mime: 'audio/wav', data: body, storageKey: null });
    expect(await readStoredFile('legacy')).toEqual({ body, mime: 'audio/wav' });
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('R2 파일은 DB에 기록된 MIME으로 읽는다', async () => {
    mocks.findUnique.mockResolvedValue({ mime: 'audio/wav', data: null, storageKey: 'files/voice/id' });
    mocks.get.mockResolvedValue({ body, contentType: 'application/octet-stream' });
    expect(await readStoredFile('remote')).toEqual({ body, mime: 'audio/wav' });
  });
  it('DB 행이 없으면 null', async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect(await readStoredFile('missing')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('R2 객체가 없으면 null', async () => {
    mocks.findUnique.mockResolvedValue({ mime: 'audio/wav', storageKey: 'missing' });
    mocks.get.mockResolvedValue(null);
    expect(await readStoredFile('missing')).toBeNull();
  });
  it('R2 조회 오류는 빈 파일로 반환하지 않는다', async () => {
    mocks.findUnique.mockResolvedValue({ storageKey: 'key' });
    mocks.get.mockRejectedValue(new Error('timeout'));
    await expect(readStoredFile('remote')).rejects.toThrow('timeout');
  });
  it('R2 삭제 후 DB 메타 삭제', async () => {
    mocks.findUnique.mockResolvedValue({ storageKey: 'key' });
    await deleteStoredFile('remote');
    expect(mocks.remove).toHaveBeenCalledWith('key');
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'remote' } });
    expect(mocks.remove.mock.invocationCallOrder[0]).toBeLessThan(mocks.delete.mock.invocationCallOrder[0]);
  });
  it('R2 삭제 실패 시 재시도할 메타데이터 유지', async () => {
    mocks.findUnique.mockResolvedValue({ storageKey: 'key' });
    mocks.remove.mockRejectedValue(new Error('timeout'));
    await expect(deleteStoredFile('remote')).rejects.toThrow('timeout');
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it('DB 전용 파일 삭제', async () => {
    mocks.findUnique.mockResolvedValue({ storageKey: null });
    await deleteStoredFile('legacy');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalled();
  });
  it('없는 파일 삭제는 성공', async () => {
    mocks.findUnique.mockResolvedValue(null);
    await deleteStoredFile('missing');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
