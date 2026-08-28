import { createHmac } from 'node:crypto';

// CI(연계정보)·DI(중복가입확인정보)는 개인을 영구적으로 식별하는 값이다. 우리가 이 값으로
// 하려는 일은 "같은 사람인가"를 비교하는 것 하나뿐이므로, 원본을 되돌릴 수 있는 형태로
// 보관할 이유가 없다. 그래서 저장은 키 해시(HMAC-SHA256)로만 한다 — 동등 비교는 그대로
// 되고, DB 가 통째로 새도 CI 원본이나 타 서비스와의 연계 식별자는 복원되지 않는다.
//
// 평문 SHA-256 이 아니라 HMAC 인 이유: CI 는 88자 base64 라는 정해진 규격이라 후보를
// 가진 공격자가 해시를 그대로 대조할 수 있다. 서버 비밀키가 섞여 있으면 그 대조가 막힌다.
//
// ⚠️ 키를 바꾸면 이전에 저장된 해시와 새 해시가 달라져 "같은 사람" 판정이 끊긴다.
//    IDENTITY_HASH_SECRET 은 한 번 정하면 고정한다(미설정 시 AUTH_SECRET 을 쓴다).

function identityHashSecret(): string {
  const secret =
    process.env.IDENTITY_HASH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'CI/DI 해시 키가 없습니다: IDENTITY_HASH_SECRET 또는 AUTH_SECRET 환경변수가 필요합니다',
    );
  }
  return secret;
}

/** CI/DI 를 저장용 해시로 바꾼다. 값이 없으면(대행사가 제공하지 않는 채널) null. */
export function hashIdentityKey(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return createHmac('sha256', identityHashSecret()).update(v).digest('hex');
}
