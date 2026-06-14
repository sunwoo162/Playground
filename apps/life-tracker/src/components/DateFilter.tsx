import { useState, useRef } from 'react';

export type FilterType = 'all' | 'today' | '1day' | '1week' | '1month' | '6months' | 'custom';

interface DateFilterProps {
  filter: FilterType;
  customDate: string;
  onFilterChange: (filter: FilterType) => void;
  onCustomDateChange: (date: string) => void;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'today', label: '오늘' },
  { key: '1day', label: '1일 전' },
  { key: '1week', label: '1주일' },
  { key: '1month', label: '1개월' },
  { key: '6months', label: '6개월' },
];

export function filterEntries<T extends { date: string }>(
  entries: T[],
  filter: FilterType,
  customDate: string
): T[] {
  if (filter === 'all') return entries;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  if (filter === 'today') {
    return entries.filter((e) => e.date === todayStr);
  }

  if (filter === 'custom') {
    if (!customDate) return entries;
    return entries.filter((e) => e.date === customDate);
  }

  // 1일 전, 1주일, 1개월, 6개월: 오늘 기준 해당 기간 전~오늘까지 모든 기록
  let sinceDate: string;
  switch (filter) {
    case '1day': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      sinceDate = d.toISOString().split('T')[0];
      break;
    }
    case '1week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      sinceDate = d.toISOString().split('T')[0];
      break;
    }
    case '1month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      sinceDate = d.toISOString().split('T')[0];
      break;
    }
    case '6months': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6);
      sinceDate = d.toISOString().split('T')[0];
      break;
    }
    default:
      return entries;
  }

  return entries.filter((e) => e.date >= sinceDate && e.date <= todayStr);
}

export function DateFilter({ filter, customDate, onFilterChange, onCustomDateChange }: DateFilterProps) {
  const [inputValue, setInputValue] = useState(customDate);
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (value: string) => {
    setInputValue(value);
    // YYYY-MM-DD 형식 완성 시 필터 적용
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      onCustomDateChange(value);
      onFilterChange('custom');
    }
  };

  const handleCalendarClick = () => {
    hiddenDateRef.current?.showPicker?.();
  };

  const handleHiddenDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onCustomDateChange(val);
    onFilterChange('custom');
  };

  return (
    <div className="date-filter">
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filter-chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => onFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="date-custom-row">
        <input
          type="text"
          className={`date-text-input ${filter === 'custom' ? 'active' : ''}`}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="날짜 입력 (YYYY-MM-DD)"
          maxLength={10}
        />
        <input
          ref={hiddenDateRef}
          type="date"
          className="hidden-date-input"
          value={customDate}
          onChange={handleHiddenDateChange}
          tabIndex={-1}
        />
        <button
          type="button"
          className={`calendar-btn ${filter === 'custom' ? 'active' : ''}`}
          onClick={handleCalendarClick}
          aria-label="달력 열기"
        >
          📅
        </button>
      </div>
    </div>
  );
}
