import { FormEvent, useMemo, useState } from 'react'

type Category = 'study' | 'work' | 'break' | 'life'

interface ScheduleBlock {
  id: string
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

function todayKey() {
  return new Date().toISOString().slice(0, 10)
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

function loadBlocks(): ScheduleBlock[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${todayKey()}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveBlocks(blocks: ScheduleBlock[]) {
  localStorage.setItem(`${STORAGE_KEY}:${todayKey()}`, JSON.stringify(blocks))
}

function App() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>(loadBlocks)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')
  const [category, setCategory] = useState<Category>('study')

  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    [blocks],
  )
  const doneCount = blocks.filter((block) => block.done).length
  const totalMinutes = blocks.reduce((sum, block) => sum + Math.max(0, toMinutes(block.end) - toMinutes(block.start)), 0)
  const progress = blocks.length ? Math.round((doneCount / blocks.length) * 100) : 0

  const updateBlocks = (next: ScheduleBlock[]) => {
    setBlocks(next)
    saveBlocks(next)
  }

  const addBlock = (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || toMinutes(end) <= toMinutes(start)) return

    updateBlocks([
      ...blocks,
      {
        id: crypto.randomUUID(),
        title: cleanTitle,
        start,
        end,
        category,
        done: false,
      },
    ])
    setTitle('')
  }

  const toggleBlock = (id: string) => {
    updateBlocks(blocks.map((block) => block.id === id ? { ...block, done: !block.done } : block))
  }

  const deleteBlock = (id: string) => {
    updateBlocks(blocks.filter((block) => block.id !== id))
  }

  const addTemplate = () => {
    const template: ScheduleBlock[] = [
      { id: crypto.randomUUID(), title: '아침 정리', start: '08:30', end: '09:00', category: 'life', done: false },
      { id: crypto.randomUUID(), title: '핵심 공부 1', start: '09:00', end: '11:00', category: 'study', done: false },
      { id: crypto.randomUUID(), title: '짧은 휴식', start: '11:00', end: '11:20', category: 'break', done: false },
      { id: crypto.randomUUID(), title: '문제 풀이', start: '11:20', end: '12:30', category: 'study', done: false },
      { id: crypto.randomUUID(), title: '오후 작업', start: '14:00', end: '16:00', category: 'work', done: false },
    ]
    updateBlocks(template)
  }

  const clearDay = () => updateBlocks([])

  return (
    <main className="schedule-app">
      <header className="hero">
        <a href="/" className="back-link">← 놀이터</a>
        <div>
          <span>Day Schedule</span>
          <h1>하루 시간표를 정하고 그대로 실행하세요</h1>
          <p>오늘 날짜 기준으로 저장됩니다. 시간 블록을 쌓고 완료한 일은 바로 체크하세요.</p>
        </div>
        <section className="summary">
          <strong>{progress}%</strong>
          <small>{doneCount}/{blocks.length} 완료 · {Math.round(totalMinutes / 60 * 10) / 10}시간 계획</small>
          <div><i style={{ width: `${progress}%` }} /></div>
        </section>
      </header>

      <section className="layout">
        <form className="editor" onSubmit={addBlock}>
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
        </form>

        <section className="timeline-panel">
          <div className="panel-head">
            <h2>오늘 시간표</h2>
            <span>{todayKey()}</span>
          </div>

          {sortedBlocks.length === 0 ? (
            <div className="empty">
              <strong>아직 시간표가 없습니다</strong>
              <span>왼쪽에서 오늘 할 일을 시간별로 추가하세요.</span>
            </div>
          ) : (
            <ol className="timeline">
              {sortedBlocks.map((block) => (
                <li key={block.id} className={`block ${block.category} ${block.done ? 'done' : ''}`}>
                  <button className="check" onClick={() => toggleBlock(block.id)}>{block.done ? '✓' : ''}</button>
                  <time>
                    <strong>{block.start}</strong>
                    <span>{block.end}</span>
                  </time>
                  <div className="block-body">
                    <div>
                      <strong>{block.title}</strong>
                      <span>{CATEGORY_LABEL[block.category]} · {formatDuration(block.start, block.end)}</span>
                    </div>
                  </div>
                  <button className="delete" onClick={() => deleteBlock(block.id)} aria-label="삭제">×</button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
