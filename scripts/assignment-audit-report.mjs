import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const directory = resolve(process.argv[2] ?? 'docs/assignment-audit-2026-09-10/evidence');
const run = JSON.parse(readFileSync(resolve(directory, 'run.json'), 'utf8'));
const phases = new Map(run.results.map(r => [r.label, r]));
const rows = [];
for (const label of ['assignment', 'regression']) {
  if (!phases.has(label)) continue;
  const report = JSON.parse(readFileSync(resolve(directory, `${label}.json`), 'utf8'));
  for (const suite of report.testResults) for (const test of suite.assertionResults) {
    rows.push({ phase: label, file: relative(process.cwd(), suite.name), title: test.fullName || test.title,
      status: test.status, durationMs: test.duration ?? 0 });
  }
}
if (phases.has('api-e2e')) {
  const text = readFileSync(resolve(directory, 'api-e2e.log'), 'utf8');
  const start = text.indexOf('{\n  "config":');
  if (start === -1) throw new Error('Playwright JSON report missing');
  const report = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
  writeFileSync(resolve(directory, 'api-e2e.json'), JSON.stringify(report, null, 2) + '\n');
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) rows.push({
      phase: 'api-e2e', file: `tests/${spec.file}`, title: spec.title,
      status: test.status === 'expected' ? 'passed' : test.status,
      durationMs: test.results.reduce((n, r) => n + r.duration, 0),
    });
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);
}
const summary = {
  finishedAt: run.finishedAt, databaseRemoved: run.databaseRemoved,
  total: rows.length, passed: rows.filter(r => r.status === 'passed').length,
  failedOrSkipped: rows.filter(r => r.status !== 'passed').length,
  phases: Object.fromEntries([...phases].map(([name, value]) => [name, {
    ...value, tests: rows.filter(r => r.phase === name).length,
    passed: rows.filter(r => r.phase === name && r.status === 'passed').length,
  }])),
  rankingCandidates: 1296, rankingPairComparisons: 1296 ** 2 * 3,
};
writeFileSync(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const escape = text => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# 배정 검증 전체 실행 항목', '',
  `실행 완료: ${run.finishedAt} · 통과 ${summary.passed}/${summary.total} · 실패/건너뜀 ${summary.failedOrSkipped}`, '',
  '각 행은 실제 러너 결과에서 생성했습니다. 조합 내부의 반복 단언은 별도 테스트 수에 중복 합산하지 않습니다.', '',
  '| 번호 | 검증 층 | 실행한 경우 | 결과 | 소스 |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((row, i) => `| ${i + 1} | ${row.phase} | ${escape(row.title)} | ${row.status === 'passed' ? '✅ 통과' : row.status} | [테스트](${relative(resolve(directory, '..'), resolve(row.file))}) |`), '',
];
writeFileSync(resolve(directory, '..', '전체-실행-체크리스트.md'), lines.join('\n'));
for (const filename of ['before/assignment.json', 'extended-before/assignment.json']) {
  if (!existsSync(resolve(directory, filename))) continue;
  const report = JSON.parse(readFileSync(resolve(directory, filename), 'utf8'));
  const failures = report.testResults.flatMap(s => s.assertionResults.filter(t => t.status === 'failed').map(t => t.title));
  writeFileSync(resolve(directory, filename.replace('assignment.json', 'reproduced-failures.json')), JSON.stringify(failures, null, 2) + '\n');
}
console.log(JSON.stringify(summary, null, 2));
