// 대한민국 행정구역 (시/도 → 시/군/구) — 업체 소재지 선택용.
// 세종특별자치시는 하위 시/군/구가 없다.
export const REGIONS: Record<string, string[]> = {
  서울특별시: [
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
    '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
  ],
  부산광역시: [
    '강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구',
    '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구',
  ],
  대구광역시: ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
  인천광역시: [
    '강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구',
  ],
  광주광역시: ['광산구', '남구', '동구', '북구', '서구'],
  대전광역시: ['대덕구', '동구', '서구', '유성구', '중구'],
  울산광역시: ['남구', '동구', '북구', '울주군', '중구'],
  세종특별자치시: [],
  경기도: [
    '가평군', '고양시', '과천시', '광명시', '광주시', '구리시', '군포시', '김포시',
    '남양주시', '동두천시', '부천시', '성남시', '수원시', '시흥시', '안산시', '안성시',
    '안양시', '양주시', '양평군', '여주시', '연천군', '오산시', '용인시', '의왕시',
    '의정부시', '이천시', '파주시', '평택시', '포천시', '하남시', '화성시',
  ],
  강원특별자치도: [
    '강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군',
    '원주시', '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군',
    '화천군', '횡성군',
  ],
  충청북도: [
    '괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군',
    '진천군', '청주시', '충주시',
  ],
  충청남도: [
    '계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시',
    '서천군', '아산시', '예산군', '천안시', '청양군', '태안군', '홍성군',
  ],
  전북특별자치도: [
    '고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군',
    '익산시', '임실군', '장수군', '전주시', '정읍시', '진안군',
  ],
  전라남도: [
    '강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시',
    '무안군', '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군',
    '장성군', '장흥군', '진도군', '함평군', '해남군', '화순군',
  ],
  경상북도: [
    '경산시', '경주시', '고령군', '구미시', '김천시', '문경시', '봉화군', '상주시',
    '성주군', '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군',
    '울진군', '의성군', '청도군', '청송군', '칠곡군', '포항시',
  ],
  경상남도: [
    '거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군',
    '양산시', '의령군', '진주시', '창녕군', '창원시', '통영시', '하동군', '함안군',
    '함양군', '합천군',
  ],
  제주특별자치도: ['서귀포시', '제주시'],
};

// 해당 시/도에 시/군/구 선택이 필요한지 (세종은 불필요)
export function hasSigungu(sido: string): boolean {
  return (REGIONS[sido]?.length ?? 0) > 0;
}

// ── 커버 지역(서비스 가능 지역) 키 ──────────────────────────────────────
// 업체/기술자가 여러 지역을 선택해 저장할 때 쓰는 문자열 키.
//   "서울특별시 강남구" = 특정 시/군/구,  "서울특별시" = 해당 시/도 전체.
// 시/도·시/군/구 모두 공백을 포함하지 않으므로 첫 공백으로 안전하게 분리된다.

export function regionKey(sido: string, sigungu: string): string {
  return sigungu ? `${sido} ${sigungu}` : sido;
}

export function parseRegionKey(key: string): { sido: string; sigungu: string } {
  const i = key.indexOf(' ');
  return i === -1
    ? { sido: key, sigungu: '' }
    : { sido: key.slice(0, i), sigungu: key.slice(i + 1) };
}

// 키가 실제 존재하는 시/도(전체) 또는 시/도+시/군/구인지 검증
export function isValidRegionKey(key: string): boolean {
  const { sido, sigungu } = parseRegionKey(key);
  const list = REGIONS[sido];
  if (!list) return false;
  return sigungu === '' || list.includes(sigungu);
}

// 화면 표시용 라벨 (시/도 전체는 "… 전체")
export function regionLabel(key: string): string {
  const { sido, sigungu } = parseRegionKey(key);
  if (sigungu) return `${sido} ${sigungu}`;
  return hasSigungu(sido) ? `${sido} 전체` : sido;
}

// 입력 배열에서 유효한 키만 남기고 중복 제거 (최대 개수 제한)
export function sanitizeRegionKeys(input: unknown, max = 50): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    const key = v.trim();
    if (key && isValidRegionKey(key) && !out.includes(key)) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

// 주소 문자열에서 시/도·시/군/구를 판별. 카카오 역지오코딩 주소는 풀네임
// ("서울특별시 강남구 …")이라 풀 시/도명이 포함된 지역으로 한정해 시/군/구를 찾는다.
// 판별 불가 시 null (호출부는 지역 필터를 적용하지 않고 거리만으로 처리).
export function regionFromAddress(
  address: string | null | undefined,
): { sido: string; sigungu: string } | null {
  if (!address) return null;
  for (const [sido, sigungus] of Object.entries(REGIONS)) {
    if (!address.includes(sido)) continue;
    for (const g of sigungus) {
      if (address.includes(g)) return { sido, sigungu: g };
    }
    return { sido, sigungu: '' }; // 시/도만 확인됨
  }
  return null;
}

// 커버 지역 목록이 특정 요청 지역을 포함하는지.
//   - 빈 목록      = 전 지역 담당 (하위호환)
//   - 지역 판별불가 = 필터 불가 → 담당으로 간주 (배차를 막지 않음)
//   - "시/도"      = 그 시/도의 모든 시/군/구 담당
//   - "시/도 구"   = 해당 시/군/구만 담당
export function coversRegion(
  regions: string[],
  reqRegion: { sido: string; sigungu: string } | null,
): boolean {
  if (regions.length === 0) return true;
  if (!reqRegion) return true;
  if (regions.includes(reqRegion.sido)) return true;
  if (reqRegion.sigungu && regions.includes(`${reqRegion.sido} ${reqRegion.sigungu}`))
    return true;
  return false;
}
