import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { isR2Configured, r2Delete, r2Get, r2Put } from './r2';

type FileCategory = 'voice' | 'biz-cert' | 'elec-cert';

/** R2 사용 시 DB에는 메타데이터만 저장한다. 업로드 오류를 DB 저장으로 숨기지 않는다. */
export async function saveStoredFile(category: FileCategory, mime: string, body: Uint8Array) {
  if (!isR2Configured()) {
    return prisma.storedFile.create({
      data: { mime, data: new Uint8Array(body) }, select: { id: true },
    });
  }
  const storageKey = `files/${category}/${randomUUID()}`;
  await r2Put(storageKey, body, mime);
  try {
    return await prisma.storedFile.create({
      data: { mime, storageKey }, select: { id: true },
    });
  } catch (error) {
    await r2Delete(storageKey).catch(() => console.error('[files] 업로드 롤백 실패', storageKey));
    throw error;
  }
}

/** 기존 DB 파일과 신규 R2 파일을 동일한 ID로 조회한다. 호출자가 권한을 확인해야 한다. */
export async function readStoredFile(id: string): Promise<{ body: Uint8Array; mime: string } | null> {
  const stored = await prisma.storedFile.findUnique({ where: { id } });
  if (!stored) return null;
  if (stored.storageKey) {
    const object = await r2Get(stored.storageKey);
    return object ? { body: object.body, mime: stored.mime } : null;
  }
  return stored.data ? { body: stored.data, mime: stored.mime } : null;
}

/** 가입/접수 실패 시 새로 만든 파일을 회수한다. R2 삭제 실패 시 재시도용 메타는 유지한다. */
export async function deleteStoredFile(id: string): Promise<void> {
  const stored = await prisma.storedFile.findUnique({ where: { id }, select: { storageKey: true } });
  if (!stored) return;
  if (stored.storageKey) await r2Delete(stored.storageKey);
  await prisma.storedFile.delete({ where: { id } });
}
