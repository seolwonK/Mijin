import Link from 'next/link';
export default function PortalSupportLink({
  children = '도움 및 문의',
  className = '',
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/support"
      className={`inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-brand-700 underline underline-offset-4 ${className}`}
    >
      {children}
    </Link>
  );
}
