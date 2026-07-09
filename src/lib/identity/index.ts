import { prisma } from '@/lib/db';
import { mockProvider } from './mock';
import { portoneProvider } from './portone';

// 휴대폰 본인인증(PASS 등 통신사 본인확인) provider 추상화.
// SMS(src/lib/sms) 와 동일하게 IDENTITY_PROVIDER 환경변수로 실서비스/개발용을 전환한다.
//   IDENTITY_PROVIDER=portone → 실제 PortOne(구 아임포트) 본인인증
//   그 외(미설정 포함)        → mock (개발용, 입력값을 그대로 신뢰)

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
  return process.env.IDENTITY_PROVIDER === 'portone' ? portoneProvider : mockProvider;
}

// 인증 결과를 검증·저장하고, 가입 요청에 동봉할 단기(10분) verificationId 를 발급한다.
// 실패 시 예외를 던진다 (SMS 와 달리 본인인증은 실패하면 가입을 막아야 하므로 삼키지 않는다).
const VERIFICATION_TTL_MS = 10 * 60_000;

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

  const rec = await prisma.identityVerification.create({
    data: {
      provider: provider.name,
      providerRef: result.providerRef ?? null,
      name: result.name.trim(),
      phone,
      birthDate: result.birthDate ?? null,
      gender: result.gender ?? null,
      ci: result.ci ?? null,
      di: result.di ?? null,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });

  return { verificationId: rec.id, name: rec.name, phone: rec.phone };
}
