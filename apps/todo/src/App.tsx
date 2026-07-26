import { FormEvent, useMemo, useState } from 'react'

type Priority = 'high' | 'medium' | 'low'
type Filter = 'all' | 'open' | 'done'

interface TodoItem {
  id: string
  title: string
  memo: string
  priority: Priority
  done: boolean
  createdAt: string
}

const STORAGE_KEY = 'todo-today-items'
const PRIORITY_LABEL: Record<Priority, string> = {
  high: '중요',
  medium: '보통',
  low: '가벼움',
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function loadItems(): TodoItem[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${todayKey()}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveItems(items: TodoItem[]) {
  localStorage.setItem(`${STORAGE_KEY}:${todayKey()}`, JSON.stringify(items))
}

function App() {
  const [items, setItems] = useState<TodoItem[]>(loadItems)
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [filter, setFilter] = useState<Filter>('all')

  const doneCount = items.filter((item) => item.done).length
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0
  const filteredItems = useMemo(() => {
    if (filter === 'open') return items.filter((item) => !item.done)
    if (filter === 'done') return items.filter((item) => item.done)
    return items
  }, [filter, items])

  const updateItems = (next: TodoItem[]) => {
    setItems(next)
    saveItems(next)
  }

  const addTodo = (event: FormEvent) => {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return

    updateItems([
      {
        id: crypto.randomUUID(),
        title: cleanTitle,
        memo: memo.trim(),
        priority,
        done: false,
        createdAt: new Date().toISOString(),
      },
      ...items,
    ])
    setTitle('')
    setMemo('')
    setPriority('medium')
  }

  const toggleTodo = (id: string) => {
    updateItems(items.map((item) => item.id === id ? { ...item, done: !item.done } : item))
  }

  const deleteTodo = (id: string) => {
    updateItems(items.filter((item) => item.id !== id))
  }

  const clearDone = () => {
    updateItems(items.filter((item) => !item.done))
  }

  return (
    <main className="todo-app">
      <section className="hero">
        <a className="back-link" href="/">← 놀이터</a>
        <div>
          <span className="eyebrow">Today Todo</span>
          <h1>오늘 할 일을 정하고 끝냈는지 체크하세요</h1>
          <p>하루 단위로 저장됩니다. 내일 들어오면 새로운 오늘 목록으로 시작합니다.</p>
        </div>
        <div className="progress-panel">
          <strong>{progress}%</strong>
          <span>{doneCount}/{items.length} 완료</span>
          <div className="progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
        </div>
      </section>

      <section className="workspace">
        <form className="todo-form" onSubmit={addTodo}>
          <label>
            할 일
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: React Query 복습"
              maxLength={80}
            />
          </label>
          <label>
            메모
            <textarea
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              placeholder="시간, 범위, 참고할 내용"
              maxLength={180}
            />
          </label>
          <div className="priority-row">
            {(['high', 'medium', 'low'] as Priority[]).map((item) => (
              <button
                key={item}
                type="button"
                className={priority === item ? 'active' : ''}
                onClick={() => setPriority(item)}
              >
                {PRIORITY_LABEL[item]}
              </button>
            ))}
          </div>
          <button className="submit-button" type="submit">추가</button>
        </form>

        <section className="todo-list-panel">
          <div className="list-toolbar">
            <div className="tabs">
              {(['all', 'open', 'done'] as Filter[]).map((item) => (
                <button
                  key={item}
                  className={filter === item ? 'active' : ''}
                  onClick={() => setFilter(item)}
                >
                  {item === 'all' ? '전체' : item === 'open' ? '진행 중' : '완료'}
                </button>
              ))}
            </div>
            <button className="clear-button" onClick={clearDone} disabled={doneCount === 0}>완료 삭제</button>
          </div>

          {filteredItems.length === 0 ? (
            <div className="empty-state">
              <strong>아직 표시할 일이 없습니다</strong>
              <span>오늘 해야 할 일을 하나 추가해보세요.</span>
            </div>
          ) : (
            <ul className="todo-list">
              {filteredItems.map((item) => (
                <li key={item.id} className={item.done ? 'done' : ''}>
                  <button className="check-button" onClick={() => toggleTodo(item.id)} aria-label="완료 체크">
                    {item.done ? '✓' : ''}
                  </button>
                  <div>
                    <div className="item-title-row">
                      <strong>{item.title}</strong>
                      <span className={`priority ${item.priority}`}>{PRIORITY_LABEL[item.priority]}</span>
                    </div>
                    {item.memo && <p>{item.memo}</p>}
                  </div>
                  <button className="delete-button" onClick={() => deleteTodo(item.id)} aria-label="삭제">×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  )
}

export default App
