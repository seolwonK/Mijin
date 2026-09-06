// NHN KCP 직접 연동 provider 의 서버 재검증 계약 — portone.test 와 같은 세 가지를 지킨다:
// 정말 인증됐는가(세션 AUTHED + KCP 결과조회 0000), 내가 등록한 그 거래인가(ordr_idxx ↔ 세션),
// 지금 막 끝난 인증인가(세션 만료). 여기에 "한 거래는 한 번만"(consumedAt)이 더해진다.
//
// KCP 결과조회 응답은 우리 encryptJson 으로 만든다 — 규격이 대칭이고 KCP 라이브러리와의 호환은
// kcp-crypto.test.ts 의 고정 벡터가 증명한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encryptJson } from '@/lib/identity/kcp/crypto';
import { newOrdrIdxx, sanitizeReturnPath } from '@/lib/identity/kcp/session';

const SITE_CD = 'AO7F3';
const ENC_KEY = 'c2a22fa3ebe4698075bcac6b433d52e351c881b02fb83488d4283a43385b1f8e';
const ORDR = 'kc00000001abcdefghijklmnopqrstuvwxyz0123';
const REG_KEY = '1234567890123456';

type Session = {
  ordrIdxx: string;
  regCertKey: string;
  mode: string;
  returnPath: string;
  status: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

const db = vi.hoisted(() => ({
  sessions: new Map<string, Session>(),
  updates: [] as unknown[],
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    kcpCertSession: {
      findUnique: vi.fn(async ({ where }: { where: { ordrIdxx?: string; regCertKey?: string } }) => {
        if (where.ordrIdxx) return db.sessions.get(where.ordrIdxx) ?? null;
        return [...db.sessions.values()].find((s) => s.regCertKey === where.regCertKey) ?? null;
      }),
      updateMany: vi.fn(async (args: unknown) => {
        db.updates.push(args);
        return { count: 1 };
      }),
    },
  },
}));

import { kcpProvider, toIdentityResult } from '@/lib/identity/kcp';

function session(over: Partial<Session> = {}): Session {
  return {
    ordrIdxx: ORDR,
    regCertKey: REG_KEY,
    mode: 'POPUP',
    returnPath: '/tech/signup',
    status: 'AUTHED',
    expiresAt: new Date(Date.now() + 5 * 60_000),
    consumedAt: null,
    ...over,
  };
}

function certBody(over: Record<string, string> = {}) {
  return {
    res_cd: '0000',
    res_msg: '정상처리',
    phone_no: '010-9999-8800',
    user_name: ' 홍길동 ',
    birth_day: '19900102',
    comm_id: 'SKT',
    sex_code: '02',
    local_code: '01',
    CI: 'ci-plain',
    DI: 'di-plain',
    CI_URL: 'ci%2Bvalue%2F%3D%3D',
    DI_URL: 'di%2Bvalue%2F%3D%3D',
    per_cert_no: '25284339349648',
    ...over,
  };
}

/** KCP 결과조회(getCertData.do)가 돌려주는 응답을 흉내 낸다. */
function stubQuery(body: Record<string, string>, init: { resCd?: string; status?: number } = {}) {
  const { enc_data, rv } = encryptJson(body, ENC_KEY, SITE_CD);
  const fetchMock = vi.fn(async () => ({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    text: async () =>
      JSON.stringify({ res_cd: init.resCd ?? '0000', res_msg: 'x', enc_cert_data: enc_data, rv }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  db.sessions.clear();
  db.updates.length = 0;
  vi.stubEnv('KCP_SITE_CD', SITE_CD);
  vi.stubEnv('KCP_ENC_KEY', ENC_KEY);
  vi.stubEnv('KCP_API_BASE', 'https://testcert.kcp.co.kr');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('kcpProvider.verify', () => {
  it('AUTHED 세션이면 KCP 결과조회를 복호화해 정규화된 신원을 돌려준다', async () => {
    db.sessions.set(ORDR, session());
    const fetchMock = stubQuery(certBody());
    const result = await kcpProvider.verify({ identityVerificationId: ORDR });
    expect(result).toEqual({
      providerRef: REG_KEY,
      name: '홍길동',
      phone: '01099998800',
      birthDate: '1990-01-02',
      gender: 'FEMALE',
      ci: 'ci+value/==',
      di: 'di+value/==',
    });
    // 결과조회는 평문 JSON 본문 + site_cd 헤더로, 우리 DB 의 reg_cert_key·ordr_idxx 짝으로만 나간다.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://testcert.kcp.co.kr/api/query/getCertData.do');
    expect(JSON.parse(String(init.body))).toEqual({ reg_cert_key: REG_KEY, ordr_idxx: ORDR });
    expect((init.headers as Record<string, string>).site_cd).toBe(SITE_CD);
    expect(String(init.body)).not.toContain(ENC_KEY);
    // 거래는 소비 표시된다.
    expect(db.updates).toHaveLength(1);
  });

  it('클라이언트가 이름·번호를 함께 보내도 KCP 응답만 쓴다 (파라미터 변조 방어)', async () => {
    db.sessions.set(ORDR, session());
    stubQuery(certBody());
    const result = await kcpProvider.verify({
      identityVerificationId: ORDR,
      name: '변조된이름',
      phone: '01000000000',
    });
    expect(result.name).toBe('홍길동');
    expect(result.phone).toBe('01099998800');
  });

  it('identityVerificationId 가 없거나 규격 밖이면 KCP 를 부르지 않고 거부한다', async () => {
    const fetchMock = stubQuery(certBody());
    await expect(kcpProvider.verify({})).rejects.toThrow('본인인증 정보');
    await expect(kcpProvider.verify({ identityVerificationId: 'a b' })).rejects.toThrow('형식');
    await expect(kcpProvider.verify({ identityVerificationId: 'x'.repeat(51) })).rejects.toThrow('형식');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('모르는 거래는 거부한다 (남의 ordr_idxx 추측)', async () => {
    const fetchMock = stubQuery(certBody());
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('찾을 수 없습니다');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('이미 소비된 거래는 거부한다 (한 거래 = 토큰 한 건)', async () => {
    db.sessions.set(ORDR, session({ consumedAt: new Date() }));
    const fetchMock = stubQuery(certBody());
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('이미 사용된');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('만료된 거래는 거부한다 (과거 인증정보 재사용 차단)', async () => {
    db.sessions.set(ORDR, session({ expiresAt: new Date(Date.now() - 1_000) }));
    const fetchMock = stubQuery(certBody());
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('시간이 너무 지났습니다');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KCP 콜백이 성공으로 끝나지 않은 거래(REGISTERED/FAILED)는 거부한다', async () => {
    for (const status of ['REGISTERED', 'FAILED']) {
      db.sessions.set(ORDR, session({ status }));
      const fetchMock = stubQuery(certBody());
      await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow(
        '완료되지 않았습니다',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('KCP 결과조회가 0000 이 아니면 거부한다 (콜백 위조로는 통과 못 한다)', async () => {
    db.sessions.set(ORDR, session());
    stubQuery(certBody(), { resCd: 'CS24' });
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('KCP 결과조회 실패 [CS24]');
  });

  it('복호화 전문의 res_cd 가 0000 이 아니면 거부한다', async () => {
    db.sessions.set(ORDR, session());
    stubQuery(certBody({ res_cd: '9999', res_msg: '인증 실패' }));
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('KCP 본인확인 실패 [9999]');
  });

  it('HTTP 오류 응답은 삼키지 않고 던진다', async () => {
    db.sessions.set(ORDR, session());
    stubQuery(certBody(), { status: 500 });
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('KCP 500');
  });

  it('KCP 설정이 없으면 거부한다 (조용히 통과시키지 않는다)', async () => {
    vi.stubEnv('KCP_ENC_KEY', '');
    db.sessions.set(ORDR, session());
    stubQuery(certBody());
    await expect(kcpProvider.verify({ identityVerificationId: ORDR })).rejects.toThrow('KCP_ENC_KEY');
  });
});

describe('toIdentityResult', () => {
  it('CI_URL/DI_URL 이 없으면 원본 CI/DI 를 쓰고, 생년월일·성별 형식 밖은 비운다', () => {
    const r = toIdentityResult(
      { res_cd: '0000', user_name: '김철수', phone_no: '01011112222', birth_day: '900101', sex_code: '9', CI: 'c', DI: 'd' },
      REG_KEY,
    );
    expect(r).toEqual({
      providerRef: REG_KEY,
      name: '김철수',
      phone: '01011112222',
      birthDate: undefined,
      gender: undefined,
      ci: 'c',
      di: 'd',
    });
  });

  it('URL 인코딩본이 깨져 있으면 원본으로 물러난다', () => {
    const r = toIdentityResult({ res_cd: '0000', CI_URL: '%E0%A4%A', CI: 'plain-ci' }, REG_KEY);
    expect(r.ci).toBe('plain-ci');
  });
});

describe('session helpers', () => {
  it('newOrdrIdxx 는 KCP 규격(영숫자 50자 이하)이고 매번 다르다', () => {
    const a = newOrdrIdxx();
    const b = newOrdrIdxx();
    expect(a).toMatch(/^kc[a-z0-9]{38}$/);
    expect(a).not.toBe(b);
  });

  it('sanitizeReturnPath 는 앱 내부 경로만 통과시킨다 (오픈 리다이렉트 차단)', () => {
    expect(sanitizeReturnPath('/tech/signup')).toBe('/tech/signup');
    expect(sanitizeReturnPath('/tech/signup?x=1#h')).toBe('/tech/signup');
    expect(sanitizeReturnPath('//evil.example/phish')).toBe('/tech/signup');
    expect(sanitizeReturnPath('https://evil.example')).toBe('/tech/signup');
    expect(sanitizeReturnPath('/a b')).toBe('/tech/signup');
    expect(sanitizeReturnPath(undefined)).toBe('/tech/signup');
    expect(sanitizeReturnPath('/' + 'x'.repeat(300))).toBe('/tech/signup');
  });
});
