import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// ───────────────────────────────────────────────────────────────────────────
// 네임스페이스 규율 (계획 1a)
//
//   9000xx  영속 픽스처 — 900001·900002·900010·900011·900012.
//           리셋만 허용, 삭제 절대 금지 (admin-queue.spec.ts:3 하드 의존).
//   9001xx  일회성 픽스처 — 이 모듈이 만들고 이 모듈이 지운다.
//
// 여기 있는 팩토리는 전부 9001 대역만 사용하고, 스윕/정리도 그 대역만 건드린다.
// SmsLog 는 어떤 경로로도 삭제하지 않는다 (설계상 증가하며 과금 감사 근거가 된다).
// ───────────────────────────────────────────────────────────────────────────

/** 일회성 접수 조회코드 접두 — `LIKE '9001%'` 스윕 대상. */
export const EPHEMERAL_CODE_PREFIX = '9001';
/** 일회성 계정 loginId 접두 — `LIKE '9001%'` 스윕 대상. */
export const EPHEMERAL_LOGIN_PREFIX = '9001';
/** 일회성 픽스처 전화번호 접두 (0 + 9자리 = tech/signup:20 의 `^0\d{8,10}$` 통과). */
export const EPHEMERAL_PHONE_PREFIX = '0109001';

/** 삭제 금지 영속 픽스처. 어떤 정리 경로도 이 목록을 건드리면 안 된다. */
export const DURABLE_CODES = ['900001', '900002', '900010', '900011', '900012'] as const;

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10);
  return out;
}

/** 9001 대역 조회코드(6자리). 충돌 시 재시도는 호출측 unique 위반 처리로 흡수한다. */
export function ephemeralLookupCode(): string {
  return EPHEMERAL_CODE_PREFIX + randomDigits(2);
}

/** 9001 대역 loginId — 워커 병렬 실행에서도 충돌하지 않도록 넉넉한 엔트로피를 준다. */
export function ephemeralLoginId(kind: string): string {
  return `${EPHEMERAL_LOGIN_PREFIX}-${kind}-${randomDigits(8)}`;
}

/** 9001 대역 휴대폰번호 (10자리). */
export function ephemeralPhone(): string {
  return EPHEMERAL_PHONE_PREFIX + randomDigits(3);
}

// ───────────────────────────────────────────────────────────────────────────
// 스윕 — 직전 실행이 크래시해 남긴 9001 대역 잔재를 FK 역순으로 회수한다.
// pretest-guard 가 **dev 서버 부팅 전에** 호출한다: 부팅 후면 자동배정 워커가
// RECEIVED 잔재를 물어 Assignment 를 만들고, 그 시점부터 기술자/업체 삭제가
// `assignment_one_assignee` CHECK 위반(SQLSTATE 23514)으로 영구 불가능해진다.
// ───────────────────────────────────────────────────────────────────────────

export type SweepResult = Record<string, number>;

export async function sweepEphemeral(prisma: PrismaClient): Promise<SweepResult> {
  // ⚠️ lookupCode 만으로는 **제품이 만든 접수를 절대 볼 수 없다.**
  // 스펙이 실제 POST /api/requests 를 태우면 조회코드는 제품이 생성하므로
  // (requests/route.ts:140 generateLookupCode) 9001 대역에 들어오지 않는다.
  // 실제로 그렇게 샌 행이 있었다 — lookupCode=568365, customerPhone=0109001737.
  // 이 부류는 어떤 스윕에도 안 잡혀 Step 0 의 239431(8일 방치)과 같은 모양이 된다.
  //
  // 이런 행에서 하네스가 통제하는 식별자는 전화번호뿐이다(ephemeralPhone 이 발급).
  // 그래서 조회코드 **또는** 픽스처 전화번호로 건다.
  const codeFilter = {
    OR: [
      { lookupCode: { startsWith: EPHEMERAL_CODE_PREFIX } },
      { customerPhone: { startsWith: EPHEMERAL_PHONE_PREFIX } },
    ],
  };
  const loginFilter = { loginId: { startsWith: EPHEMERAL_LOGIN_PREFIX } };

  const requests = await prisma.serviceRequest.findMany({
    where: codeFilter,
    select: { id: true, voiceFileId: true },
  });
  const users = await prisma.user.findMany({
    where: loginFilter,
    select: {
      id: true,
      provider: { select: { id: true, bizCertFileId: true } },
      technician: { select: { id: true } },
    },
  });

  const requestIds = requests.map((r) => r.id);
  const userIds = users.map((u) => u.id);
  const providerIds = users.flatMap((u) => (u.provider ? [u.provider.id] : []));
  const technicianIds = users.flatMap((u) => (u.technician ? [u.technician.id] : []));
  // StoredFile 은 네임스페이스 컬럼이 없다. 삭제 대상 행이 참조하던 id 만 회수한다
  // (참조를 잃은 뒤에는 어느 실행이 만든 파일인지 판별할 근거가 사라지므로 여기서 모은다).
  const fileIds = [
    ...requests.flatMap((r) => (r.voiceFileId ? [r.voiceFileId] : [])),
    ...users.flatMap((u) => (u.provider?.bizCertFileId ? [u.provider.bizCertFileId] : [])),
  ];

  return deleteInFkOrder(prisma, {
    requestIds,
    userIds,
    providerIds,
    technicianIds,
    fileIds,
    // 크래시 회수 시점의 본인인증 잔재는 9001 대역 번호로만 식별 가능하다.
    verificationPhonePrefix: EPHEMERAL_PHONE_PREFIX,
  });
}

type DeleteScope = {
  requestIds: string[];
  userIds: string[];
  providerIds: string[];
  technicianIds: string[];
  fileIds: string[];
  verificationIds?: string[];
  verificationPhonePrefix?: string;
};

/**
 * FK 역순 삭제. 순서가 곧 안전성이다 —
 * CommissionEntry → SatisfactionSurvey → Assignment → ServiceRequest →
 * EmploymentContract → Technician/Provider → User → IdentityVerification → StoredFile.
 * SmsLog 는 의도적으로 제외한다.
 */
async function deleteInFkOrder(prisma: PrismaClient, scope: DeleteScope): Promise<SweepResult> {
  const {
    requestIds,
    userIds,
    providerIds,
    technicianIds,
    fileIds,
    verificationIds = [],
    verificationPhonePrefix,
  } = scope;
  const result: SweepResult = {};
  const note = (key: string, n: number) => {
    if (n > 0) result[key] = (result[key] ?? 0) + n;
  };

  if (requestIds.length) {
    const surveys = await prisma.satisfactionSurvey.findMany({
      where: { requestId: { in: requestIds } },
      select: { id: true },
    });
    const surveyIds = surveys.map((s) => s.id);
    if (surveyIds.length) {
      note(
        'CommissionEntry',
        (await prisma.commissionEntry.deleteMany({ where: { surveyId: { in: surveyIds } } })).count,
      );
      note(
        'SatisfactionSurvey',
        (await prisma.satisfactionSurvey.deleteMany({ where: { id: { in: surveyIds } } })).count,
      );
    }
    note(
      'Assignment',
      (await prisma.assignment.deleteMany({ where: { requestId: { in: requestIds } } })).count,
    );
    note(
      'ServiceRequest',
      (await prisma.serviceRequest.deleteMany({ where: { id: { in: requestIds } } })).count,
    );
  }

  // 픽스처 기술자·업체가 네임스페이스 밖 접수에 배정돼 있을 수 있다(워커 오작동 잔재).
  // Assignment 를 먼저 끊지 않으면 assignment_one_assignee CHECK 로 삭제가 막힌다.
  if (providerIds.length || technicianIds.length) {
    const orphan = await prisma.assignment.findMany({
      where: {
        OR: [
          ...(providerIds.length ? [{ providerId: { in: providerIds } }] : []),
          ...(technicianIds.length ? [{ technicianId: { in: technicianIds } }] : []),
        ],
      },
      select: { id: true },
    });
    if (orphan.length) {
      note(
        'Assignment',
        (await prisma.assignment.deleteMany({ where: { id: { in: orphan.map((a) => a.id) } } }))
          .count,
      );
    }
  }
  if (technicianIds.length) {
    note(
      'EmploymentContract',
      (
        await prisma.employmentContract.deleteMany({
          where: { technicianId: { in: technicianIds } },
        })
      ).count,
    );
    note(
      'Technician',
      (await prisma.technician.deleteMany({ where: { id: { in: technicianIds } } })).count,
    );
  }
  if (providerIds.length) {
    note(
      'Provider',
      (await prisma.provider.deleteMany({ where: { id: { in: providerIds } } })).count,
    );
  }
  if (userIds.length) {
    // 소개자로 지정된 흔적을 끊어야 User 삭제가 FK 로 막히지 않는다.
    await prisma.provider.updateMany({
      where: { referredByUserId: { in: userIds } },
      data: { referredByUserId: null },
    });
    await prisma.technician.updateMany({
      where: { referredByUserId: { in: userIds } },
      data: { referredByUserId: null },
    });
    note('User', (await prisma.user.deleteMany({ where: { id: { in: userIds } } })).count);
  }

  const verificationWhere = [
    ...(verificationIds.length ? [{ id: { in: verificationIds } }] : []),
    ...(verificationPhonePrefix ? [{ phone: { startsWith: verificationPhonePrefix } }] : []),
  ];
  if (verificationWhere.length) {
    note(
      'IdentityVerification',
      (await prisma.identityVerification.deleteMany({ where: { OR: verificationWhere } })).count,
    );
  }

  if (fileIds.length) {
    note(
      'StoredFile',
      (await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } })).count,
    );
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// 팩토리 — 스펙이 직접 쓰는 표면.
// 만든 id 를 전부 추적하고 cleanupAll() 이 같은 FK 역순으로 되돌린다.
// ───────────────────────────────────────────────────────────────────────────

export type RequestFixture = {
  id: string;
  lookupCode: string;
  customerName: string;
  customerPhone: string;
};
export type TechFixture = {
  technicianId: string;
  userId: string;
  loginId: string;
  password: string;
  name: string;
  phone: string;
};
export type PartnerFixture = {
  providerId: string;
  userId: string;
  loginId: string;
  password: string;
  name: string;
  phone: string;
};

export type RequestFixtureInput = {
  /** 기본 CANCELED — 워커가 꺼져 있어도 RECEIVED 픽스처를 기본값으로 흘리지 않는다. */
  status?: 'RECEIVED' | 'ASSIGNED' | 'ACCEPTED' | 'DISPATCHED' | 'COMPLETED' | 'CANCELED';
  urgency?: 'CRITICAL' | 'URGENT' | 'NORMAL';
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  description?: string;
  customerName?: string;
  assignBaseAt?: Date;
};

export type TechFixtureInput = {
  employmentType?: 'DAILY' | 'PERMANENT';
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  isActive?: boolean;
  regions?: string[];
  address?: string;
  lat?: number | null;
  lng?: number | null;
  /** CONFIRMED 로 주면 matching.ts:54 의 계약 게이트를 통과하는 상태로 만든다. */
  contractStatus?: 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | null;
  password?: string;
};

export type PartnerFixtureInput = {
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  isActive?: boolean;
  regions?: string[];
  address?: string;
  lat?: number | null;
  lng?: number | null;
  bizRegNo?: string;
  password?: string;
};

export type IdentityFixtureInput = {
  name?: string;
  phone?: string;
  /** 과거 시각을 주면 tech/signup:100-105 의 만료 분기를 재현할 수 있다. */
  expiresAt?: Date;
  consumedAt?: Date | null;
};

const DEFAULT_PASSWORD = 'e2epass1234';

export class FixtureFactory {
  private readonly requestIds: string[] = [];
  private readonly userIds: string[] = [];
  private readonly providerIds: string[] = [];
  private readonly technicianIds: string[] = [];
  private readonly fileIds: string[] = [];
  private readonly verificationIds: string[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  /** 이 팩토리가 만들지 않았지만 같은 실행에서 지워야 하는 id 를 등록한다(가입 API 응답 등). */
  trackUser(id: string) {
    this.userIds.push(id);
  }
  trackTechnician(id: string) {
    this.technicianIds.push(id);
  }
  trackProvider(id: string) {
    this.providerIds.push(id);
  }
  trackRequest(id: string) {
    this.requestIds.push(id);
  }
  trackFile(id: string) {
    this.fileIds.push(id);
  }
  trackVerification(id: string) {
    this.verificationIds.push(id);
  }

  async createRequestFixture(input: RequestFixtureInput = {}): Promise<RequestFixture> {
    const customerPhone = ephemeralPhone();
    const data = {
      customerName: input.customerName ?? 'E2E 고객',
      customerPhone,
      description: input.description ?? 'E2E 픽스처 접수',
      urgency: input.urgency ?? 'NORMAL',
      status: input.status ?? 'CANCELED',
      address: input.address === undefined ? '서울 강남구 테헤란로 1' : input.address,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      ...(input.assignBaseAt ? { assignBaseAt: input.assignBaseAt } : {}),
    } as const;

    const created = await this.withUniqueCode((lookupCode) =>
      this.prisma.serviceRequest.create({ data: { ...data, lookupCode } }),
    );
    this.requestIds.push(created.id);
    return {
      id: created.id,
      lookupCode: created.lookupCode,
      customerName: created.customerName,
      customerPhone: created.customerPhone,
    };
  }

  async createTechFixture(input: TechFixtureInput = {}): Promise<TechFixture> {
    const loginId = ephemeralLoginId('tech');
    const phone = ephemeralPhone();
    const password = input.password ?? DEFAULT_PASSWORD;
    const employmentType = input.employmentType ?? 'DAILY';
    const approvalStatus = input.approvalStatus ?? 'APPROVED';

    const user = await this.prisma.user.create({
      data: {
        loginId,
        passwordHash: await bcrypt.hash(password, 10),
        name: 'E2E 기술자',
        phone,
        role: 'TECHNICIAN',
      },
    });
    this.userIds.push(user.id);

    const technician = await this.prisma.technician.create({
      data: {
        userId: user.id,
        address: input.address ?? '서울 강남구 테헤란로 2',
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        isActive: input.isActive ?? true,
        regions: input.regions ?? [],
        employmentType,
        approvalStatus,
        approvedAt: approvalStatus === 'APPROVED' ? new Date() : null,
      },
    });
    this.technicianIds.push(technician.id);

    if (input.contractStatus) {
      await this.prisma.employmentContract.create({
        data: {
          technicianId: technician.id,
          employmentType,
          workLocation: '서울 강남구',
          jobDescription: '전기 설비 점검',
          workDays: employmentType === 'DAILY' ? '근로개시일 당일' : '월~금(주5일)',
          status: input.contractStatus,
          ...(input.contractStatus === 'CONFIRMED'
            ? { confirmedAt: new Date(), submittedAt: new Date(), signedAt: new Date() }
            : {}),
        },
      });
    }

    return {
      technicianId: technician.id,
      userId: user.id,
      loginId,
      password,
      name: user.name,
      phone,
    };
  }

  async createPartnerFixture(input: PartnerFixtureInput = {}): Promise<PartnerFixture> {
    const loginId = ephemeralLoginId('partner');
    const phone = ephemeralPhone();
    const password = input.password ?? DEFAULT_PASSWORD;
    const approvalStatus = input.approvalStatus ?? 'APPROVED';

    const user = await this.prisma.user.create({
      data: {
        loginId,
        passwordHash: await bcrypt.hash(password, 10),
        name: 'E2E 업체',
        phone,
        role: 'PROVIDER',
      },
    });
    this.userIds.push(user.id);

    const provider = await this.prisma.provider.create({
      data: {
        userId: user.id,
        address: input.address ?? '서울 강남구 테헤란로 3',
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        isActive: input.isActive ?? true,
        regions: input.regions ?? [],
        bizRegNo: input.bizRegNo ?? randomDigits(10),
        approvalStatus,
        approvedAt: approvalStatus === 'APPROVED' ? new Date() : null,
      },
    });
    this.providerIds.push(provider.id);

    return { providerId: provider.id, userId: user.id, loginId, password, name: user.name, phone };
  }

  /**
   * 기술자 가입(tech/signup:25-29)은 verificationId 를 필수로 요구한다.
   * 가입 API 를 태우는 스펙은 이 팩토리로 선행 발급받아야 한다.
   */
  async createIdentityVerification(input: IdentityFixtureInput = {}) {
    const phone = input.phone ?? ephemeralPhone();
    const created = await this.prisma.identityVerification.create({
      data: {
        provider: 'mock',
        providerRef: `e2e-${randomDigits(10)}`,
        name: input.name ?? 'E2E 기술자',
        phone,
        expiresAt: input.expiresAt ?? new Date(Date.now() + 10 * 60_000),
        consumedAt: input.consumedAt ?? null,
      },
    });
    this.verificationIds.push(created.id);
    return { id: created.id, name: created.name, phone: created.phone };
  }

  /** 이 팩토리가 만든 것만, FK 역순으로 되돌린다. SmsLog 는 건드리지 않는다. */
  async cleanupAll(): Promise<SweepResult> {
    // 가입 API 가 만든 자식 행(Technician/Provider)은 팩토리가 모르므로 user 로부터 회수한다.
    if (this.userIds.length) {
      const owned = await this.prisma.user.findMany({
        where: { id: { in: this.userIds } },
        select: {
          provider: { select: { id: true, bizCertFileId: true } },
          technician: { select: { id: true } },
        },
      });
      for (const row of owned) {
        if (row.provider) {
          if (!this.providerIds.includes(row.provider.id)) this.providerIds.push(row.provider.id);
          if (row.provider.bizCertFileId && !this.fileIds.includes(row.provider.bizCertFileId)) {
            this.fileIds.push(row.provider.bizCertFileId);
          }
        }
        if (row.technician && !this.technicianIds.includes(row.technician.id)) {
          this.technicianIds.push(row.technician.id);
        }
      }
    }
    if (this.requestIds.length) {
      const owned = await this.prisma.serviceRequest.findMany({
        where: { id: { in: this.requestIds } },
        select: { voiceFileId: true },
      });
      for (const row of owned) {
        if (row.voiceFileId && !this.fileIds.includes(row.voiceFileId)) {
          this.fileIds.push(row.voiceFileId);
        }
      }
    }

    const result = await deleteInFkOrder(this.prisma, {
      requestIds: this.requestIds,
      userIds: this.userIds,
      providerIds: this.providerIds,
      technicianIds: this.technicianIds,
      fileIds: this.fileIds,
      verificationIds: this.verificationIds,
    });

    this.requestIds.length = 0;
    this.userIds.length = 0;
    this.providerIds.length = 0;
    this.technicianIds.length = 0;
    this.fileIds.length = 0;
    this.verificationIds.length = 0;
    return result;
  }

  private async withUniqueCode<T>(create: (code: string) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        return await create(ephemeralLookupCode());
      } catch (e) {
        // P2002 = unique 위반. 9001 대역은 100칸이라 병렬 실행에서 드물게 겹친다.
        if ((e as { code?: string }).code !== 'P2002') throw e;
        lastError = e;
      }
    }
    throw lastError;
  }
}
