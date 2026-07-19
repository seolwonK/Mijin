#!/usr/bin/env tsx
/** Builds the versioned GeoJSON boundaries used by the choropleth from VWorld WFS data. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { geoArea } from 'd3-geo';

import { REGIONS } from '../src/lib/regions';

type Geometry = { type: string; coordinates: unknown };
type GeoJsonFeature = { type: 'Feature'; properties?: Record<string, unknown> | null; geometry: Geometry | null };
type GeoJsonFeatureCollection = { type: 'FeatureCollection'; features: GeoJsonFeature[]; crs?: { properties?: { name?: string } } | null };
type SidoSplit = { split: Record<string, string[] | 'rest'> };
type Crosswalk = { schemaVersion: string; sido: Record<string, string | SidoSplit>; sigungu: null; note: string };
type SourceMetadata = { url: string; referenceDate: string; sha256: string; license: string };
type PublishedFile = { file: string; sha256: string; featureCount: number };
type Manifest = {
  schemaVersion: 1;
  version: string;
  referenceDate: string;
  license: string;
  sourceUrl: string;
  sido: PublishedFile;
  sigungu: Record<string, PublishedFile>;
};

const GEOJSON_COORDINATE_DEPTH: Record<string, number> = {
  Point: 1, MultiPoint: 2, LineString: 2, MultiLineString: 3, Polygon: 3, MultiPolygon: 4,
};
const VWORLD_WFS_URLS = {
  sido: 'https://api.vworld.kr/req/wfs?service=WFS&request=GetFeature&version=2.0.0&typename=lt_c_adsido_info&srsname=EPSG%3A4326&outputFormat=application%2Fjson',
  sigungu: 'https://api.vworld.kr/req/wfs?service=WFS&request=GetFeature&version=2.0.0&typename=lt_c_adsigg_info&srsname=EPSG%3A4326&outputFormat=application%2Fjson',
} as const;
type WfsLayer = keyof typeof VWORLD_WFS_URLS;
const LICENSE = '공공누리 제1유형 (출처표시)';
const SNAPSHOT_DIR = 'geo-src';
const GEO_DIR = 'public/geo';
const MANIFEST_PATH = path.join(GEO_DIR, 'manifest.json');
const CROSSWALK_PATH = 'src/data/region-crosswalk.json';

function usage(): string {
  return 'Usage: tsx scripts/build-topojson.ts [--from-snapshot <sido GeoJSON> --from-snapshot-sigungu <sigungu GeoJSON>] [--verify]';
}

function parseArgs(args: string[]): { fromSnapshot?: string; fromSnapshotSigungu?: string; verify: boolean } {
  let fromSnapshot: string | undefined;
  let fromSnapshotSigungu: string | undefined;
  let verify = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--verify') verify = true;
    else if (arg === '--from-snapshot') {
      fromSnapshot = args[++index];
      if (!fromSnapshot) throw new Error('--from-snapshot requires a GeoJSON path.');
    } else if (arg === '--from-snapshot-sigungu') {
      fromSnapshotSigungu = args[++index];
      if (!fromSnapshotSigungu) throw new Error('--from-snapshot-sigungu requires a GeoJSON path.');
    } else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (fromSnapshot !== undefined && fromSnapshotSigungu === undefined) throw new Error('--from-snapshot requires --from-snapshot-sigungu.');
  return { fromSnapshot, fromSnapshotSigungu, verify };
}

function wfsFetchUrl(layer: WfsLayer, apiKey: string): string {
  const url = new URL(VWORLD_WFS_URLS[layer]);
  url.searchParams.set('key', apiKey);
  return url.toString();
}
function wfsRecordUrl(layer: WfsLayer): string {
  const url = new URL(VWORLD_WFS_URLS[layer]);
  url.searchParams.delete('key');
  return url.toString();
}
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

function assertFeatureCollection(value: unknown, label: string): asserts value is GeoJsonFeatureCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error(`${label} must be a GeoJSON FeatureCollection.`);
}
function assertEpsg4326(collection: GeoJsonFeatureCollection): void {
  const name = collection.crs?.properties?.name;
  if (name && !/(EPSG:{1,2}4326|CRS84)$/i.test(name)) throw new Error(`Expected EPSG:4326 GeoJSON, received ${name}.`);
}
function snapshotDate(snapshotPath?: string): string {
  const match = snapshotPath?.match(/(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? new Date().toISOString().slice(0, 10);
}
async function saveSnapshot(layer: WfsLayer, body: string, recordUrl: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const base = path.join(SNAPSHOT_DIR, `${layer}-${date}`);
  const metadata = { layer, url: recordUrl, referenceDate: date, retrievedAt: new Date().toISOString(), sha256: digest(body), license: LICENSE };
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(`${base}.json`, body);
  await writeFile(`${base}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
}
async function fetchSnapshot(layer: WfsLayer, apiKey: string): Promise<{ collection: GeoJsonFeatureCollection; body: string }> {
  const response = await fetch(wfsFetchUrl(layer, apiKey), { headers: { Accept: 'application/json' } });
  const body = await response.text();
  if (!response.ok) throw new Error(`VWorld ${layer} request failed (${response.status}): ${body}`);
  const parsed: unknown = JSON.parse(body);
  assertFeatureCollection(parsed, `VWorld ${layer}`);
  await saveSnapshot(layer, body, wfsRecordUrl(layer));
  return { collection: parsed, body };
}

function assertValidCoordinates(value: unknown, label: string): number {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty coordinate array.`);
  if (value.every((item) => typeof item === 'number')) {
    if (value.length < 2 || value.some((item) => !Number.isFinite(item)) || value[0] < -180 || value[0] > 180 || value[1] < -90 || value[1] > 90) throw new Error(`${label} must contain a finite EPSG:4326 longitude/latitude position.`);
    return 1;
  }
  if (value.some((item) => !Array.isArray(item))) throw new Error(`${label} must contain only coordinate arrays.`);
  const depths = value.map((item, index) => assertValidCoordinates(item, `${label}[${index}]`));
  if (depths.some((depth) => depth !== depths[0])) throw new Error(`${label} must use a consistent coordinate nesting depth.`);
  return depths[0] + 1;
}
function samePosition(left: unknown, right: unknown): boolean {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}
function assertPolygonRings(coordinates: unknown, label: string): void {
  const polygons = Array.isArray(coordinates) && Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number'
    ? [coordinates] : coordinates;
  if (!Array.isArray(polygons)) throw new Error(`${label} must contain polygon rings.`);
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) throw new Error(`${label} must contain at least one linear ring.`);
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || !samePosition(ring[0], ring[ring.length - 1])) throw new Error(`${label} contains an invalid linear ring.`);
    }
  }
}
function assertGeometry(geometry: Geometry | null, label: string): asserts geometry is Geometry {
  const expectedDepth = geometry && GEOJSON_COORDINATE_DEPTH[geometry.type];
  if (!geometry || !expectedDepth) throw new Error(`${label} has an unsupported or missing geometry.`);
  if (assertValidCoordinates(geometry.coordinates, `${label} coordinates`) !== expectedDepth) throw new Error(`${label} has invalid ${geometry.type} coordinates.`);
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') assertPolygonRings(geometry.coordinates, label);
}
function roundCoordinates(value: unknown, depth: number, decimals: number, removeConsecutiveDuplicates: boolean): unknown {
  if (depth === 1) return (value as number[]).map((coordinate) => Number(coordinate.toFixed(decimals)));
  const rounded = (value as unknown[]).map((item) => roundCoordinates(item, depth - 1, decimals, removeConsecutiveDuplicates));
  if (depth !== 2 || !removeConsecutiveDuplicates) return rounded;
  const compact = rounded.filter((position, index) => index === 0 || !samePosition(position, rounded[index - 1]));
  if (samePosition(rounded[0], rounded[rounded.length - 1]) && !samePosition(compact[0], compact[compact.length - 1])) compact.push(compact[0]);
  return compact;
}
function roundedGeometry(geometry: Geometry, decimals: number, removeConsecutiveDuplicates = false): Geometry {
  const coordinates = roundCoordinates(geometry.coordinates, GEOJSON_COORDINATE_DEPTH[geometry.type], decimals, removeConsecutiveDuplicates);
  if (geometry.type === 'Polygon') {
    const result: Geometry = { type: 'Polygon', coordinates: (coordinates as unknown[]).filter((ring) => Array.isArray(ring) && ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1])) };
    assertGeometry(result, 'Rounded polygon');
    return result;
  }
  if (geometry.type === 'MultiPolygon') {
    const result: Geometry = { type: 'MultiPolygon', coordinates: (coordinates as unknown[]).map((polygon) => (polygon as unknown[]).filter((ring) => Array.isArray(ring) && ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1]))).filter((polygon) => polygon.length > 0) };
    assertGeometry(result, 'Rounded multipolygon');
    return result;
  }
  return { ...geometry, coordinates };
}
function assertWinding(geometry: Geometry, label: string): void {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
  for (const rings of polygons) {
    const area = geoArea({ type: 'Polygon', coordinates: rings } as never);
    if (area > Math.PI) throw new Error(`${label} polygon has invalid spherical winding (area ${area.toFixed(3)} sr).`);
  }
}
function rewindGeometry(geometry: Geometry, label: string): Geometry {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as number[][][][];
  const rewound = polygons.map((rings) => {
    const area = geoArea({ type: 'Polygon', coordinates: rings } as never);
    const fixed = area > Math.PI ? rings.map((ring) => [...ring].reverse()) : rings;
    return fixed;
  });
  const result: Geometry = geometry.type === 'Polygon' ? { type: 'Polygon', coordinates: rewound[0] } : { type: 'MultiPolygon', coordinates: rewound };
  assertWinding(result, label);
  return result;
}

function properties(feature: GeoJsonFeature): Record<string, unknown> { return feature.properties ?? {}; }
function propertyString(feature: GeoJsonFeature, keys: string[], label: string): string {
  for (const key of keys) {
    const value = properties(feature)[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  }
  throw new Error(`${label} is missing (${keys.join(', ')}).`);
}
function sidoCode(feature: GeoJsonFeature): string { return propertyString(feature, ['CTPRVN_CD', 'ctprvn_cd', 'CTPRVNCD', 'ctprvncd'], 'sido code').padStart(2, '0'); }
function sigunguCode(feature: GeoJsonFeature): string { return propertyString(feature, ['SIG_CD', 'sig_cd', 'SIGCD', 'sigcd'], 'sigungu code').padStart(5, '0'); }
function sigunguName(feature: GeoJsonFeature): string { return propertyString(feature, ['SIG_KOR_NM', 'sig_kor_nm', 'SIGUNGU_NM', 'sigungu_nm'], 'sigungu name'); }
function multiPolygonCoordinates(geometry: Geometry, label: string): unknown[] {
  assertGeometry(geometry, label);
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as unknown[];
  throw new Error(`${label} must be Polygon or MultiPolygon to compose a sido boundary.`);
}
function isSplit(value: string | SidoSplit): value is SidoSplit { return typeof value !== 'string'; }
function resolvedSido(code: string, sigungu: string, crosswalk: Crosswalk): string | null {
  const entry = crosswalk.sido[code];
  if (typeof entry === 'string') return entry;
  if (!entry || !isSplit(entry)) return null;
  for (const [sido, names] of Object.entries(entry.split)) if (names !== 'rest' && names.includes(sigungu)) return sido;
  return Object.entries(entry.split).find(([, names]) => names === 'rest')?.[0] ?? null;
}
const SIGUNGU_ALIASES: Record<string, Record<string, string>> = { 인천광역시: { 제물포구: '동구', 영종구: '중구', 서해구: '서구', 검단구: '서구' } };
function resolvedSigungu(sido: string, sourceName: string): string | null {
  if (REGIONS[sido]?.includes(sourceName)) return sourceName;
  const alias = SIGUNGU_ALIASES[sido]?.[sourceName];
  if (alias && REGIONS[sido]?.includes(alias)) return alias;
  return REGIONS[sido]?.find((name) => sourceName.startsWith(`${name} `)) ?? null;
}

function composeOutputs(sidoSource: GeoJsonFeatureCollection, sigunguSource: GeoJsonFeatureCollection, crosswalk: Crosswalk): { sido: GeoJsonFeatureCollection; sigungu: GeoJsonFeatureCollection; excluded: string[] } {
  assertEpsg4326(sidoSource);
  assertEpsg4326(sigunguSource);
  const sigunguByRegionKey = new Map<string, GeoJsonFeature>();
  const excluded: string[] = [];
  const mergedParts = new Map<string, unknown[]>();
  for (const sourceFeature of sigunguSource.features) {
    const code = sigunguCode(sourceFeature);
    const sourceName = sigunguName(sourceFeature);
    const sido = resolvedSido(code.slice(0, 2), sourceName, crosswalk);
    const name = sido && resolvedSigungu(sido, sourceName);
    if (!sido || !name) { excluded.push(`${code} ${sourceName}`); continue; }
    assertGeometry(sourceFeature.geometry, `sigungu ${code} ${sourceName}`);
    const geometry = rewindGeometry(roundedGeometry(sourceFeature.geometry, 4), `sigungu ${code} ${sourceName}`);
    const regionKey = `${sido} ${name}`;
    const existing = sigunguByRegionKey.get(regionKey);
    if (existing) {
      const coordinates = [...multiPolygonCoordinates(existing.geometry!, `sigungu ${regionKey}`), ...multiPolygonCoordinates(geometry, `sigungu ${code} ${sourceName}`)];
      existing.geometry = rewindGeometry({ type: 'MultiPolygon', coordinates }, `sigungu ${regionKey}`);
    } else {
      sigunguByRegionKey.set(regionKey, { type: 'Feature', properties: { regionKey, sido, name, code }, geometry });
    }
    if (code.startsWith('12')) {
      const parts = mergedParts.get(sido) ?? [];
      parts.push(...multiPolygonCoordinates(geometry, `sigungu ${code} ${sourceName}`));
      mergedParts.set(sido, parts);
    }
  }
  const sidoFeatures: GeoJsonFeature[] = [];
  for (const sourceFeature of sidoSource.features) {
    const code = sidoCode(sourceFeature);
    if (code === '12') continue;
    const regionKey = crosswalk.sido[code];
    if (typeof regionKey !== 'string' || !REGIONS[regionKey]) throw new Error(`Sido ${code} has no REGIONS mapping.`);
    assertGeometry(sourceFeature.geometry, `sido ${code}`);
    const geometry = rewindGeometry(roundedGeometry(sourceFeature.geometry, 3, true), `sido ${code}`);
    sidoFeatures.push({ type: 'Feature', properties: { regionKey, name: regionKey, code }, geometry });
  }
  const merged = crosswalk.sido['12'];
  if (!merged || !isSplit(merged)) throw new Error('Crosswalk code 12 must define a split.');
  for (const regionKey of Object.keys(merged.split)) {
    const coordinates = mergedParts.get(regionKey);
    if (!coordinates?.length) throw new Error(`Merged code 12 has no sigungu geometry for ${regionKey}.`);
    const geometry: Geometry = { type: 'MultiPolygon', coordinates };
    assertGeometry(geometry, `sido ${regionKey}`);
    sidoFeatures.push({ type: 'Feature', properties: { regionKey, name: regionKey, code: '12' }, geometry: rewindGeometry(geometry, `sido ${regionKey}`) });
  }
  return { sido: { type: 'FeatureCollection', features: sidoFeatures }, sigungu: { type: 'FeatureCollection', features: [...sigunguByRegionKey.values()] }, excluded };
}

function assertProperties(feature: GeoJsonFeature, expected: Record<string, string>, label: string): void {
  const actual = feature.properties;
  if (!actual || Object.keys(actual).length !== Object.keys(expected).length || Object.entries(expected).some(([key, value]) => actual[key] !== value)) throw new Error(`${label} properties do not match the published contract.`);
}
function verifySido(boundary: GeoJsonFeatureCollection): void {
  if (boundary.features.length !== 17) throw new Error(`Sido boundary must contain exactly 17 features; found ${boundary.features.length}.`);
  const keys = new Set<string>();
  for (const feature of boundary.features) {
    const regionKey = typeof feature.properties?.regionKey === 'string' ? feature.properties.regionKey : '';
    const code = typeof feature.properties?.code === 'string' ? feature.properties.code : '';
    assertProperties(feature, { regionKey, name: regionKey, code }, `Sido ${regionKey || '(unknown)'}`);
    if (!REGIONS[regionKey] || keys.has(regionKey)) throw new Error(`Sido has invalid or duplicate REGIONS key: ${regionKey}.`);
    keys.add(regionKey);
    assertGeometry(feature.geometry, `sido ${regionKey}`);
    assertWinding(feature.geometry, `sido ${regionKey}`);
  }
  const missing = Object.keys(REGIONS).filter((key) => !keys.has(key));
  if (missing.length) throw new Error(`Sido REGIONS coverage failed. Missing: ${missing.join(', ')}.`);
}
function verifySigungu(sido: string, boundary: GeoJsonFeatureCollection): void {
  const expected = REGIONS[sido];
  if (!expected) throw new Error(`Unknown sido partition: ${sido}.`);
  if (boundary.features.length !== expected.length) throw new Error(`${sido} sigungu boundary must contain exactly ${expected.length} features; found ${boundary.features.length}.`);
  const keys = new Set<string>();
  for (const feature of boundary.features) {
    const props = feature.properties ?? {};
    const featureSido = typeof props.sido === 'string' ? props.sido : '';
    const name = typeof props.name === 'string' ? props.name : '';
    const code = typeof props.code === 'string' ? props.code : '';
    const regionKey = `${featureSido} ${name}`;
    assertProperties(feature, { regionKey, sido: featureSido, name, code }, `Sigungu ${regionKey || '(unknown)'}`);
    if (featureSido !== sido || !expected.includes(name) || keys.has(regionKey)) throw new Error(`${sido} has an invalid or duplicate sigungu REGIONS key: ${regionKey}.`);
    keys.add(regionKey);
    assertGeometry(feature.geometry, `sigungu ${regionKey}`);
    assertWinding(feature.geometry, `sigungu ${regionKey}`);
  }
  const missing = expected.filter((name) => !keys.has(`${sido} ${name}`));
  if (missing.length) throw new Error(`${sido} sigungu REGIONS coverage failed. Missing: ${missing.join(', ')}.`);
}

function temporaryPath(outputPath: string): string { return path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`); }
function sigunguStem(sido: string, features: GeoJsonFeature[], sidoCodes: Map<string, string>): string {
  const code = sidoCodes.get(sido);
  if (!code) throw new Error(`No sido code for ${sido}.`);
  if (code !== '12') return `kr-sigungu.${code}`;
  const suffix = sido === '광주광역시' ? 'gwangju' : sido === '전라남도' ? 'jeonnam' : null;
  if (!suffix) throw new Error(`Code 12 split requires a deterministic filename suffix for ${sido}.`);
  if (features.some((feature) => String(feature.properties?.code).slice(0, 2) !== '12')) throw new Error(`${sido} partition contains an unexpected sido code.`);
  return `kr-sigungu.12-${suffix}`;
}
function makeManifest(sido: GeoJsonFeatureCollection, sigungu: GeoJsonFeatureCollection, metadata: Record<WfsLayer, SourceMetadata>): { manifest: Manifest; files: Array<[string, string]> } {
  const sidoCodes = new Map<string, string>();
  for (const feature of sido.features) sidoCodes.set(String(feature.properties?.regionKey), String(feature.properties?.code));
  const partitions = new Map(Object.keys(REGIONS).map((sido) => [sido, sigungu.features.filter((feature) => feature.properties?.sido === sido)]));
  const versionHash = digest(JSON.stringify(sido) + JSON.stringify(sigungu));
  const version = `${metadata.sido.referenceDate}-${versionHash.slice(0, 8)}`;
  const files: Array<[string, string]> = [];
  const sidoContent = `${JSON.stringify(sido)}\n`;
  const manifest: Manifest = {
    schemaVersion: 1,
    version,
    referenceDate: metadata.sido.referenceDate,
    license: LICENSE,
    sourceUrl: wfsRecordUrl('sido'),
    sido: { file: `kr-sido.${version}.geo.json`, sha256: digest(sidoContent), featureCount: sido.features.length },
    sigungu: {},
  };
  files.push([manifest.sido.file, sidoContent]);
  for (const [sido, features] of partitions) {
    const content = `${JSON.stringify({ type: 'FeatureCollection', features })}\n`;
    const file = `${sigunguStem(sido, features, sidoCodes)}.${version}.geo.json`;
    manifest.sigungu[sido] = { file, sha256: digest(content), featureCount: features.length };
    files.push([file, content]);
  }
  return { manifest, files };
}
function assertPublishedFile(value: unknown, label: string): asserts value is PublishedFile {
  if (!isRecord(value) || typeof value.file !== 'string' || !/^kr-(sido|sigungu\.[a-z0-9-]+)\.\d{4}-\d{2}-\d{2}-[a-f0-9]{8}\.geo\.json$/.test(value.file) || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || typeof value.featureCount !== 'number' || !Number.isInteger(value.featureCount) || value.featureCount < 0) throw new Error(`${label} is invalid.`);
}
function assertManifest(value: unknown): asserts value is Manifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.version !== 'string' || !/^\d{4}-\d{2}-\d{2}-[a-f0-9]{8}$/.test(value.version) || typeof value.referenceDate !== 'string' || typeof value.license !== 'string' || typeof value.sourceUrl !== 'string' || value.sourceUrl.includes('key=') || !isRecord(value.sigungu)) throw new Error('Geo manifest has an invalid schema.');
  assertPublishedFile(value.sido, 'Geo manifest sido');
  for (const sido of Object.keys(REGIONS)) assertPublishedFile(value.sigungu[sido], `Geo manifest sigungu ${sido}`);
  if (Object.keys(value.sigungu).length !== Object.keys(REGIONS).length) throw new Error('Geo manifest sigungu partitions do not match REGIONS.');
}
async function readPublishedFile(file: PublishedFile): Promise<GeoJsonFeatureCollection> {
  const filePath = path.join(GEO_DIR, file.file);
  const text = await readFile(filePath, 'utf8');
  if (digest(text) !== file.sha256) throw new Error(`${file.file} SHA-256 mismatch.`);
  const parsed: unknown = JSON.parse(text);
  assertFeatureCollection(parsed, file.file);
  if (parsed.features.length !== file.featureCount) throw new Error(`${file.file} feature count mismatch.`);
  return parsed;
}
async function verifyCoverage(): Promise<void> {
  const manifestValue: unknown = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  assertManifest(manifestValue);
  const sido = await readPublishedFile(manifestValue.sido);
  verifySido(sido);
  let sigunguCount = 0;
  for (const sido of Object.keys(REGIONS)) {
    const partition = await readPublishedFile(manifestValue.sigungu[sido]);
    verifySigungu(sido, partition);
    sigunguCount += partition.features.length;
  }
  console.log(`Boundary coverage verified: ${sido.features.length} sido and ${sigunguCount} sigungu features across ${Object.keys(REGIONS).length} partitions.`);
}
async function cleanupObsoleteFiles(manifest: Manifest): Promise<void> {
  const referenced = new Set([manifest.sido.file, ...Object.values(manifest.sigungu).map((entry) => entry.file)]);
  const entries = await readdir(GEO_DIR, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && /^kr-.*\.geo\.json$/.test(entry.name) && !referenced.has(entry.name)).map((entry) => unlink(path.join(GEO_DIR, entry.name))));
}
async function writeOutputs(sido: GeoJsonFeatureCollection, sigungu: GeoJsonFeatureCollection, metadata: Record<WfsLayer, SourceMetadata>): Promise<void> {
  const { manifest, files } = makeManifest(sido, sigungu, metadata);
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(GEO_DIR, { recursive: true });
  const temporaryFiles = files.map(([file, content]) => [temporaryPath(path.join(GEO_DIR, file)), path.join(GEO_DIR, file), content] as const);
  const temporaryManifest = temporaryPath(MANIFEST_PATH);
  try {
    await Promise.all(temporaryFiles.map(([temporary, , content]) => writeFile(temporary, content)));
    await writeFile(temporaryManifest, manifestContent);
    await verifyCoverageFromTemporary(manifest, temporaryFiles);
    await Promise.all(temporaryFiles.map(([temporary, output]) => rename(temporary, output)));
    await rename(temporaryManifest, MANIFEST_PATH);
    await cleanupObsoleteFiles(manifest);
  } catch (error) {
    await Promise.all([...temporaryFiles.map(([temporary]) => unlink(temporary).catch(() => undefined)), unlink(temporaryManifest).catch(() => undefined)]);
    throw error;
  }
}
async function verifyCoverageFromTemporary(manifest: Manifest, temporaryFiles: ReadonlyArray<readonly [string, string, string]>): Promise<void> {
  const temporaryByOutput = new Map(temporaryFiles.map(([temporary, output]) => [path.basename(output), temporary]));
  const readTemporary = async (file: PublishedFile): Promise<GeoJsonFeatureCollection> => {
    const text = await readFile(temporaryByOutput.get(file.file) ?? '', 'utf8');
    if (digest(text) !== file.sha256) throw new Error(`${file.file} temporary SHA-256 mismatch.`);
    const parsed: unknown = JSON.parse(text);
    assertFeatureCollection(parsed, file.file);
    if (parsed.features.length !== file.featureCount) throw new Error(`${file.file} temporary feature count mismatch.`);
    return parsed;
  };
  verifySido(await readTemporary(manifest.sido));
  for (const sido of Object.keys(REGIONS)) verifySigungu(sido, await readTemporary(manifest.sigungu[sido]));
}
function sourceMetadata(layer: WfsLayer, body: string, sourcePath?: string): SourceMetadata {
  return { url: wfsRecordUrl(layer), referenceDate: snapshotDate(sourcePath), sha256: digest(body), license: LICENSE };
}

async function main(): Promise<void> {
  const { fromSnapshot, fromSnapshotSigungu, verify } = parseArgs(process.argv.slice(2));
  if (fromSnapshot && fromSnapshotSigungu) {
    const [sidoBody, sigunguBody, crosswalkText] = await Promise.all([readFile(fromSnapshot, 'utf8'), readFile(fromSnapshotSigungu, 'utf8'), readFile(CROSSWALK_PATH, 'utf8')]);
    const sidoSource: unknown = JSON.parse(sidoBody);
    const sigunguSource: unknown = JSON.parse(sigunguBody);
    assertFeatureCollection(sidoSource, fromSnapshot);
    assertFeatureCollection(sigunguSource, fromSnapshotSigungu);
    const built = composeOutputs(sidoSource, sigunguSource, JSON.parse(crosswalkText) as Crosswalk);
    await writeOutputs(built.sido, built.sigungu, { sido: sourceMetadata('sido', sidoBody, fromSnapshot), sigungu: sourceMetadata('sigungu', sigunguBody, fromSnapshotSigungu) });
    console.log(`Excluded sigungu outside REGIONS (${built.excluded.length}): ${built.excluded.join(', ') || 'none'}`);
  } else if (!verify) {
    const apiKey = process.env.VWORLD_API_KEY;
    if (!apiKey) throw new Error('VWORLD_API_KEY is required to download VWorld boundaries.');
    const [sidoResult, sigunguResult, crosswalkText] = await Promise.all([fetchSnapshot('sido', apiKey), fetchSnapshot('sigungu', apiKey), readFile(CROSSWALK_PATH, 'utf8')]);
    const built = composeOutputs(sidoResult.collection, sigunguResult.collection, JSON.parse(crosswalkText) as Crosswalk);
    await writeOutputs(built.sido, built.sigungu, { sido: sourceMetadata('sido', sidoResult.body), sigungu: sourceMetadata('sigungu', sigunguResult.body) });
    console.log(`Excluded sigungu outside REGIONS (${built.excluded.length}): ${built.excluded.join(', ') || 'none'}`);
  }
  if (verify) await verifyCoverage();
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
