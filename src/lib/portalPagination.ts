import type { Prisma } from '@prisma/client';

export type PortalCursor = { createdAt: string; id: string };
export function encodePortalCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString('base64url');
}
export function decodePortalCursor(value: string | null): PortalCursor | null {
  if (!value) return null;
  try {
    if (value.length > 1024) throw new Error();
    const c = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (
      typeof c.id !== 'string' ||
      !c.id ||
      c.id.length > 200 ||
      typeof c.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(c.createdAt))
    )
      throw new Error();
    return { id: c.id, createdAt: new Date(c.createdAt).toISOString() };
  } catch {
    throw new Error(
      '목록 위치가 올바르지 않습니다. 처음부터 다시 조회해 주세요.',
    );
  }
}
export function afterCursor(cursor: PortalCursor | null) {
  return cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      }
    : {};
}
export const activePortalJobs: Prisma.AssignmentWhereInput = {
  OR: [
    { status: 'REQUESTED' },
    {
      status: 'ACCEPTED',
      request: { status: { in: ['ACCEPTED', 'DISPATCHED'] } },
    },
  ],
};
