// 관리자 테이블용 정렬 가능한 열 헤더. 클릭하면 오름/내림 토글.
export type SortState<K extends string> = { key: K; dir: 1 | -1 };

export function SortTh<K extends string>({
  label,
  col,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  col: K;
  sort: SortState<K>;
  onSort: (s: SortState<K>) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === col;
  return (
    <th className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : ''}`}>
      <button
        type="button"
        onClick={() => onSort({ key: col, dir: active && sort.dir === 1 ? -1 : 1 })}
        className="inline-flex items-center gap-1 transition-colors hover:text-slate-800"
        aria-label={`${label} 기준 정렬`}
      >
        {label}
        <span className="text-[10px] text-slate-400">
          {active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
