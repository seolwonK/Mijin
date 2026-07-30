import { existsSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PRETEST_STATE_PATH, RECOVERY_COMMAND, RUN_LOCK_PATH } from './helpers/state';
import { sweepEphemeral } from './helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// dev 서버 **부팅 전에** 실행되는 가드.
//
// 왜 globalSetup 이 아니라 webServer.command 앞인가:
//   playwright/lib/runner/index.js:5852-5858 — createGlobalSetupTasks 는
//   createPluginSetupTasks(=webServer) 를 globalSetups **보다 먼저** 넣는다.
//   즉 globalSetup 이 도는 시점엔 이미 dev 서버가 떠 있고
//   src/instrumentation.ts:8-11 이 30초 주기 runAutoAssign 인터벌을 무장한 뒤다.
//   src/lib/autoAssign.ts:9-10 이 매 tick 마다 AppSettings 를 재조회하므로,
//   부팅 전에 끄면 타이밍 운이 아니라 확정적인 차단이 된다.
//
// 이 프로세스는 tsx 로 단독 실행되므로 .env 를 직접 로드해야 한다
// (npm run dev 와 달리 Next 의 env 로더를 거치지 않는다).
// ───────────────────────────────────────────────────────────────────────────

loadEnv({ quiet: true });

// 실행 직렬화 강제.
//
// reuseExistingServer:false 라 포트 3000 은 한 번에 하나뿐이고, 모든 실행이 같은 DB·
// AppSettings·9001 픽스처 대역을 공유한다. 락 없이 두 실행이 겹치면 뒤엣것이 포트
// 충돌로 죽고, 앞엣것이 남긴 상태 파일 때문에 그 다음 실행은 위쪽 "직전 크래시"
// 분기에 거부된다 — 즉 겹침의 증상이 진짜 크래시와 구별되지 않는다.
// 규약으로 부탁하면 우회되므로(실측: 락 없이 도는 실행 관측됨) 여기서 강제한다.
function requireRunLock() {
  if (process.env.E2E_ALLOW_UNLOCKED === '1') return; // 의도적 단독 실행
  if (existsSync(RUN_LOCK_PATH)) return; // scripts/e2e-lock.mjs 가 보유 중

  process.stderr.write(
    [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '[pretest-guard] 실행 락 없이 시작하려 해서 거부합니다.',
      '',
      '팀 전체에서 동시에 하나의 Playwright 실행만 가능합니다',
      '(reuseExistingServer:false — 포트 3000 독점 + 공유 DB).',
      '',
      '이렇게 실행하세요:',
      '  E2E_LOCK_OWNER=<이름> node scripts/e2e-lock.mjs npx playwright test <경로>',
      '  또는  npm run test:e2e -- <경로>',
      '',
      '단독 실행이 확실하다면(다른 워커 없음): E2E_ALLOW_UNLOCKED=1',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

async function main() {
  requireRunLock();

  const prisma = new PrismaClient();
  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });

    if (settings?.autoAssignEnabled === false) {
      // 직전 실행이 teardown 전에 죽었다는 뜻이다. 그대로 진행하면 원복값이
      // false 로 고착돼 개발 환경의 자동배정이 영구 비활성화된다.
      // stderr 로 쓴다 — Playwright 는 webServer stdout 을 stdout:'pipe' 나
      // debugWebServer 없이는 숨기고(runner/index.js:867), stderr 는 기본 표시한다(:871).
      process.stderr.write(
        [
          '',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '[pretest-guard] 시작을 거부합니다.',
          '',
          'AppSettings.autoAssignEnabled 가 이미 false 입니다.',
          '직전 E2E 실행이 global-teardown 전에 중단되어 원래 값을 복원하지',
          '못했을 가능성이 큽니다. 이 상태로 실행하면 원복값이 false 로 고착되어',
          '개발 환경의 자동배정이 영구히 꺼진 채로 남습니다.',
          '',
          '복구:',
          `  ${RECOVERY_COMMAND}`,
          '',
          `(이 환경에서 자동배정이 의도적으로 꺼져 있다면, 위 명령으로 true 로`,
          ' 되돌린 뒤 다시 실행하세요. 가드가 실행 중 다시 꺼고 teardown 이 복원합니다.)',
          '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
          '',
        ].join('\n'),
      );
      process.exitCode = 1;
      return;
    }

    // 값을 먼저 영속화한 뒤에 끈다. 순서가 반대면 이 사이에서 죽었을 때
    // 원래 값을 되찾을 근거가 사라진다.
    const previous = settings?.autoAssignEnabled ?? null;
    writeFileSync(
      PRETEST_STATE_PATH,
      `${JSON.stringify({ autoAssignEnabled: previous, capturedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );

    if (settings) {
      await prisma.appSettings.update({ where: { id: 1 }, data: { autoAssignEnabled: false } });
      console.log('[pretest-guard] autoAssignEnabled=false (원래 값: %s)', previous);
    } else {
      console.log('[pretest-guard] AppSettings(id=1) 없음 — 워커는 이미 무동작 상태');
    }

    // 잔재 스윕은 반드시 여기서 — 서버가 뜬 뒤면 워커가 RECEIVED 잔재를 물어
    // Assignment 를 만들고, 그 순간부터 전기기사/업체 삭제가
    // assignment_one_assignee CHECK(23514) 로 영구 차단된다.
    const swept = await sweepEphemeral(prisma);
    const sweptTotal = Object.values(swept).reduce((a, b) => a + b, 0);
    if (sweptTotal > 0) {
      console.log('[pretest-guard] 9001 대역 잔재 회수:', JSON.stringify(swept));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  process.stderr.write(`[pretest-guard] 실패: ${e instanceof Error ? e.stack : String(e)}\n`);
  if (!existsSync(PRETEST_STATE_PATH)) {
    process.stderr.write('[pretest-guard] 설정 변경 전에 실패 — 원복 필요 없음\n');
  }
  process.exit(1);
});
