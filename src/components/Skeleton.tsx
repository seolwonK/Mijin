// 로딩 중 자리표시용 스켈레톤. 데이터 도착 전 "없음/작성필요" 같은 거짓 상태가
// 깜빡이는 것을 막기 위해 사용한다. 순수 표시용이라 'use client' 불필요.

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-gray-200 motion-reduce:animate-none ${className}`}
    />
  );
}

// 목록 카드 자리표시 1개
export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-12" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

// 목록 그리드 자리표시 (홈·목록 공통 레이아웃과 동일한 그리드)
export function CardSkeletonGrid({ count = 2 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3"
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
