// 앱 공통 버튼 프리미티브. 화면마다 제각각이던 버튼 스타일을 하나로 통일한다.
// 링크(Link)에는 buttonClasses() 헬퍼로 동일 스타일을 입힌다.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm enabled:hover:bg-blue-700 active:bg-blue-800',
  secondary:
    'border border-gray-300 bg-white text-gray-800 enabled:hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-gray-600 enabled:hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-red-600 text-white enabled:hover:bg-red-700 active:bg-red-800',
};

const SIZE: Record<Size, string> = {
  sm: 'h-10 px-4 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-6 text-lg',
};

export function buttonClasses(
  variant: Variant = 'primary',
  size: Size = 'md',
  extra = '',
) {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]} ${extra}`.trim();
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: {
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={buttonClasses(variant, size, className)} {...props} />;
}
