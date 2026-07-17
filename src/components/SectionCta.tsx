import Link from 'next/link';
import { buttonClasses } from '@/components/Button';
import { BoltIcon } from '@/components/icons';

// 롱폼 섹션(프로세스·범위·신뢰·최종CTA) 끝에 반복 배치하는 인라인 접수 유도 블록.
// position:fixed/sticky 아님 — 하단 고정은 FloatingDock이 전담.
export default function SectionCta({
  label = '고장 접수하기',
  className = '',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href="/request/new"
      className={`${buttonClasses('primary', 'md', 'w-full md:w-auto')} ${className}`.trim()}
    >
      <BoltIcon className="h-4 w-4" />
      {label}
    </Link>
  );
}
