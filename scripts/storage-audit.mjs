import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
config({ quiet: true });

const source = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) throw new Error('Local PostgreSQL required');
// 기존 회귀 테스트의 격리 DB 가드와 시드 도구를 그대로 사용한다.
const name = `mijin_assignment_audit_${Date.now()}_${process.pid}`;
const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
const testUrl = new URL(source); testUrl.pathname = `/${name}`; testUrl.search = '';
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const env = {
  ...process.env, DATABASE_URL: testUrl.toString(), SMS_PROVIDER: 'console', R2_BUCKET: '',
  IDENTITY_PROVIDER: 'mock', STT_PROVIDER: '', ADMIN_ALERT_PHONES: '01000000000',
  AUTH_SECRET: 'storage-audit-local-only', CRON_SECRET: 'storage-audit-local-only', ASSIGNMENT_AUDIT: '1',
};
const output = resolve('docs/storage-audit-2026-09-10');
mkdirSync(output, { recursive: true });
const results = [];
async function run(label, args) {
  const log = createWriteStream(resolve(output, `${label}.log`));
  const started = Date.now();
  const code = await new Promise((res, rej) => {
    const child = spawn(args[0], args.slice(1), { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => log.write(data));
    child.stderr.on('data', data => log.write(data));
    child.on('error', rej); child.on('close', res);
  });
  await new Promise(res => log.end(res));
  results.push({ label, code, durationMs: Date.now() - started });
  console.log(`[storage-audit] ${label}: ${code}`);
  if (code !== 0) throw new Error(`${label} failed: ${output}/${label}.log`);
}
let created = false;
let removed = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`); created = true;
  await run('migrate', ['npx', 'prisma', 'migrate', 'deploy']);
  await run('seed', ['npx', 'tsx', 'tests/assignment-audit/seed-e2e.ts']);
  await run('unit', ['npx', 'vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${output}/unit.json`]);
  await run('api', ['node', 'scripts/e2e-lock.mjs', 'npx', 'playwright', 'test',
    'tests/customer/intake-api.spec.ts', 'tests/customer/intake-photos.spec.ts',
    'tests/partner/signup-api.spec.ts', 'tests/admin/admin-readonly-requests.spec.ts',
    '--workers=1', '--reporter=json']);
  await run('types', ['npx', 'tsc', '--noEmit']);
  await run('build', ['npm', 'run', 'build']);
} catch (error) {
  process.exitCode = 1; console.error(error.message);
} finally {
  if (created) { await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`); removed = true; }
  await admin.$disconnect();
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({ finishedAt: new Date().toISOString(), databaseRemoved: removed, sms: 'console', r2: 'disabled for regression', results }, null, 2) + '\n');
}
