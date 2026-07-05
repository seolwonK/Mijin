// 사업자등록번호 형식·검증번호(체크섬) 확인. 국세청 진위확인 API 연동 전의 1차 검증.
export function normalizeBizRegNo(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidBizRegNo(input: string): boolean {
  const d = normalizeBizRegNo(input);
  if (!/^\d{10}$/.test(d)) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * weights[i];
  sum += Math.floor((Number(d[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}
