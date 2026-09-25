import Link from 'next/link';
import LoginForm from '@/components/LoginForm';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '전기점검 고객 로그인',
  robots: { index: false, follow: false },
};

export default function CustomerLoginPage() {
  return (
    <LoginForm
      title="전기점검 로그인"
      footer={
        <p>
          아직 신청하지 않으셨나요?{' '}
          <Link href="/inspection" className="font-bold text-brand-600 underline">
            정기 전기점검 안내 보기
          </Link>
        </p>
      }
    />
  );
}
