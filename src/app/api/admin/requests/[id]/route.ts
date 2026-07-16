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
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { createdAt: 'desc' },
        include: ASSIGNEE_INCLUDE,
      },
      survey: true,
    },
  });
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }

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
