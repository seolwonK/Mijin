import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

// 공개 추천인 조회 — 전화번호 정확 일치 + 승인된 업체/기술자만. 회원 명부 브라우징 방지용으로
// 마스킹 이름·유형·userId 외 정보는 응답에 담지 않는다.
// 인메모리 레이트리밋: IP당 분당 10회 (requests/lookup/route.ts:6-21과 동형).
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > 10;
}

const lookupSchema = z.object({
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
});

// 이름 마스킹: 2자는 성만 노출(김○), 3자 이상은 첫/끝 글자만 노출(김○수)
function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}○`;
  return `${trimmed[0]}${'○'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  // User.phone은 비유일이므로 다중 매치를 허용한다. 승인·활성 필터는 조회 후 적용해야
  // 하므로 넉넉히 가져온 뒤 최대 5건으로 자른다(사전 take=5는 필터 전 매치를 누락시킬 수 있음).
  const users = await prisma.user.findMany({
    where: {
      phone: parsed.data.phone,
      role: { in: ['PROVIDER', 'TECHNICIAN'] },
    },
    select: {
      id: true,
      name: true,
      role: true,
      provider: { select: { approvalStatus: true, isActive: true } },
      technician: { select: { approvalStatus: true, isActive: true } },
    },
    take: 20,
  });

  const matches = users
    .filter((u) => {
      const entity = u.role === 'PROVIDER' ? u.provider : u.technician;
      return entity?.approvalStatus === 'APPROVED' && entity.isActive;
    })
    .slice(0, 5)
    .map((u) => ({
      userId: u.id,
      maskedName: maskName(u.name),
      type: u.role === 'PROVIDER' ? ('업체' as const) : ('기술자' as const),
    }));

  return NextResponse.json({ matches });
}
