import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

// NHN KCP 본인확인(V2) 전문 암호화 — KCP 가 배포하는 샘플 라이브러리(utils/Crypto.js, 난독화본)와
// 바이트 단위로 호환되도록 node:crypto 만으로 다시 쓴 것이다. 규격은 KCP 문서에 없고 샘플에만 있다:
//
//   rv   = 16바이트 CSPRNG                       (Base64 로 헤더 `rv` 와 응답 `rv` 에 실린다)
//   key  = PBKDF2-SHA256(ENC_KEY, salt=rv, 10,000회, 32바이트)
//   iv   = PBKDF2-SHA256(site_cd, salt=rv, 10,000회, 32바이트)[0..16)
//   data = AES-256-CBC(key, iv, PKCS#7 패딩)      (Base64)
//
// 검증: 2026-09-06 KCP 샘플의 encryptJson 결과를 이 decryptJson 이 풀고, 그 반대도 성립함을
// 실측(kcp-crypto.test.ts 의 고정 벡터가 그 증거). 같은 규격이 거래등록 요청(enc_data)과
// 결과조회 응답(enc_cert_data) 양쪽에 쓰인다.

const PBKDF2_ITERATIONS = 10_000;
const KEY_BYTES = 32;
const IV_BYTES = 16;
const RV_BYTES = 16;
const BLOCK = 16;

function derive(secret: string, salt: Buffer): Buffer {
  return pbkdf2Sync(Buffer.from(secret, 'utf8'), salt, PBKDF2_ITERATIONS, KEY_BYTES, 'sha256');
}

function keyAndIv(encKey: string, siteCd: string, rv: Buffer): { key: Buffer; iv: Buffer } {
  return { key: derive(encKey, rv), iv: derive(siteCd, rv).subarray(0, IV_BYTES) };
}

/** 거래등록 요청 전문을 KCP 규격으로 암호화한다. rv 는 호출마다 새로 뽑는다. */
export function encryptJson(
  payload: string | Record<string, unknown>,
  encKey: string,
  siteCd: string,
): { enc_data: string; rv: string } {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const rv = randomBytes(RV_BYTES);
  const { key, iv } = keyAndIv(encKey, siteCd, rv);
  const data = Buffer.from(text, 'utf8');
  // KCP 라이브러리는 자체 PKCS#7 패딩을 붙이고 setAutoPadding(false) 로 돌린다.
  // node 의 기본 자동 패딩도 PKCS#7 이라 결과는 같지만, 규격을 눈에 보이게 두기 위해 그대로 따른다.
  const padLen = BLOCK - (data.length % BLOCK);
  const padded = Buffer.concat([data, Buffer.alloc(padLen, padLen)]);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  const enc = Buffer.concat([cipher.update(padded), cipher.final()]);
  return { enc_data: enc.toString('base64'), rv: rv.toString('base64') };
}

/** 결과조회 응답(enc_cert_data, rv)을 복호화해 JSON 으로 돌려준다. 키가 틀리면 던진다. */
export function decryptJson<T = Record<string, unknown>>(
  encData: string,
  rvBase64: string,
  encKey: string,
  siteCd: string,
): T {
  const rv = Buffer.from(rvBase64, 'base64');
  if (rv.length !== RV_BYTES) {
    throw new Error(`KCP rv 길이가 규격(${RV_BYTES}바이트)과 다릅니다`);
  }
  const { key, iv } = keyAndIv(encKey, siteCd, rv);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  decipher.setAutoPadding(false);
  const buf = Buffer.concat([decipher.update(Buffer.from(encData, 'base64')), decipher.final()]);
  const padLen = buf[buf.length - 1];
  if (!padLen || padLen > BLOCK || padLen > buf.length) {
    throw new Error('KCP 응답 복호화 실패 (패딩 불일치 — ENC_KEY 또는 site_cd 를 확인하세요)');
  }
  for (let i = buf.length - padLen; i < buf.length; i++) {
    if (buf[i] !== padLen) {
      throw new Error('KCP 응답 복호화 실패 (패딩 불일치 — ENC_KEY 또는 site_cd 를 확인하세요)');
    }
  }
  const text = buf.subarray(0, buf.length - padLen).toString('utf8');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('KCP 응답 복호화 실패 (JSON 아님 — ENC_KEY 또는 site_cd 를 확인하세요)');
  }
}
