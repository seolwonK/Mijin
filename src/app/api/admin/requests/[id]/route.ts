import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { ASSIGNEE_INCLUDE, resolveAssignee } from '@/lib/assignee';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const [request, settings] = await Promise.all([
    prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { createdAt: 'desc' },
          include: ASSIGNEE_INCLUDE,
        },
        survey: true,
      },
    }),
    prisma.appSettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }

  // 카운트다운 원천(A-5, additive) — 긴급도→AppSettings.waitMinutes{Critical|Urgent|Normal}
  // 컬럼 매핑(autoAssign.ts:12-16과 동일한 매핑, matching.ts/autoAssign.ts는 무접촉).
  const waitMinutesByUrgency = settings
    ? {
        CRITICAL: settings.waitMinutesCritical,
        URGENT: settings.waitMinutesUrgent,
        NORMAL: settings.waitMinutesNormal,
      }
    : null;

  return NextResponse.json({
    id: request.id,
    lookupCode: request.lookupCode,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    description: request.description,
    hasVoice: !!(request.voiceFileId || request.voicePath),
    voiceTranscript: request.voiceTranscript,
    urgency: request.urgency,
    status: request.status,
    lat: request.lat,
    lng: request.lng,
    address: request.address,
    needsAttention: request.needsAttention,
    assignBaseAt: request.assignBaseAt,
    autoAssignEnabled: settings?.autoAssignEnabled ?? false,
    waitMinutes: waitMinutesByUrgency ? waitMinutesByUrgency[request.urgency] : null,
    createdAt: request.createdAt,
    completedAt: request.completedAt,
    assignments: request.assignments.map((a) => ({
      id: a.id,
      status: a.status,
      assignedBy: a.assignedBy,
      distanceKm: a.distanceKm,
      rejectReason: a.rejectReason,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt,
      assignee: resolveAssignee(a),
    })),
    // survey === null: row 자체가 없음 = "미발송"(기능 도입 전 완료 건 또는 미완료 건).
    // survey.submitted === false: row는 있지만 아직 제출 전 = "미참여".
    survey: request.survey
      ? {
          submitted: request.survey.submittedAt != null,
          rating: request.survey.rating,
          comment: request.survey.comment,
          paidAmount: request.survey.paidAmount,
          submittedAt: request.survey.submittedAt,
        }
      : null,
  });
}
