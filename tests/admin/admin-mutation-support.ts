import { expect, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import type { Prisma, PrismaClient, SmsLog } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';

// ───────────────────────────────────────────────────────────────────────────
// Step 7a 전용 지원 모듈 (스펙이 아니라 헬퍼 — testMatch 가 잡지 않는다).
//
// 여기 있는 것 중 핵심은 midflightTransition(): 읽기와 쓰기 **사이**에서 행을
// 갈아끼워 CAS 패배 분기를 결정적으로 재현한다. 계획 B2 가 지적한 대로
// admin-queue.spec.ts 는 409 를 page.route() 로 지어내므로 실제 CAS 는
// 한 번도 실행된 적이 없다. 여기서는 목킹을 쓰지 않는다.
// ───────────────────────────────────────────────────────────────────────────

export type Pw = PlaywrightWorkerArgs['playwright'];

/** ADMIN 세션 + 스펙별 레이트리밋 버킷을 고정한 계약 층 컨텍스트. */
export async function adminCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(await apiContextOptions('ADMIN', {}, ipHeaders(seed)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fire-and-forget 으로 던져지는 SMS 기록을 기다린다.
 * assignment.ts:46(`void notifyAssignee`)·unassign/route.ts:49(`void sendSms`)
 * 는 둘 다 HTTP 응답 **이후** 에 쓰므로 즉시 단언하면 경쟁한다 (계획 실패 3).
 */
export async function pollSmsLog(
  prisma: PrismaClient,
  where: Prisma.SmsLogWhereInput,
  timeout = 20_000,
): Promise<SmsLog> {
  await expect
    .poll(async () => prisma.smsLog.count({ where }), { timeout })
    .toBeGreaterThan(0);
  const row = await prisma.smsLog.findFirst({ where, orderBy: { createdAt: 'desc' } });
  if (!row) throw new Error('SmsLog poll 통과 후 행이 사라졌습니다');
  // 실 게이트웨이로 새어나가면 과금이다 (계획 R1). 여기서 매번 확인한다.
  expect(row.provider, '실 SMS 게이트웨이로 발송되었습니다 — 즉시 중단').toBe('console');
  return row;
}

/**
 * 라우트를 미리 한 번 태워 dev 서버의 지연 컴파일을 끝낸다.
 * midflightTransition 은 "핸들러가 사전 조회를 마치고 UPDATE 에서 락에 걸린다"는
 * 전제 위에 서 있는데, 첫 요청은 컴파일에 수 초가 걸려 그 전제를 깬다.
 */
export async function warmRoute(ctx: APIRequestContext, url: string, data?: unknown) {
  await ctx.post(url, data === undefined ? {} : { data });
}

/**
 * **우리 트랜잭션이 막고 있는** writer 가 생길 때까지 기다린다.
 *
 * `pg_locks WHERE NOT granted` 는 클러스터 전역이라 병렬 워커의 무관한 대기까지
 * 세어 "CAS 창에서 기다렸다"는 증거가 못 된다. pg_blocking_pids() 로 우리 백엔드가
 * 차단자인 세션만 세면 그 단언이 진짜 증거가 된다.
 */
async function waitForWriterBlockedByUs(
  prisma: PrismaClient,
  blockerPid: number,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n
      FROM pg_stat_activity a
      WHERE a.wait_event_type = 'Lock'
        AND ${blockerPid}::int = ANY (pg_blocking_pids(a.pid))
    `;
    if (Number(rows[0]?.n ?? 0) > 0) return true;
    await sleep(100);
  }
  return false;
}

export type LockTarget =
  | { kind: 'request'; id: string }
  | { kind: 'assignment'; id: string };

async function lockRow(tx: Prisma.TransactionClient, target: LockTarget): Promise<void> {
  if (target.kind === 'request') {
    await tx.$queryRaw`SELECT id FROM "ServiceRequest" WHERE id = ${target.id} FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM "Assignment" WHERE id = ${target.id} FOR UPDATE`;
  }
}

/**
 * 핸들러의 **읽기와 쓰기 사이**에 대상 행을 바꿔 CAS 패배를 결정적으로 만든다.
 *
 *   1. 테스트가 트랜잭션 T 를 열고 대상 행에 `FOR UPDATE` 락을 건다
 *   2. 요청을 던진다 — 핸들러의 사전 SELECT 는 MVCC 라 막히지 않고 **옛 상태**를 읽는다
 *   3. 핸들러가 `updateMany` 에 도달하면 T 의 락에 걸려 대기한다
 *   4. T 안에서 상태를 바꾸고 커밋한다
 *   5. 락이 풀리며 대기하던 UPDATE 가 **갱신된 행으로 WHERE 를 재평가**한다
 *      (READ COMMITTED 의 update 재검사) → 매칭 0건 → count 0 → 409
 *
 * 이 경로는 어떤 sleep 배치에도 의존하지 않고, 3단계를 pg_locks 로 실측해 기다린다.
 */
export async function midflightTransition<T>(
  prisma: PrismaClient,
  target: LockTarget,
  fire: () => Promise<T>,
  mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<{ result: T; blockedWriterObserved: boolean }> {
  let fired: Promise<T> | null = null;
  let blockedWriterObserved = false;

  await prisma.$transaction(
    async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await lockRow(tx, target);
      fired = fire();
      blockedWriterObserved = await waitForWriterBlockedByUs(prisma, pid, 8_000);
      // writer 를 못 봤어도 진행한다 — 그 경우 핸들러가 아직 사전 조회 중이었다는
      // 뜻이고, 단언 실패 메시지에서 이 플래그로 구분된다.
      await sleep(200);
      await mutate(tx);
    },
    { maxWait: 15_000, timeout: 40_000 },
  );

  if (!fired) throw new Error('요청이 던져지지 않았습니다');
  return { result: await (fired as Promise<T>), blockedWriterObserved };
}
