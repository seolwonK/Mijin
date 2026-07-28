#!/usr/bin/env node
// E2E 실행 직렬화 락.
//
// playwright.config.ts 가 reuseExistingServer:false 라(실 SMS 과금 방어) 포트 3000 을
// 독점하며, 모든 실행이 같은 DB 와 AppSettings.autoAssignEnabled, 그리고 9001 픽스처
// 대역을 공유한다. 동시에 두 개를 돌리면 뒤엣것이 포트 충돌로 죽고, 앞엣것이 남긴
// tests/.pretest-state.json 때문에 그 다음 실행은 "직전 크래시" 로 오인돼 거부된다.
// 즉 겹침의 증상이 크래시 복구 게이트와 똑같이 보인다 — 그래서 겹침 자체를 막는다.
//
// 사용: node scripts/e2e-lock.mjs npx playwright test tests/customer/
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK_DIR = join(ROOT, '.omc/state/e2e-run.lock');
const OWNER_FILE = join(LOCK_DIR, 'owner.json');

const WAIT_TIMEOUT_MS = 30 * 60_000; // 대기 상한 30분
const STALE_AFTER_MS = 20 * 60_000; // 이보다 오래된 락은 죽은 것으로 보고 회수
const POLL_MS = 3_000;

const owner = process.env.E2E_LOCK_OWNER ?? `pid-${process.pid}`;
const cmd = process.argv.slice(2);
if (cmd.length === 0) {
  console.error('사용법: node scripts/e2e-lock.mjs <command> [args...]');
  process.exit(2);
}

function readOwner() {
  try {
    return JSON.parse(readFileSync(OWNER_FILE, 'utf8'));
  } catch {
    return null;
  }
}

// mkdir 은 원자적이라 별도 조율 없이 상호배제가 성립한다.
function tryAcquire() {
  try {
    mkdirSync(LOCK_DIR, { recursive: false });
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
  writeFileSync(
    OWNER_FILE,
    JSON.stringify({ owner, pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2),
  );
  return true;
}

function reclaimIfStale() {
  let ageMs;
  try {
    ageMs = Date.now() - statSync(LOCK_DIR).mtimeMs;
  } catch {
    return false; // 그 사이 해제됨 — 다음 시도에서 잡힌다
  }
  if (ageMs < STALE_AFTER_MS) return false;
  const held = readOwner();
  console.error(
    `[e2e-lock] ${Math.round(ageMs / 60_000)}분 된 락을 회수합니다 (보유자: ${held?.owner ?? '불명'}, pid ${held?.pid ?? '?'}).`,
  );
  rmSync(LOCK_DIR, { recursive: true, force: true });
  return true;
}

async function acquire() {
  const startedAt = Date.now();
  let announced = false;
  while (true) {
    if (tryAcquire()) return;
    if (reclaimIfStale() && tryAcquire()) return;

    if (Date.now() - startedAt > WAIT_TIMEOUT_MS) {
      const held = readOwner();
      console.error(
        `[e2e-lock] ${WAIT_TIMEOUT_MS / 60_000}분 대기 후에도 락을 얻지 못했습니다 (보유자: ${held?.owner ?? '불명'}). 중단합니다.`,
      );
      process.exit(75); // EX_TEMPFAIL — 테스트 실패가 아니라 자원 경합임을 구분
    }
    if (!announced) {
      const held = readOwner();
      console.error(`[e2e-lock] ${held?.owner ?? '다른 실행'} 이(가) 포트 3000 을 점유 중 — 대기합니다...`);
      announced = true;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function release() {
  try {
    // 자기 락일 때만 해제한다 (stale 회수로 소유권이 넘어갔을 수 있음).
    const held = readOwner();
    if (held && held.pid !== process.pid) return;
    rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* 해제 실패는 다음 실행의 stale 회수가 처리한다 */
  }
}

await acquire();
console.error(`[e2e-lock] 획득 (${owner}) — 실행: ${cmd.join(' ')}`);

const child = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: false, cwd: ROOT });

let released = false;
const releaseOnce = () => {
  if (released) return;
  released = true;
  release();
};
// 워커가 중단되거나 죽어도 락이 남지 않도록 한다.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    child.kill(sig);
    releaseOnce();
    process.exit(130);
  });
}
process.on('exit', releaseOnce);

child.on('exit', (code, signal) => {
  releaseOnce();
  console.error(`[e2e-lock] 해제 (${owner})`);
  process.exit(signal ? 128 : (code ?? 1));
});
