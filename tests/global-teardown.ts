import { existsSync, readFileSync, rmSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PRETEST_STATE_PATH, RECOVERY_COMMAND, type PretestState } from './helpers/state';
import { DURABLE_CODES } from './helpers/fixtures';

// pretest-guard 가 끈 자동배정 워커를 되살린다 — **단, 안전할 때만.**
//
// 복원 게이트는 `9001xx` 카운트가 아니라 `status='RECEIVED'` 카운트다.
// 워커가 무는 대상은 네임스페이스가 아니라 상태이기 때문이다(autoAssign.ts:19-22).
// 9001 대역만 보면 Step 0 이 실증한 네임스페이스 밖 누출(요청 239431 유형)을
// 놓친 채 워커를 되살리게 된다.
//
// ⚠️ 단, 영속 픽스처(9000xx)는 카운트에서 제외한다.
//    global-setup.ts:20-23 이 매 실행 900011 을 **의도적으로** RECEIVED 로
//    되돌리므로, 제외하지 않으면 이 게이트는 정상 경로에서 영원히 통과하지 못한다
//    (실측: 스위트 종료 시 RECEIVED = 900011 1건).
//    제외해도 게이트의 목적은 온전하다 — 위험은 "워커가 물면 삭제 불가가 되는 행"이고,
//    영속 픽스처는 애초에 삭제 대상이 아니다. 반면 239431 유형(네임스페이스 밖
//    일회성 잔재)과 9001 대역 잔재는 그대로 걸린다.
//
// teardown 은 webServer 플러그인 teardown 보다 먼저 돈다(플러그인 setup 이 먼저
// 등록되고 정리는 역순). 즉 이 시점에 dev 서버는 아직 살아 있고, 잘못 복원하면
// 30초 안에 워커가 잔재를 물어 삭제 불가 상태를 만든다.
export default async function globalTeardown() {
  if (!existsSync(PRETEST_STATE_PATH)) {
    process.stderr.write(
      '[global-teardown] .pretest-state.json 이 없습니다 — 복원할 값이 없어 건너뜁니다.\n',
    );
    return;
  }

  let state: PretestState;
  try {
    state = JSON.parse(readFileSync(PRETEST_STATE_PATH, 'utf8')) as PretestState;
  } catch (e) {
    process.stderr.write(
      `[global-teardown] 상태 파일을 읽을 수 없습니다: ${e instanceof Error ? e.message : String(e)}\n` +
        `  수동 복구: ${RECOVERY_COMMAND}\n`,
    );
    return;
  }

  const prisma = new PrismaClient();
  try {
    const stranded = await prisma.serviceRequest.findMany({
      where: { status: 'RECEIVED', lookupCode: { notIn: [...DURABLE_CODES] } },
      select: { lookupCode: true },
      take: 20,
    });
    if (stranded.length > 0) {
      process.stderr.write(
        [
          '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '[global-teardown] autoAssignEnabled 복원을 보류합니다.',
          '',
          `영속 픽스처가 아닌 status='RECEIVED' 접수가 ${stranded.length}건 남아 있습니다:`,
          `  ${stranded.map((r) => r.lookupCode).join(', ')}`,
          '지금 워커를 켜면 dev 서버가 아직 살아 있는 동안 잔재를 배정해',
          'Assignment 를 만들고, 그 시점부터 픽스처 삭제가',
          'assignment_one_assignee CHECK(SQLSTATE 23514) 로 영구 차단됩니다.',
          '',
          '잔재를 정리한 뒤 수동 복원하세요:',
          `  ${RECOVERY_COMMAND}`,
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '',
        ].join('\n'),
      );
      return;
    }

    if (state.autoAssignEnabled !== null) {
      await prisma.appSettings.update({
        where: { id: 1 },
        data: { autoAssignEnabled: state.autoAssignEnabled },
      });
      console.log('[global-teardown] autoAssignEnabled=%s 복원', state.autoAssignEnabled);
    }
    rmSync(PRETEST_STATE_PATH, { force: true });
  } finally {
    await prisma.$disconnect();
  }
}
