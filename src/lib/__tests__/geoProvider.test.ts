import { createHash } from 'node:crypto';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REGIONS } from '@/lib/regions';

const files = new Map<string, string>();
vi.mock('node:fs', () => ({ readFileSync: vi.fn((filename: string) => {
  const source = files.get(path.basename(String(filename)));
  if (source === undefined) throw new Error(`missing fixture: ${filename}`);
  return source;
}) }));

function polygon(x: number, y: number) {
  return [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]];
}

function feature(sido: string, name: string, code: string, coordinates: unknown, type: 'Polygon' | 'MultiPolygon' = 'Polygon') {
  return { type: 'Feature', properties: { regionKey: `${sido} ${name}`, sido, name, code }, geometry: { type, coordinates } };
}

function installFixtures() {
  const entries: Record<string, { file: string; sha256: string; featureCount: number }> = {};
  for (const [index, sido] of Object.keys(REGIONS).entries()) {
    const features = REGIONS[sido].map((sigungu, sigunguIndex) => feature(sido, sigungu, `${index}-${sigunguIndex}`, polygon(20 + index * 2, 20)));
    if (sido === '서울특별시') {
      features[0] = feature(sido, REGIONS[sido][0], '11-0', polygon(0, 0));
      features[1] = feature(sido, REGIONS[sido][1], '11-1', polygon(2, 0));
    }
    const raw = JSON.stringify({ type: 'FeatureCollection', features });
    const file = `kr-sigungu.${index}.geo.json`;
    files.set(file, raw);
    entries[sido] = { file, sha256: createHash('sha256').update(raw).digest('hex'), featureCount: features.length };
  }
  const sidoFeatures = Object.keys(REGIONS).map((sido, index) => {
    if (sido === '서울특별시') {
      return feature(sido, sido, '11', [[[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]], [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]], polygon(4, 0)], 'MultiPolygon');
    }
    return feature(sido, sido, String(index), polygon(20 + index * 2, 20));
  });
  const sidoRaw = JSON.stringify({ type: 'FeatureCollection', features: sidoFeatures });
  files.set('kr-sido.fixture.geo.json', sidoRaw);
  files.set('manifest.json', JSON.stringify({
    schemaVersion: 1,
    version: 'fixture',
    referenceDate: '2026-07-18',
    license: '공공누리 제1유형 (출처표시)',
    sourceUrl: 'https://example.test/boundary',
    sido: { file: 'kr-sido.fixture.geo.json', sha256: createHash('sha256').update(sidoRaw).digest('hex'), featureCount: 17 },
    sigungu: entries,
  }));
}

describe('loadGeoProvider', () => {
  it('uses manifest-selected files for multipolygons, holes, interior points, and boundary-adjacent points', async () => {
    installFixtures();
    const { loadGeoProvider } = await import('../geoProvider');
    const provider = loadGeoProvider();

    expect(provider?.sidoAt?.(0.5, 0.5)).toBe('서울특별시');
    expect(provider?.sidoAt?.(0.5, 4.5)).toBe('서울특별시');
    expect(provider?.sidoAt?.(1.5, 1.5)).toBeNull();
    expect(provider?.sigunguAt?.(0.5, 0.5)).toMatchObject({ sido: '서울특별시', sigungu: REGIONS['서울특별시'][0] });
    // The point lies on a ring; attribution may be either adjacent boundary, but must not throw.
    expect(() => provider?.sigunguAt?.(0, 1)).not.toThrow();
  });

  it('retries a failed sigungu partition after the TTL instead of caching null forever', async () => {
    vi.resetModules(); // 이전 테스트의 모듈 수준 provider 캐시 격리
    installFixtures();
    const manifest = JSON.parse(files.get('manifest.json')!);
    const seoulFile = manifest.sigungu['서울특별시'].file as string;
    const seoulRaw = files.get(seoulFile)!;
    files.delete(seoulFile); // 일시 장애: 파티션 파일 소실

    vi.useFakeTimers();
    try {
      const { loadGeoProvider } = await import('../geoProvider');
      const provider = loadGeoProvider();

      expect(provider?.sigunguAt?.(0.5, 0.5)).toBeNull(); // 실패 → null (기록)
      files.set(seoulFile, seoulRaw); // 장애 복구
      expect(provider?.sigunguAt?.(0.5, 0.5)).toBeNull(); // TTL 내 — 아직 재시도 안 함
      vi.advanceTimersByTime(5 * 60_000 + 1_000);
      expect(provider?.sigunguAt?.(0.5, 0.5)).toMatchObject({ sido: '서울특별시', sigungu: REGIONS['서울특별시'][0] }); // TTL 경과 → 재시도 성공
    } finally {
      vi.useRealTimers();
    }
  });
});
