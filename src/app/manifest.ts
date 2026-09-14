import type { MetadataRoute } from 'next';
import { COMPANY } from '@/lib/company';

// /manifest.webmanifest — 홈 화면 추가·설치 배너용. 아이콘은 public/brand 의 정적 파일을 가리킨다
// (app/icon.png 파일 규약은 해시 쿼리가 붙은 경로로 서빙돼 매니페스트에서 참조하기 불안정하다).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${COMPANY.name} — 전기 고장 출동 접수`,
    short_name: COMPANY.name,
    description: '정전·누전·콘센트·조명 고장을 접수하면 가까운 출동 업체·전기기사를 연결합니다.',
    lang: 'ko',
    start_url: '/',
    display: 'standalone',
    background_color: '#f2f5ff',
    theme_color: '#f2f5ff',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
