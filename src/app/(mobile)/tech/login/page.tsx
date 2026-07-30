import Link from 'next/link';
import LoginForm from '@/components/LoginForm';

export default function TechLoginPage() {
  return (
    <LoginForm
      title="전기기사 로그인"
      footer={
        <p>
          아직 계정이 없나요?{' '}
          <Link href="/tech/signup" className="font-bold text-brand-600 underline">
            전기기사 가입 신청
          </Link>
        </p>
      }
    />
  );
}
