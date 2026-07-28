import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GATES, ambiguousHandlers, expectGate } from '../helpers/gates';
import { ROUTES, routeKey } from '../helpers/routes';

// ───────────────────────────────────────────────────────────────────────────
// 그림자 지도 무결성 (helpers/gates.ts)
//
// gates.ts 는 손으로 쓴 표다. 제품 코드가 바뀌면 조용히 낡고, **낡은 지도는
// 없는 것보다 나쁘다** — 워커들이 그걸 믿고 분기를 특정하기 때문이다.
// 그래서 matrix-completeness.spec.ts 가 routes.ts 에 하는 일을 여기서 한다:
// 표의 모든 (파일, 행, 상태코드, 메시지)를 실제 소스와 대조해 드리프트를
// 약속이 아니라 **실패 가능한 단언**으로 만든다.
//
// 서버가 필요 없는 순수 정적 검사라 스모크 게이트보다도 싸다.
// ───────────────────────────────────────────────────────────────────────────

const sourceCache = new Map<string, string[]>();
function sourceLines(file: string): string[] {
  let lines = sourceCache.get(file);
  if (!lines) {
    lines = readFileSync(file, 'utf8').split('\n');
    sourceCache.set(file, lines);
  }
  return lines;
}

// ── 소스 → 지도 방향 추출 ──────────────────────────────────────────────
// 지도에 있는 것을 소스와 대조하는 검사만 있으면 **지도에 아예 없는 분기**는
// 영원히 보이지 않는다. routes.ts 에 matrix-completeness 가 있는 것과 같은
// 이유로 반대 방향이 필요하다.

const API_ROOT = 'src/app/api';

function routeFiles(dir = API_ROOT): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out.sort();
}

/** `src/app/api/admin/requests/[id]/route.ts` → `/api/admin/requests/[id]` */
function routePathOf(file: string): string {
  return `/api${file.slice(API_ROOT.length).replace(/\/route\.ts$/, '')}`;
}

type SourceBranch = { file: string; path: string; method: string | null; line: number; status: number };

/**
 * route.ts 전체에서 **비401** 4xx 반환을 뽑는다.
 * 401 은 세션 가드이며 auth-matrix.spec.ts 가 58핸들러 전수로 이미 담당한다
 * (게다가 auto-assign 은 두 export 가 공유하는 handle() 안에 있어 메서드 귀속이 안 된다).
 */
function sourceBranches(): SourceBranch[] {
  const found: SourceBranch[] = [];
  for (const file of routeFiles()) {
    const lines = sourceLines(file);
    const path = routePathOf(file);
    const exports: Array<{ line: number; method: string }> = [];
    lines.forEach((text, i) => {
      const m = /^export async function (GET|POST|PUT|PATCH|DELETE)\b/.exec(text);
      if (m) exports.push({ line: i + 1, method: m[1] });
    });
    lines.forEach((text, i) => {
      const m = /status:\s*(4\d\d)/.exec(text);
      if (!m) return;
      const status = Number(m[1]);
      if (status === 401) return;
      const line = i + 1;
      // 그 행보다 앞에 있는 마지막 export 가 이 분기의 주인이다.
      const owner = [...exports].reverse().find((e) => e.line < line);
      found.push({ file, path, method: owner?.method ?? null, line, status });
    });
  }
  return found;
}

/**
 * 지도에 담을 수 없는 분기의 명시적 예외. 비우는 쪽이 정상이며,
 * 채울 때는 반드시 이유를 적는다 — 검사를 느슨하게 푸는 것보다 낫다.
 */
const UNMAPPABLE: ReadonlyArray<{ key: string; line: number; reason: string }> = [];

test('모든 게이트의 행 번호가 실제 상태코드와 일치한다', () => {
  const drift: string[] = [];
  for (const [key, handler] of Object.entries(GATES)) {
    const lines = sourceLines(handler.file);
    for (const gate of handler.gates) {
      const line = lines[gate.line - 1] ?? '';
      if (!line.includes(`status: ${gate.status}`)) {
        drift.push(
          `${key} :${gate.line} — ${gate.status} 를 기대했으나 실제 행은 「${line.trim()}」`,
        );
      }
    }
  }
  expect(drift, '그림자 지도가 제품 코드와 어긋났다. gates.ts 를 갱신하라').toEqual([]);
});

test('고정 메시지는 해당 반환문 근처에 실제로 존재한다', () => {
  // message 로 분기를 특정하는 것이 이 표의 핵심 용도다. 문구가 바뀌면
  // 그 단언들이 통째로 무의미해지므로 여기서 잡는다.
  const drift: string[] = [];
  for (const [key, handler] of Object.entries(GATES)) {
    const lines = sourceLines(handler.file);
    for (const gate of handler.gates) {
      if (gate.message === null) continue;
      const window = lines.slice(Math.max(0, gate.line - 6), gate.line).join('\n');
      if (!window.includes(gate.message)) {
        drift.push(`${key} :${gate.line} — 「${gate.message}」 를 반환문 근처에서 찾지 못했다`);
      }
    }
  }
  expect(drift, '에러 문구가 바뀌었다. gates.ts 의 message 를 갱신하라').toEqual([]);
});

test('게이트 순서(order)는 행 번호 순서와 모순되지 않는다', () => {
  // order 는 "앞선 게이트가 통과해야 도달한다" 는 뜻이다. 같은 파일 안에서는
  // 실행 순서가 곧 행 순서이므로 둘이 어긋나면 표가 틀린 것이다.
  // requests POST 의 :63/:80 처럼 content-type 으로 갈리는 배타 분기는
  // 행 순서와 order 가 함께 증가하므로 이 규칙에 걸리지 않는다.
  const problems: string[] = [];
  for (const [key, handler] of Object.entries(GATES)) {
    const orders = handler.gates.map((g) => g.order);
    expect(orders, `${key} 의 order 는 1부터 연속이어야 한다`).toEqual(
      orders.map((_, i) => i + 1),
    );
    for (let i = 1; i < handler.gates.length; i++) {
      if (handler.gates[i].line <= handler.gates[i - 1].line) {
        problems.push(
          `${key} — order ${handler.gates[i].order} (:${handler.gates[i].line}) 가 ` +
            `order ${handler.gates[i - 1].order} (:${handler.gates[i - 1].line}) 보다 앞선 행이다`,
        );
      }
    }
  }
  expect(problems).toEqual([]);
});

test('지도의 모든 핸들러가 routes.ts 매트릭스에 존재한다', () => {
  // gates.ts 가 이미 삭제된 라우트를 붙들고 있지 않은지.
  const known = new Set(ROUTES.map((r) => routeKey(r.path, r.method)));
  const unknown = Object.keys(GATES).filter((key) => !known.has(key));
  expect(unknown, 'routes.ts 에 없는 핸들러가 gates.ts 에 있다').toEqual([]);
});

test('상태코드가 중복되는 핸들러는 message 로 구별 가능해야 한다', () => {
  // 같은 상태코드를 여러 번 내면서 message 까지 null 이면 그 분기들은
  // 응답만으로는 영영 구별되지 않는다 — 표가 약속을 지키지 못하는 자리다.
  const indistinguishable: string[] = [];
  for (const key of ambiguousHandlers()) {
    const handler = GATES[key];
    const byStatus = new Map<number, typeof handler.gates>();
    for (const gate of handler.gates) {
      const list = byStatus.get(gate.status) ?? [];
      list.push(gate);
      byStatus.set(gate.status, list);
    }
    for (const [status, group] of byStatus) {
      if (group.length < 2) continue;
      const messages = group.map((g) => g.message);
      const nullCount = messages.filter((m) => m === null).length;
      // null 이 2개 이상이면 둘 다 zod 위임이라 구별 불가.
      if (nullCount > 1) {
        indistinguishable.push(`${key} — ${status} 가 ${nullCount}개인데 전부 zod 위임`);
      }
      const fixed = messages.filter((m): m is string => m !== null);
      if (new Set(fixed).size !== fixed.length) {
        indistinguishable.push(`${key} — ${status} 분기들의 message 가 서로 같다`);
      }
    }
  }
  // 응답만으로는 구별 불가한 것이 **제품의 사실**인 두 자리. 숨기지 않고 명시한다 —
  // 여기 등재됐다는 건 "그 분기를 때렸음을 API 로 증명할 수 없다" 는 뜻이고,
  // 그런 분기에 커버리지를 주장하면 그것이 곧 false-green 이다.
  //
  //  · POST /api/requests :63(multipart)·:80(JSON) — content-type 으로 갈리는
  //    배타 경로다. 한 요청이 둘 다 맞을 수 없으므로 실질적 모호성은 없다.
  //  · POST /api/tech/signup :97(순차 사전검사)·:190(트랜잭션 내부 경합) —
  //    문구가 완전히 같다. :190 을 때렸다는 것은 **응답으로 증명 불가**하며
  //    DB 상태(생성된 User 수)로만 간접 확인할 수 있다.
  expect(indistinguishable.sort()).toEqual([
    'POST /api/requests — 400 분기들의 message 가 서로 같다',
    'POST /api/tech/signup — 400 분기들의 message 가 서로 같다',
  ]);
});

test('소스의 모든 비401 4xx 분기가 지도에 있다 (역방향 완전성)', () => {
  // 이 검사가 없던 동안 "voice 는 분기가 2개" 같은 오독을 기계적으로 반박할
  // 수단이 없었다. 새 분기가 추가되면 이제 스위트가 빨개진다.
  const missing: string[] = [];
  for (const branch of sourceBranches()) {
    if (!branch.method) continue; // 아래 별도 테스트가 잡는다
    const key = `${branch.method} ${branch.path}`;
    if (UNMAPPABLE.some((u) => u.key === key && u.line === branch.line)) continue;
    const handler = GATES[key];
    if (!handler) {
      missing.push(`${key} — 핸들러가 gates.ts 에 아예 없다 (:${branch.line} ${branch.status})`);
      continue;
    }
    if (!handler.gates.some((g) => g.line === branch.line && g.status === branch.status)) {
      missing.push(
        `${key} :${branch.line} ${branch.status} — 분기가 누락됐다 ` +
          `(등재된 분기: ${handler.gates.map((g) => `${g.status}@:${g.line}`).join(', ')})`,
      );
    }
  }
  expect(missing, 'gates.ts 에 분기를 추가하라').toEqual([]);
});

test('모든 4xx 분기가 어떤 export 에 귀속된다 (귀속 실패는 사각지대다)', () => {
  // 귀속에 실패한 분기는 위 역방향 검사가 조용히 건너뛴다. 그 침묵을 막는다.
  const orphans = sourceBranches()
    .filter((b) => !b.method)
    .map((b) => `${b.file}:${b.line} (${b.status})`);
  expect(orphans, 'export 보다 앞에 있는 4xx 반환 — 추출기를 손봐야 한다').toEqual([]);
});

test('지도의 분기 수와 소스의 비401 4xx 수가 정확히 일치한다', () => {
  // 양방향 검사를 통과해도 개수 대조를 따로 두는 이유: 한쪽 방향의 버그로
  // 둘 다 조용해질 수 있고, 숫자는 그런 상태에서도 어긋난다.
  const inSource = sourceBranches().filter((b) => b.method).length;
  const inMap = Object.values(GATES)
    .flatMap((h) => h.gates)
    .filter((g) => g.status !== 401).length;
  expect(inMap, `소스 비401 4xx ${inSource}건 vs 지도 ${inMap}건`).toBe(inSource + UNMAPPABLE.length);
});

test('expectGate 는 없는 분기를 조용히 넘기지 않는다', () => {
  // 워커가 오타 난 행 번호로 단언하면 즉시 알려줘야 한다.
  const gate = expectGate('POST /api/tech/jobs/[id]/status', 37);
  expect(gate.status).toBe(404);
  expect(gate.trap).toContain(':29');
  expect(() => expectGate('POST /api/tech/jobs/[id]/status', 999)).toThrow(/분기가 없습니다/);
  expect(() => expectGate('GET /api/nope', 1)).toThrow(/항목이 없습니다/);
});
