import { createHash, createHmac } from 'crypto';

/**
 * Cloudflare R2 (S3 호환) 최소 클라이언트.
 *
 * `@aws-sdk/client-s3` 를 넣지 않고 SigV4 서명만 직접 구현한다. 이 앱이 R2 에서 쓰는 동작은
 * 오브젝트 PUT/GET/DELETE 세 가지뿐이고, 그 대가로 수 MB 짜리 SDK 의존성과 그 전이 의존성을
 * 배포 이미지에 넣는 것은 비용이 맞지 않는다. 서명 규칙 자체는 AWS SigV4 그대로다
 * (region 은 R2 규약상 항상 "auto").
 *
 * 버킷은 **비공개**로 둔다. 사진 본문은 반드시 앱의 권한 검사 라우트를 거쳐 나가고
 * (src/app/api/requests/[id]/photos/[photoId]/route.ts), R2 공개 URL 이나 프리사인 URL 을
 * 고객·업체에 직접 노출하지 않는다 — 서명 URL 은 한 번 새어 나가면 만료 전까지 누구나
 * 열 수 있어 "배정된 사람만 본다"는 규칙이 깨진다.
 */

export type R2Config = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** 스킴 포함, 끝 슬래시 없음. 예: https://<account>.r2.cloudflarestorage.com */
  endpoint: string;
};

const REGION = 'auto';
const SERVICE = 's3';
const TIMEOUT_MS = 20_000;

/**
 * 환경변수에서 R2 설정을 읽는다. 하나라도 비면 null — "반쯤 켜진" 상태를 만들지 않기 위해
 * 전부 있거나 전부 없거나 둘 중 하나로만 취급한다(텔레포니 설정과 같은 원칙).
 */
export function r2Config(
  env: Record<string, string | undefined> = process.env,
): R2Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accessKeyId || !secretAccessKey || !bucket) return null;

  const explicit = env.R2_ENDPOINT?.trim();
  if (!explicit && !accountId) return null;
  const endpoint = (explicit || `https://${accountId}.r2.cloudflarestorage.com`).replace(
    /\/+$/,
    '',
  );
  return { accessKeyId, secretAccessKey, bucket, endpoint };
}

export function isR2Configured(): boolean {
  return r2Config() !== null;
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Uint8Array | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** 오브젝트 키를 canonical URI 로. 구분자 '/' 는 남기고 각 세그먼트만 인코딩한다. */
function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export type SignedRequest = { url: string; headers: Record<string, string> };

/**
 * SigV4 서명된 요청 정보를 만든다. 순수 함수라 테스트에서 고정 시각으로 검증할 수 있다.
 *
 * @param headers Host/x-amz-date/x-amz-content-sha256 을 제외한 추가 서명 대상 헤더
 *                (예: content-type). 키는 소문자로 넘긴다.
 */
export function signRequest(
  cfg: R2Config,
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
  key: string,
  payload: Uint8Array | null,
  headers: Record<string, string> = {},
  now: Date = new Date(),
): SignedRequest {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}`);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload ?? '');

  const signed: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedNames = Object.keys(signed).sort();
  const canonicalHeaders = signedNames.map((n) => `${n}:${signed[n]}\n`).join('');
  const signedHeaders = signedNames.join(';');

  const canonicalRequest = [
    method,
    url.pathname,
    '', // 쿼리스트링 없음
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    url: url.toString(),
    headers: {
      ...signed,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function send(
  cfg: R2Config,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  payload: Uint8Array | null,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const { url, headers } = signRequest(cfg, method, key, payload, extraHeaders);
  // host 헤더는 fetch 가 URL 에서 직접 채운다 — 명시하면 런타임에 따라 거부된다.
  delete (headers as Record<string, string | undefined>).host;
  return fetch(url, {
    method,
    headers,
    body: payload ? new Uint8Array(payload) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function r2Put(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const cfg = r2Config();
  if (!cfg) throw new Error('R2 가 설정되지 않았습니다');
  const res = await send(cfg, 'PUT', key, body, { 'content-type': contentType });
  if (!res.ok) {
    throw new Error(`R2 업로드 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}

/** 오브젝트 본문. 없으면 null (404). */
export async function r2Get(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const cfg = r2Config();
  if (!cfg) throw new Error('R2 가 설정되지 않았습니다');
  const res = await send(cfg, 'GET', key, null);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 조회 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  return {
    body: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}

export async function r2Delete(key: string): Promise<void> {
  const cfg = r2Config();
  if (!cfg) throw new Error('R2 가 설정되지 않았습니다');
  const res = await send(cfg, 'DELETE', key, null);
  // DELETE 는 없는 키에도 204 를 준다 (S3 규약) — 404 도 성공으로 취급.
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 삭제 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
}
