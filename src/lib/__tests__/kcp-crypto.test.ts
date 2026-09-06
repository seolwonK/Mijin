// NHN KCP 본인확인(V2) 전문 암호화 호환성 — KCP 샘플 라이브러리(난독화본)와 바이트 단위로 같아야 한다.
//
// 고정 벡터는 2026-09-06 KCP 배포 샘플(NODE_KCP_PERSON_VERIFICATION_V2/utils/Crypto.js)의 encryptJson 으로
// 테스트 사이트코드·테스트 ENC_KEY 를 써서 만든 값이다. 이 벡터가 풀리지 않으면 운영에서 결과조회
// 응답(enc_cert_data)을 못 풀어 실명·CI/DI 를 얻지 못한다 — 그래서 라운드트립만으로는 부족하다.
import { describe, expect, it } from 'vitest';

import { decryptJson, encryptJson } from '@/lib/identity/kcp/crypto';

const SITE_CD = 'AO7F3'; // KCP 공개 테스트 사이트코드
const ENC_KEY = 'c2a22fa3ebe4698075bcac6b433d52e351c881b02fb83488d4283a43385b1f8e'; // KCP 공개 테스트 키

const VECTOR = {
  plain:
    '{"res_cd":"0000","res_msg":"정상처리","phone_no":"01012345678","user_name":"홍길동","birth_day":"19900101","comm_id":"SKT","sex_code":"01","local_code":"01","CI":"ci+value/==","DI":"di+value/==","CI_URL":"ci%2Bvalue%2F%3D%3D","DI_URL":"di%2Bvalue%2F%3D%3D","per_cert_no":"25284339349648"}',
  enc_data:
    '/hk07eY0M51fBa0L+rwTpJNvghmkXui/lPmBTZyHg1Xpfvn9/53U0VNkELLKsTuEmXUo8G9oVLzLmJbjER56KCeytzPDngBTeTS7Ox2jhKE+3ojcyE9t2UVluUOzi7Q/x/jXCFtqllJoHc76zxX7SLJr2CxPUkzGIDphg4OaeY74NRdab/vSg9D9jtrSGbqFGPt1Sr6jWD9ePF8AS8oArtG6sUybGsSsXhpXc1pE0h9fUVup7DdPESnOcfIdQrpxfuvNCP477wnIzagGnAUUR5gSJWzvJ2OfXSumB315Z07ZN22BkjGgNN/4VYp6Kd5H3WQl7ZG2bmSkTljLeaPcwkU0WrTlRL7gtgckYZIoJKHy8RHab/Fa5uOt9jHu18qOffyFpu66YYm+fIHJ4lwfCg==',
  rv: 'E3P1TZGgQntBATBrdtUzIQ==',
};

describe('kcp crypto', () => {
  it('KCP 샘플 라이브러리가 만든 전문을 그대로 복호화한다 (고정 벡터)', () => {
    const dec = decryptJson<Record<string, string>>(VECTOR.enc_data, VECTOR.rv, ENC_KEY, SITE_CD);
    expect(dec).toEqual(JSON.parse(VECTOR.plain));
    expect(dec.user_name).toBe('홍길동');
    expect(dec.CI_URL).toBe('ci%2Bvalue%2F%3D%3D');
  });

  it('encryptJson → decryptJson 라운드트립 (한글·패딩 경계 포함)', () => {
    for (const text of ['{}', '{"a":1}', JSON.stringify({ n: '가'.repeat(15) }), 'x'.repeat(16), 'y'.repeat(31)]) {
      const { enc_data, rv } = encryptJson(text, ENC_KEY, SITE_CD);
      expect(Buffer.from(rv, 'base64')).toHaveLength(16);
      const back = text.startsWith('{')
        ? JSON.stringify(decryptJson(enc_data, rv, ENC_KEY, SITE_CD))
        : null;
      if (back !== null) expect(back).toBe(text);
      else expect(() => decryptJson(enc_data, rv, ENC_KEY, SITE_CD)).toThrow('JSON 아님');
    }
  });

  it('객체를 넘기면 JSON 문자열로 직렬화해 암호화한다', () => {
    const { enc_data, rv } = encryptJson({ site_cd: SITE_CD, ordr_idxx: 'kc1' }, ENC_KEY, SITE_CD);
    expect(decryptJson(enc_data, rv, ENC_KEY, SITE_CD)).toEqual({ site_cd: SITE_CD, ordr_idxx: 'kc1' });
  });

  it('rv 는 호출마다 달라 같은 평문도 다른 암호문이 된다', () => {
    const a = encryptJson('{"a":1}', ENC_KEY, SITE_CD);
    const b = encryptJson('{"a":1}', ENC_KEY, SITE_CD);
    expect(a.rv).not.toBe(b.rv);
    expect(a.enc_data).not.toBe(b.enc_data);
  });

  it('ENC_KEY 나 site_cd 가 다르면 조용히 쓰레기를 돌려주지 않고 던진다', () => {
    expect(() => decryptJson(VECTOR.enc_data, VECTOR.rv, 'f'.repeat(64), SITE_CD)).toThrow(
      '복호화 실패',
    );
    expect(() => decryptJson(VECTOR.enc_data, VECTOR.rv, ENC_KEY, 'PO046')).toThrow('복호화 실패');
  });

  it('rv 길이가 16바이트가 아니면 거부한다', () => {
    expect(() => decryptJson(VECTOR.enc_data, 'AAAA', ENC_KEY, SITE_CD)).toThrow('rv 길이');
  });
});
