import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getRatingSubjectDetail, parseRatingSubject } from '@/lib/ratingsAnalytics';

export async function GET(req: NextRequest, { params }: { params: Promise<{ subject: string }> }) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const parsed = parseRatingSubject((await params).subject);
  if (!parsed) return NextResponse.json({ error: 'subject는 PROVIDER:<id> 또는 TECHNICIAN:<id> 형식이어야 합니다' }, { status: 400 });

  const subject = parsed.kind === 'PROVIDER'
    ? await prisma.provider.findUnique({ where: { id: parsed.id }, select: { id: true } })
    : await prisma.technician.findUnique({ where: { id: parsed.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });

  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  return NextResponse.json(await getRatingSubjectDetail(parsed.kind, parsed.id, cursor));
}
