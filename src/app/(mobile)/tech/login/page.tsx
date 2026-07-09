import Link from 'next/link';
import LoginForm from '@/components/LoginForm';

export default function TechLoginPage() {
  return (
    <LoginForm
      title="개인기술자 로그인"
      footer={
        <p>
          아직 계정이 없나요?{' '}
          <Link href="/tech/signup" className="font-bold text-brand-600 underline">
            개인기술자 가입 신청
          </Link>
        </p>
      }
    />
  );
}
