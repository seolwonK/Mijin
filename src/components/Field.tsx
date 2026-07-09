// 폼 입력의 지속 라벨 래퍼. placeholder만으로는 값 입력 시 라벨이 사라지고
// 스크린리더 연결이 약해지는 문제를 해결한다. children 으로 input/select 를 받는다.
// 접근성을 위해 children 입력의 id 와 htmlFor 를 반드시 맞춰 준다.
export function Field({
  label,
  htmlFor,
  required = false,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1 block text-xs font-medium text-muted"
      >
        {label}
        {required && (
          <span className="text-red-500">
            {' '}
            *<span className="sr-only"> 필수</span>
          </span>
        )}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
