import { Fragment, FormEvent, useMemo, useState } from 'react'

type Category = 'study' | 'work' | 'break' | 'life'
type ViewMode = 'day' | 'week'

interface ScheduleBlock {
  id: string
  date: string
  title: string
  start: string
  end: string
  category: Category
  done: boolean
}

const STORAGE_KEY = 'day-schedule'
const CATEGORY_LABEL: Record<Category, string> = {
  study: '공부',
  work: '작업',
  break: '휴식',
  life: '생활',
}
const HOURS = Array.from({ length: 17 }, (_, index) => index + 6)
const WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function getMonday(date = new Date()) {
  const copy = new Date(date)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  return copy
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function weekDays(selectedDate: string) {
  const monday = getMonday(new Date(`${selectedDate}T00:00:00`))
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return { key: dateKey(date), label: WEEK_LABELS[index], day: date.getDate() }
  })
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function formatDuration(start: string, end: string) {
  const minutes = Math.max(0, toMinutes(end) - toMinutes(start))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}시간 ${m}분`
  if (h) return `${h}시간`
  return `${m}분`
}

function normalizeBlocks(value: unknown): ScheduleBlock[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const block = item as Partial<ScheduleBlock>
      return {
        id: block.id || crypto.randomUUID(),
        date: block.date || todayKey(),
        title: block.title || '',
        start: block.start || '09:00',
        end: block.end || '10:00',
        category: block.category || 'study',
        done: Boolean(block.done),
      }
    })
    .filter((item) => item.title)
}

function loadBlocks(): ScheduleBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeBlocks(JSON.parse(raw))

    const legacyRaw = localStorage.getItem(`${STORAGE_KEY}:${todayKey()}`)
    return legacyRaw ? normalizeBlocks(JSON.parse(legacyRaw)) : []
  } catch {
    return []
  }
}

function saveBlocks(blocks: ScheduleBlock[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks))
}

function hasOverlap(blocks: ScheduleBlock[], date: string, start: string, end: string) {
  const nextStart = toMinutes(start)
  const nextEnd = toMinutes(end)
  return blocks.some((block) => {
    if (block.date !== date) return false
    return nextStart < toMinutes(block.end) && nextEnd > toMinutes(block.start)
  })
}

function App() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(loadBlocks)
  const [selectedDate, setSelectedDate] = useState(todayKey())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [category, setCategory] = useState<Category>('study')
  const [error, setError] = useState('')

  const days = useMemo(() => weekDays(selectedDate), [selectedDate])
  const dayBlocks = blocks.filter((block) => block.date === selectedDate)
  const sortedBlocks = useMemo(
    () => [...dayBlocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [dayBlocks],
  )
  const doneCount = dayBlocks.filter((block) => block.done).length
  const totalMinutes = dayBlocks.reduce((sum, block) => sum + Math.max(0, toMinutes(block.end) - toMinutes(block.start)), 0)
  const progress = dayBlocks.length ? Math.round((doneCount / dayBlocks.length) * 100) : 0

  const updateBlocks = (next: ScheduleBlock[]) => {
    setBlocks(next)
    saveBlocks(next)
  }

  const addBlock = (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    if (toMinutes(end) <= toMinutes(start)) {
      setError('종료 시간은 시작 시간보다 늦어야 합니다.')
      return
    }
    if (hasOverlap(blocks, selectedDate, start, end)) {
      setError('같은 시간에 이미 일정이 있습니다.')
      return
    }

    updateBlocks([
      ...blocks,
      {
        id: crypto.randomUUID(),
        date: selectedDate,
        title: cleanTitle,
        start,
        end,
        category,
        done: false,
      },
    ])
    setTitle('')
    setError('')
  }

  const toggleBlock = (id: string) => {
    updateBlocks(blocks.map((block) => block.id === id ? { ...block, done: !block.done } : block))
  }

  const deleteBlock = (id: string) => {
    updateBlocks(blocks.filter((block) => block.id !== id))
  }

  const addTemplate = () => {
    const template: ScheduleBlock[] = [
      { id: crypto.randomUUID(), date: selectedDate, title: '아침 정리', start: '08:30', end: '09:00', category: 'life', done: false },
      { id: crypto.randomUUID(), date: selectedDate, title: '핵심 공부 1', start: '09:00', end: '11:00', category: 'study', done: false },
      { id: crypto.randomUUID(), date: selectedDate, title: '짧은 휴식', start: '11:00', end: '11:20', category: 'break', done: false },
      { id: crypto.randomUUID(), date: selectedDate, title: '문제 풀이', start: '11:20', end: '12:30', category: 'study', done: false },
      { id: crypto.randomUUID(), date: selectedDate, title: '오후 작업', start: '14:00', end: '16:00', category: 'work', done: false },
    ]
    updateBlocks([...blocks.filter((block) => block.date !== selectedDate), ...template])
  }

  const clearDay = () => updateBlocks(blocks.filter((block) => block.date !== selectedDate))

  return (
    <main className="schedule-app">
      <header className="hero">
        <a href="/" className="back-link">← 놀이터</a>
        <div>
          <span>Day Schedule</span>
          <h1>하루와 일주일을 정석 시간표로 계획하세요</h1>
          <p>같은 시간 중복은 막고, 오늘은 시간축으로, 일주일은 요일별 시간표로 확인합니다.</p>
        </div>
        <section className="summary">
          <strong>{progress}%</strong>
          <small>{doneCount}/{dayBlocks.length} 완료 · {Math.round(totalMinutes / 60 * 10) / 10}시간 계획</small>
          <div><i style={{ width: `${progress}%` }} /></div>
        </section>
      </header>

      <section className="layout">
        <form className="editor" onSubmit={addBlock}>
          <label>
            날짜
            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
          </label>
          <label>
            일정 이름
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: React 강의 듣기" />
          </label>
          <div className="time-row">
            <label>
              시작
              <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              종료
              <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
          <div className="category-row">
            {(['study', 'work', 'break', 'life'] as Category[]).map((item) => (
              <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                {CATEGORY_LABEL[item]}
              </button>
            ))}
          </div>
          <button className="primary-button" type="submit">시간표에 추가</button>
          <button className="ghost-button" type="button" onClick={addTemplate}>기본 공부 루틴 넣기</button>
          <button className="danger-button" type="button" onClick={clearDay}>오늘 시간표 비우기</button>
          {error && <p className="form-error">{error}</p>}
        </form>

        <section className="timeline-panel">
          <div className="panel-head">
            <div>
              <h2>{viewMode === 'day' ? '하루 시간표' : '일주일 시간표'}</h2>
              <span>{viewMode === 'day' ? selectedDate : `${days[0].key} ~ ${days[6].key}`}</span>
            </div>
            <div className="view-tabs">
              <button className={viewMode === 'day' ? 'active' : ''} onClick={() => setViewMode('day')}>하루</button>
              <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>일주일</button>
            </div>
          </div>

          {viewMode === 'day' && sortedBlocks.length === 0 ? (
            <div className="empty">
              <strong>아직 시간표가 없습니다</strong>
              <span>왼쪽에서 오늘 할 일을 시간별로 추가하세요.</span>
            </div>
          ) : viewMode === 'day' ? (
            <div className="day-grid">
              {HOURS.map((hour) => <div key={hour} className="hour-line" style={{ top: `${(hour - 6) * 72}px` }}>{String(hour).padStart(2, '0')}:00</div>)}
              {sortedBlocks.map((block) => (
                <article
                  key={block.id}
                  className={`schedule-card ${block.category} ${block.done ? 'done' : ''}`}
                  style={{
                    top: `${((toMinutes(block.start) - 360) / 60) * 72}px`,
                    height: `${Math.max(46, ((toMinutes(block.end) - toMinutes(block.start)) / 60) * 72 - 8)}px`,
                  }}
                >
                  <button className="check" onClick={() => toggleBlock(block.id)}>{block.done ? '✓' : ''}</button>
                  <div>
                    <strong>{block.title}</strong>
                    <span>{block.start}~{block.end} · {CATEGORY_LABEL[block.category]}</span>
                  </div>
                  <button className="delete" onClick={() => deleteBlock(block.id)} aria-label="삭제">×</button>
                </article>
              ))}
            </div>
          ) : (
            <div className="week-grid">
              <div className="week-corner" />
              {days.map((day) => (
                <button
                  key={day.key}
                  className={`week-day ${selectedDate === day.key ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedDate(day.key)
                    setViewMode('day')
                  }}
                >
                  <strong>{day.label}</strong>
                  <span>{day.day}</span>
                </button>
              ))}
              {HOURS.map((hour) => (
                <Fragment key={hour}>
                  <div key={`label-${hour}`} className="week-hour">{String(hour).padStart(2, '0')}:00</div>
                  {days.map((day) => {
                    const cellBlocks = blocks.filter((block) => block.date === day.key && toMinutes(block.start) >= hour * 60 && toMinutes(block.start) < (hour + 1) * 60)
                    return (
                      <div key={`${day.key}-${hour}`} className="week-cell">
                        {cellBlocks.map((block) => (
                          <button key={block.id} className={`week-block ${block.category} ${block.done ? 'done' : ''}`} onClick={() => toggleBlock(block.id)}>
                            <strong>{block.title}</strong>
                            <span>{block.start}~{block.end}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
