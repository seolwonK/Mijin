// A fresh local database for every run. Never points tests at the application's DB.
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
config({ quiet: true });

const source = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname)) {
  throw new Error('Assignment audit requires local PostgreSQL; remote databases are refused.');
}
const name = `mijin_assignment_audit_${Date.now()}_${process.pid}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const testUrl = new URL(source);
testUrl.pathname = `/${name}`;
testUrl.search = '';
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const env = {
  ...process.env, DATABASE_URL: testUrl.toString(), SMS_PROVIDER: 'console',
  R2_BUCKET: '', IDENTITY_PROVIDER: 'mock', ADMIN_ALERT_PHONES: '01000000000',
  AUTH_SECRET: 'assignment-audit-local-auth-secret-only',
  CRON_SECRET: 'assignment-audit-local-cron-secret-only',
  ASSIGNMENT_AUDIT: '1',
};
const output = resolve(process.env.ASSIGNMENT_AUDIT_OUTPUT ?? 'docs/assignment-audit-2026-09-10/evidence');
mkdirSync(output, { recursive: true });
const results = [];
async function run(label, args) {
  const log = createWriteStream(resolve(output, `${label}.log`));
  const started = Date.now();
  const code = await new Promise((res, rej) => {
    const child = spawn(args[0], args.slice(1), { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => log.write(data));
    child.stderr.on('data', data => log.write(data));
    child.on('error', rej);
    child.on('close', res);
  });
  await new Promise(res => log.end(res));
  results.push({ label, code, durationMs: Date.now() - started });
  console.log(`[assignment-audit] ${label}: exit ${code} (${Date.now() - started}ms)`);
  if (code !== 0) throw new Error(`${label} failed; see ${output}/${label}.log`);
}

let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`[assignment-audit] isolated database: ${name}`);
  await run('migrate', ['npx', 'prisma', 'migrate', 'deploy']);
  await run('assignment', ['npx', 'vitest', 'run', '--config', 'vitest.assignment-audit.config.ts',
    '--reporter=default', '--reporter=json', `--outputFile.json=${output}/assignment.json`]);
  if (process.argv.includes('--full')) {
    await run('seed-regression', ['npx', 'tsx', 'tests/assignment-audit/seed-e2e.ts']);
    await run('regression', ['npx', 'vitest', 'run', '--reporter=default', '--reporter=json',
      `--outputFile.json=${output}/regression.json`]);
    await run('seed-e2e', ['npx', 'tsx', 'tests/assignment-audit/seed-e2e.ts']);
    await run('api-e2e', ['node', 'scripts/e2e-lock.mjs', 'npx', 'playwright', 'test',
      'tests/admin/admin-mutation-assign.spec.ts', 'tests/admin/admin-mutation-lifecycle.spec.ts',
      'tests/partner/jobs-lifecycle.spec.ts', 'tests/tech/jobs-lifecycle.spec.ts',
      'tests/cross/auto-assign.spec.ts', 'tests/cross/ownership.spec.ts',
      'tests/cross/session-revocation.spec.ts',
      'tests/assignment-audit/live-flow.spec.ts',
      '--workers=1', '--reporter=json']);
    await run('build', ['npm', 'run', 'build']);
  }
} catch (error) {
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (created) {
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`[assignment-audit] isolated database removed: ${name}`);
  }
  await admin.$disconnect();
  writeFileSync(resolve(output, 'run.json'), JSON.stringify({
    finishedAt: new Date().toISOString(), database: name, databaseRemoved: created,
    sms: 'console', identity: 'mock', results,
  }, null, 2) + '\n');
  if (!process.exitCode) await run('report', [process.execPath, 'scripts/assignment-audit-report.mjs', output]);
}
