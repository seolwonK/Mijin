import Link from 'next/link';
import LoginForm from '@/components/LoginForm';

export default function PartnerLoginPage() {
  return (
    <LoginForm
      title="업체 로그인"
      footer={
        <p>
          아직 계정이 없나요?{' '}
          <Link href="/partner/signup" className="font-bold text-blue-600 underline">
            업체 가입 신청
          </Link>
        </p>
      }
    />
  );
}
