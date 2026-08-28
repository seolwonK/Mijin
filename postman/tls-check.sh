#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 본인확인 자체점검 7번 — 안전한 통신 프로토콜.
#
# Postman 은 TLS 프로토콜 버전을 단언할 수 없다(OS 가 협상한 결과만 쓴다).
# 그래서 버전별 핸드셰이크를 직접 시도하는 이 스크립트가 7번의 실측을 담당하고,
# 컬렉션은 헤더·리다이렉트만 본다.
#
#   ./postman/tls-check.sh                        # 운영 도메인
#   ./postman/tls-check.sh example.com            # 다른 호스트
#
# 종료코드 0 = 전 항목 통과, 1 = 하나라도 실패.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

HOST="${1:-xn--ok0bp94bnc26kra.com}"
FAIL=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

command -v openssl >/dev/null || { echo "openssl 이 필요합니다"; exit 1; }
command -v curl    >/dev/null || { echo "curl 이 필요합니다";    exit 1; }

printf '\033[1m본인확인 통신 점검 — %s\033[0m\n' "$HOST"

# ── ① 프로토콜 버전 ──────────────────────────────────────────────────────────
# 구버전은 거부돼야 하고 1.2/1.3 은 수락돼야 한다. openssl 빌드에 따라 -tls1/-tls1_1
# 옵션 자체가 없을 수 있는데, 그 경우 "시도 불가"로 표시하고 실패로 세지 않는다.
section "① TLS 프로토콜 버전"

probe() { # $1=플래그  →  0:수락  1:거부  2:시도 불가
  local out
  out=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" "-$1" 2>&1)
  if grep -qi "unknown option\|unrecognized" <<<"$out"; then return 2; fi
  if grep -q "Cipher    :" <<<"$out" && ! grep -q "Cipher is (NONE)" <<<"$out"; then return 0; fi
  return 1
}

for old in tls1 tls1_1; do
  probe "$old"
  case $? in
    0) fail "$old 가 수락된다 — 1.2 미만은 거부해야 한다" ;;
    1) pass "$old 거부됨" ;;
    2) printf '  \033[33m-\033[0m %s (이 openssl 빌드에서 시도 불가)\n' "$old" ;;
  esac
done

for new in tls1_2 tls1_3; do
  if probe "$new"; then
    cipher=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" "-$new" 2>&1 \
             | sed -n 's/.*Cipher    : //p' | head -1)
    pass "$new 수락됨 ($cipher)"
  else
    # 1.3 미지원 자체는 결격이 아니다. 1.2 가 없으면 결격이다.
    if [ "$new" = "tls1_2" ]; then fail "$new 가 수락되지 않는다"; else
      printf '  \033[33m-\033[0m %s 미지원 (1.2 가 있으면 요건 충족)\n' "$new"
    fi
  fi
done

# ── ② 인증서 ────────────────────────────────────────────────────────────────
section "② 인증서"
CERT=$(echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
       | openssl x509 -noout -subject -issuer -dates 2>/dev/null)
if [ -n "$CERT" ]; then
  END=$(sed -n 's/^notAfter=//p' <<<"$CERT")
  if echo | openssl s_client -connect "$HOST:443" -servername "$HOST" 2>/dev/null \
     | openssl x509 -noout -checkend 1209600 >/dev/null 2>&1; then
    pass "만료까지 14일 이상 남음 (notAfter=$END)"
  else
    fail "14일 안에 만료된다 (notAfter=$END)"
  fi
  sed 's/^/    /' <<<"$CERT"
else
  fail "인증서를 읽지 못했다"
fi

# ── ③ 평문 HTTP 강제 리다이렉트 ─────────────────────────────────────────────
section "③ 평문 HTTP → HTTPS"
REDIR=$(curl -sS -o /dev/null -D - --max-time 20 "http://$HOST/" 2>/dev/null)
CODE=$(sed -n '1s/.* \([0-9]\{3\}\) .*/\1/p' <<<"$REDIR" | head -1)
LOC=$(grep -i '^location:' <<<"$REDIR" | tr -d '\r' | sed 's/^[Ll]ocation: *//' | head -1)
case "$CODE" in
  301|302|307|308) [[ "$LOC" == https://* ]] \
      && pass "$CODE → $LOC" \
      || fail "$CODE 이지만 https 로 가지 않는다 ($LOC)" ;;
  *) fail "리다이렉트되지 않는다 (HTTP $CODE)" ;;
esac

# ── ④ 보안 응답 헤더 ────────────────────────────────────────────────────────
# 컬렉션의 전역 검사와 같은 내용이다. 서버 앞단(CDN·프록시)이 헤더를 지우는 경우가 있어
# 브라우저가 실제로 받는 값을 여기서 한 번 더 본다.
section "④ 보안 응답 헤더 (https://$HOST/tech/signup)"
H=$(curl -sSI --max-time 20 "https://$HOST/tech/signup" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z')

hsts=$(sed -n 's/^strict-transport-security: *//p' <<<"$H" | head -1)
age=$(sed -n 's/.*max-age=\([0-9]*\).*/\1/p' <<<"$hsts" | head -1)
if [ -n "${age:-}" ] && [ "$age" -ge 31536000 ]; then
  pass "strict-transport-security: $hsts"
else
  fail "HSTS max-age 가 1년 미만이거나 없다 (${hsts:-없음})"
fi

check_header() { # $1=헤더명 $2=기대 부분문자열
  local got
  got=$(sed -n "s/^$1: *//p" <<<"$H" | head -1)
  [[ "$got" == *"$2"* ]] && pass "$1: $got" || fail "$1 이 기대와 다르다 (${got:-없음}, 기대: *$2*)"
}
check_header "x-content-type-options" "nosniff"
check_header "x-frame-options"        "sameorigin"
check_header "referrer-policy"        "strict-origin-when-cross-origin"
check_header "permissions-policy"     "payment=()"

# ── ⑤ 대행사 방향 통신 ──────────────────────────────────────────────────────
section "⑤ 서버 → 대행사(PortOne) 통신"
if probe_out=$(echo | openssl s_client -connect api.portone.io:443 -servername api.portone.io -tls1_2 2>&1) \
   && grep -q "Cipher    :" <<<"$probe_out"; then
  pass "api.portone.io 가 TLS 1.2 이상을 지원한다"
else
  fail "api.portone.io TLS 1.2 핸드셰이크 실패"
fi

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32m전 항목 통과\033[0m — 자체점검 7번 충족\n'
else
  printf '\033[31m실패 항목이 있습니다\033[0m — 위 ✗ 를 확인하세요\n'
fi
exit "$FAIL"
