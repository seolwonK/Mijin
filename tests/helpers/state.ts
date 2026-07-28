import { resolve } from 'node:path';

/**
 * pretest-guard 가 원래 AppSettings.autoAssignEnabled 값을 적어두고,
 * global-teardown 이 읽어 복원한 뒤 삭제하는 상태 파일.
 * 두 프로세스가 서로 다른 cwd 로 뜰 수 있으므로 이 모듈 위치 기준으로 고정한다.
 */
export const PRETEST_STATE_PATH = resolve(__dirname, '..', '.pretest-state.json');

/**
 * scripts/e2e-lock.mjs 가 잡는 실행 락 디렉터리.
 * pretest-guard 가 이 존재 여부로 "락을 거쳐 실행됐는지"를 판정한다.
 */
export const RUN_LOCK_PATH = resolve(__dirname, '..', '..', '.omc/state/e2e-run.lock');

/** 크래시 후 수동 복구 명령 — 가드가 stderr 로 그대로 출력한다. */
export const RECOVERY_COMMAND =
  'psql mijin -c "UPDATE \\"AppSettings\\" SET \\"autoAssignEnabled\\"=true WHERE id=1;" && rm tests/.pretest-state.json';

export type PretestState = {
  autoAssignEnabled: boolean | null;
  capturedAt: string;
};
