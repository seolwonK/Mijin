import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { mockProvider } from './mock';
import { portoneProvider } from './portone';
import { identityProviderName, IDENTITY_TTL_MS } from './config';
import { hashIdentityKey } from './hash';

// 휴대폰 본인인증(PASS 등 통신사 본인확인) provider 추상화.
// SMS(src/lib/sms) 와 동일하게 IDENTITY_PROVIDER 환경변수로 실서비스/개발용을 전환한다.
//   IDENTITY_PROVIDER=portone → 실제 PortOne(구 아임포트) 본인인증
//   그 외(미설정 포함)        → mock (개발용, 입력값을 그대로 신뢰)
// 브라우저 쪽 provider 도 같은 값을 /api/identity/config 로 받아 쓴다(config.ts).

// 대행사가 검증해 돌려준 신원 정보 (정규화 후)
export interface IdentityResult {
  providerRef?: string; // 대행사측 식별자 (PortOne identityVerificationId 등)
  name: string;
  phone: string; // 숫자만
  birthDate?: string; // "YYYY-MM-DD"
  gender?: string; // "MALE" | "FEMALE"
  ci?: string;
  di?: string;
}

// 클라이언트(브라우저)가 인증 완료 후 서버로 넘기는 값.
//  - portone: identityVerificationId (팝업 인증 결과 id)
//  - mock: name/phone (개발용으로 입력값을 그대로 인증 처리)
export interface IdentityVerifyInput {
  identityVerificationId?: string;
  name?: string;
  phone?: string;
}

export interface IdentityProvider {
  name: string;
  verify(input: IdentityVerifyInput): Promise<IdentityResult>;
}

function getProvider(): IdentityProvider {
  return identityProviderName() === 'portone' ? portoneProvider : mockProvider;
}

// 인증 결과를 검증·저장하고, 가입 요청에 동봉할 단기(10분) verificationId 를 발급한다.
// 실패 시 예외를 던진다 (SMS 와 달리 본인인증은 실패하면 가입을 막아야 하므로 삼키지 않는다).
export async function confirmIdentity(
  input: IdentityVerifyInput,
): Promise<{ verificationId: string; name: string; phone: string }> {
  const provider = getProvider();
  const result = await provider.verify(input);

  const phone = result.phone.replace(/\D/g, '');
  if (!/^0\d{8,10}$/.test(phone)) {
    throw new Error('인증된 휴대폰번호 형식이 올바르지 않습니다');
  }
  if (!result.name.trim()) {
    throw new Error('인증된 이름을 확인할 수 없습니다');
  }

  // 대행사 인증 1건당 토큰 1건. 유니크 제약(replayKey)이 진실이고, 동시 요청도 여기서 걸린다 —
  // 이게 없으면 같은 identityVerificationId 를 반복 제출해 토큰을 무제한 찍어낼 수 있고,
  // 가입 시점의 consumedAt CAS 는 "토큰 1건의 재사용"만 막으므로 그 구멍을 못 덮는다.
  const replayKey = result.providerRef ? `${provider.name}:${result.providerRef}` : null;

  let rec;
  try {
    rec = await prisma.identityVerification.create({
      data: {
        provider: provider.name,
        providerRef: result.providerRef ?? null,
        replayKey,
        name: result.name.trim(),
        phone,
        birthDate: result.birthDate ?? null,
        gender: result.gender ?? null,
        // 평문이 아니라 키 해시로만 남긴다 (hash.ts 주석 참조).
        ciHash: hashIdentityKey(result.ci),
        diHash: hashIdentityKey(result.di),
        expiresAt: new Date(Date.now() + IDENTITY_TTL_MS),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new Error('이미 사용된 본인인증입니다. 다시 인증해 주세요.');
    }
    throw e;
  }

  // 가입까지 가지 못한 인증건은 본인확인 이력으로서의 가치가 없는데 실명·휴대폰을 담고 있다.
  // 새 인증을 만들 때 함께 오래된 것을 걷어내, 보관 기간이 무한정 늘어나지 않게 한다.
  // (소비된 행 = 실제 가입 성사분은 본인확인 이력이므로 남긴다.)
  // 실패해도 가입 흐름을 막지 않는다 — 정리는 다음 인증 때 다시 시도된다.
  void purgeAbandonedVerifications().catch(() => undefined);

  return { verificationId: rec.id, name: rec.name, phone: rec.phone };
}

// 미소비 상태로 만료된 지 이 기간이 지난 인증건을 파기한다.
const ABANDONED_RETENTION_MS = 30 * 24 * 60 * 60_000; // 30일

export async function purgeAbandonedVerifications(): Promise<number> {
  const { count } = await prisma.identityVerification.deleteMany({
    where: {
      consumedAt: null,
      expiresAt: { lt: new Date(Date.now() - ABANDONED_RETENTION_MS) },
    },
  });
  return count;
}
