import { decryptJson, encryptJson } from './crypto';
import type { KcpConfig } from './config';

// NHN KCP 본인확인(V2) 서버 API 두 개.
//   거래등록  POST {apiBase}/api/reg/certDataReg.do   — 본문은 암호화 전문(enc_data) 문자열, 헤더 site_cd·rv
//   결과조회  POST {apiBase}/api/query/getCertData.do — 본문은 평문 JSON {reg_cert_key, ordr_idxx}, 헤더 site_cd
// 규격 출처: NHN KCP 본인확인 V2 API 연동가이드 v1.0.1 (3-2, 3-4, 3-5) + Node 샘플 routes/index.js.

export type KcpRegisterResult = {
  regCertKey: string;
  callUrl: string;
};

export type KcpCertData = {
  res_cd: string;
  res_msg?: string;
  phone_no?: string;
  user_name?: string;
  birth_day?: string; // YYYYMMDD
  comm_id?: string;
  sex_code?: string; // 01 남 / 02 여
  local_code?: string; // 01 내국인 / 02 외국인
  CI?: string;
  DI?: string;
  CI_URL?: string;
  DI_URL?: string;
  per_cert_no?: string;
};

type KcpRawResponse = Record<string, unknown> & { res_cd?: string; res_msg?: string };

const TIMEOUT_MS = 15_000;

async function postJson(url: string, headers: Record<string, string>, body: string): Promise<KcpRawResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KCP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as KcpRawResponse;
  } catch {
    throw new Error(`KCP 응답이 JSON 이 아닙니다: ${text.slice(0, 200)}`);
  }
}

/** 3-2 거래등록. 성공 시 인증창 주소(call_url)와 거래등록키(reg_cert_key)를 돌려준다. */
export async function registerCert(
  config: KcpConfig,
  input: { ordrIdxx: string; retUrl: string },
): Promise<KcpRegisterResult> {
  const payload = {
    site_cd: config.siteCd,
    ordr_idxx: input.ordrIdxx,
    Ret_URL: input.retUrl,
    web_siteid: config.webSiteId,
    param_opt_1: '',
    param_opt_2: '',
    param_opt_3: '',
  };
  const { enc_data, rv } = encryptJson(payload, config.encKey, config.siteCd);
  const data = await postJson(
    `${config.apiBase}/api/reg/certDataReg.do`,
    { site_cd: config.siteCd, rv },
    enc_data,
  );
  if (data.res_cd !== '0000') {
    throw new Error(`KCP 거래등록 실패 [${data.res_cd ?? '?'}] ${data.res_msg ?? ''}`.trim());
  }
  const regCertKey = typeof data.reg_cert_key === 'string' ? data.reg_cert_key : '';
  const callUrl = typeof data.call_url === 'string' ? data.call_url : '';
  if (!regCertKey || !/^https:\/\//.test(callUrl)) {
    throw new Error('KCP 거래등록 응답에 reg_cert_key 또는 call_url 이 없습니다');
  }
  return { regCertKey, callUrl };
}

/** 3-4 결과조회 + 3-5 복호화. 인증이 실제로 KCP 에서 끝난 건만 0000 으로 풀린다. */
export async function queryCertResult(
  config: KcpConfig,
  input: { regCertKey: string; ordrIdxx: string },
): Promise<KcpCertData> {
  const data = await postJson(
    `${config.apiBase}/api/query/getCertData.do`,
    { site_cd: config.siteCd },
    JSON.stringify({ reg_cert_key: input.regCertKey, ordr_idxx: input.ordrIdxx }),
  );
  if (data.res_cd !== '0000') {
    throw new Error(`KCP 결과조회 실패 [${data.res_cd ?? '?'}] ${data.res_msg ?? ''}`.trim());
  }
  const encCertData = typeof data.enc_cert_data === 'string' ? data.enc_cert_data : '';
  const rv = typeof data.rv === 'string' ? data.rv : '';
  if (!encCertData || !rv) {
    throw new Error('KCP 결과조회 응답에 enc_cert_data 또는 rv 가 없습니다');
  }
  const cert = decryptJson<KcpCertData>(encCertData, rv, config.encKey, config.siteCd);
  if (cert.res_cd !== '0000') {
    throw new Error(`KCP 본인확인 실패 [${cert.res_cd ?? '?'}] ${cert.res_msg ?? ''}`.trim());
  }
  return cert;
}
