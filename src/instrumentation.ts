export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const g = globalThis as { __autoAssignWorker?: boolean };
  if (g.__autoAssignWorker) return; // dev HMR로 register가 재실행돼도 워커는 1개만
  g.__autoAssignWorker = true;

  const { runAutoAssign } = await import('./lib/autoAssign');
  setInterval(() => {
    runAutoAssign().catch((e) => console.error('[autoAssign] 실행 오류', e));
  }, 30_000);
  console.log('[autoAssign] 워커 시작 (30초 주기)');
}
