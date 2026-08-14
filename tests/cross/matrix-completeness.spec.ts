import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { GUARDED_ROUTES, PUBLIC_ROUTES, ROUTES, routeKey } from '../helpers/routes';

// ───────────────────────────────────────────────────────────────────────────
// "전수"를 약속이 아니라 **실패 가능한 단언**으로 만드는 메타테스트.
//
// src/app/api/** 의 route.ts 를 전부 걸어 export 된 HTTP 메서드를 뽑고,
// helpers/routes.ts 의 표와 양방향 대조한다.
//   · 라우트 #62 가 추가되면 → 표에 없어서 빨개진다
//   · 라우트가 삭제되면      → 표에 유령이 남아서 빨개진다
//
// 이 테스트는 서버·DB 를 건드리지 않는다 (순수 파일시스템).
// ───────────────────────────────────────────────────────────────────────────

const API_ROOT = resolve(__dirname, '..', '..', 'src', 'app', 'api');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function walkRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkRouteFiles(full));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      out.push(full);
    }
  }
  return out;
}

/** `src/app/api/admin/requests/[id]/assign/route.ts` → `/api/admin/requests/[id]/assign` */
function routePathOf(file: string): string {
  const rel = relative(API_ROOT, file).split(sep).slice(0, -1).join('/');
  return rel ? `/api/${rel}` : '/api';
}

/**
 * export 된 HTTP 핸들러 이름을 추출한다.
 * `export async function GET`, `export function POST`, `export const PUT = ...`,
 * `export { GET, POST }` 를 모두 잡는다.
 */
function exportedMethods(source: string): string[] {
  const found = new Set<string>();
  const names = HTTP_METHODS.join('|');

  for (const m of source.matchAll(
    new RegExp(String.raw`^\s*export\s+(?:async\s+)?function\s+(${names})\b`, 'gm'),
  )) {
    found.add(m[1]);
  }
  for (const m of source.matchAll(
    new RegExp(String.raw`^\s*export\s+(?:const|let|var)\s+(${names})\b`, 'gm'),
  )) {
    found.add(m[1]);
  }
  for (const block of source.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const piece of block[1].split(',')) {
      // `foo as GET` / `GET`
      const alias = piece.includes(' as ') ? piece.split(' as ')[1] : piece;
      const name = alias.trim();
      if ((HTTP_METHODS as readonly string[]).includes(name)) found.add(name);
    }
  }
  return [...found];
}

function actualHandlers(): { key: string; path: string; method: string }[] {
  return walkRouteFiles(API_ROOT)
    .sort()
    .flatMap((file) => {
      const path = routePathOf(file);
      return exportedMethods(readFileSync(file, 'utf8')).map((method) => ({
        key: routeKey(path, method),
        path,
        method,
      }));
    });
}

test.describe('매트릭스 완전성 (전수의 유일한 증명)', () => {
  test('① 실제 export 된 모든 (path, method) 가 routes.ts 표에 있다', () => {
    const tabled = new Set(ROUTES.map((r) => routeKey(r.path, r.method)));
    const missing = actualHandlers()
      .filter((h) => !tabled.has(h.key))
      .map((h) => h.key)
      .sort();

    expect(
      missing,
      `src/app/api 에 있으나 tests/helpers/routes.ts 표에 없는 핸들러입니다.\n` +
        `표에 추가하고(공개 여부 판단 포함) 해당 계약 테스트를 작성하세요.`,
    ).toEqual([]);
  });

  test('② routes.ts 표의 모든 항목이 실제로 존재한다 (유령 없음)', () => {
    const actual = new Set(actualHandlers().map((h) => h.key));
    const ghosts = ROUTES.map((r) => routeKey(r.path, r.method))
      .filter((key) => !actual.has(key))
      .sort();

    expect(
      ghosts,
      'tests/helpers/routes.ts 표에는 있으나 src/app/api 에 없는 핸들러입니다 (삭제된 라우트).',
    ).toEqual([]);
  });

  test('③ 표에 중복 항목이 없다', () => {
    const seen = new Map<string, number>();
    for (const r of ROUTES) {
      const key = routeKey(r.path, r.method);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);
    expect(dupes).toEqual([]);
  });

  test('④ 75 핸들러 = 공개 13 + 가드 62', () => {
    const actual = actualHandlers();
    expect(actual.length, '64개 route.ts 파일이 75개 핸들러를 export 해야 한다').toBe(75);
    expect(ROUTES.length).toBe(75);
    expect(PUBLIC_ROUTES.length, '설계상 공개 핸들러').toBe(13);
    expect(GUARDED_ROUTES.length, '401 을 단언해야 하는 가드 핸들러').toBe(62);
  });

  test('⑤ 2메서드 라우트 11개가 두 메서드 모두 표에 있다', () => {
    const byPath = new Map<string, Set<string>>();
    for (const h of actualHandlers()) {
      if (!byPath.has(h.path)) byPath.set(h.path, new Set());
      byPath.get(h.path)!.add(h.method);
    }
    const multi = [...byPath.entries()].filter(([, methods]) => methods.size > 1);
    expect(multi.length, '2개 이상 메서드를 export 하는 라우트 수').toBe(11);

    const tabled = new Set(ROUTES.map((r) => routeKey(r.path, r.method)));
    const missingSecond = multi.flatMap(([path, methods]) =>
      [...methods].map((m) => routeKey(path, m)).filter((key) => !tabled.has(key)),
    );
    expect(missingSecond).toEqual([]);
  });

  test('⑥ 가드 항목은 401 과 역할을, 공개 항목은 사유를 갖는다', () => {
    const badGuarded = GUARDED_ROUTES.filter(
      (r) => r.expectedUnauthedStatus !== 401 || !r.role,
    ).map((r) => routeKey(r.path, r.method));
    expect(badGuarded, '가드 핸들러는 401 + 역할이 명시돼야 한다').toEqual([]);

    const badPublic = PUBLIC_ROUTES.filter((r) => !r.note?.trim()).map((r) =>
      routeKey(r.path, r.method),
    );
    expect(badPublic, '공개 핸들러는 공개인 사유가 기록돼야 한다 (401 오탐 방지)').toEqual([]);
  });
});
