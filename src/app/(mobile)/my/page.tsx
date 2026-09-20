import type { Metadata } from 'next';
import MyInspection from './my-inspection';

export const metadata: Metadata = {
  title: '내 정기 전기점검',
  robots: { index: false, follow: false },
};

export default function MyPage() {
  return <MyInspection />;
}
