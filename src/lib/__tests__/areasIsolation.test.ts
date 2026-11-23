import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AREA_ZONES, FOCUS_AREAS } from '@/lib/areas';

// 지역 페이지(/areas/**)는 검색으로만 들어오는 별도 섹션이다. 사이트 본편은 전국 서비스로만 보여야 하므로
// 본편 화면·공용 컴포넌트에서 /areas 로 가는 링크를 넣지 않는다(사용자 지시 2026-10-29, 2026-11-23).
const ROOT = join(__dirname, '..', '..');
const AREAS_DIR = join(ROOT, 'app', '(mobile)', 'areas');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (p === AREAS_DIR) return [];
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('지역 섹션 분리', () => {
  it('본편 화면과 공용 컴포넌트는 /areas 로 링크하지 않는다', () => {
    const files = [...walk(join(ROOT, 'app', '(mobile)')), ...walk(join(ROOT, 'components'))];
    const offenders = files.filter((f) => /['"`]\/areas|AREAS_PATH|@\/lib\/areas/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });

  it('모든 지역은 /areas 목록의 권역 묶음 중 하나에 속한다', () => {
    const sidos = AREA_ZONES.flatMap((z) => [...z.sidos]) as string[];
    expect(FOCUS_AREAS.filter((a) => !sidos.includes(a.sido)).map((a) => a.slug)).toEqual([]);
  });
});
