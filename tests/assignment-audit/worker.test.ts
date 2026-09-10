import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/autoAssign', () => ({ runAutoAssign: vi.fn(async () => ({ assigned: 0, recalled: 0 })) }));
import { register } from '../../src/instrumentation';
import { runAutoAssign } from '@/lib/autoAssign';

const workerState = globalThis as typeof globalThis & { __autoAssignWorker?: boolean };
beforeEach(() => { delete workerState.__autoAssignWorker; vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { delete workerState.__autoAssignWorker; vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('W01 nodejs에서 30초마다 실행하며 HMR 재등록으로 워커가 중복되지 않는다', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs'); await register(); await register();
  await vi.advanceTimersByTimeAsync(29_999); expect(runAutoAssign).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(runAutoAssign).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000); expect(runAutoAssign).toHaveBeenCalledTimes(2);
});
it('W02 edge 런타임에서는 워커를 생성하지 않는다', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'edge'); await register();
  await vi.advanceTimersByTimeAsync(60_000); expect(runAutoAssign).not.toHaveBeenCalled();
  expect(workerState.__autoAssignWorker).toBeUndefined();
});
it('W03 실행 오류를 기록하고 다음 30초 실행은 계속한다', async () => {
  vi.stubEnv('NEXT_RUNTIME', 'nodejs');
  const error = new Error('AUDIT_WORKER_FAILURE');
  vi.mocked(runAutoAssign).mockRejectedValueOnce(error);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  await register(); await vi.advanceTimersByTimeAsync(60_000);
  expect(log).toHaveBeenCalledWith('[autoAssign] 실행 오류', error);
  expect(runAutoAssign).toHaveBeenCalledTimes(2);
});
