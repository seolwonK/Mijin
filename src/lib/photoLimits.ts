/**
 * 접수 사진의 한계값. **서버 의존성이 없는 모듈**이라 클라이언트 컴포넌트에서도 그대로
 * 가져다 쓸 수 있다 — src/lib/photos.ts 는 prisma·crypto 를 import 하므로 접수 화면
 * (PhotoInput.tsx)이 그쪽을 참조하면 서버 코드가 클라이언트 번들로 끌려온다.
 * 두 곳에 같은 숫자를 적어두면 언젠가 갈라지므로 여기 하나만 둔다.
 */

export const MAX_PHOTOS = 5;

/** 장당 업로드 상한. 클라이언트가 리사이즈해 보내므로 넉넉하게 잡는다. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * 허용 포맷은 셋뿐이다. HEIC 은 일부러 뺀다 — 아이폰 원본 포맷이지만 관리자·업체가 쓰는
 * 데스크톱 크롬에서 렌더되지 않아, 받아둬도 정작 봐야 할 사람이 못 본다. 클라이언트가
 * 업로드 전에 JPEG 으로 변환하고(PhotoInput.tsx), 변환에 실패하면 그 자리에서 안내한다.
 */
export const SUPPORTED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
