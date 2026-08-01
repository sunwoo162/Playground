import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type BuiltInCategory = {
  id: string
  label: string
  color: string
  terms: string[]
}

type SpinResult = {
  left: string
  center: string
  right: string
  final: string
  description: string
}

const TIMER_DURATION_MS = 15 * 60 * 1000
const SEEN_TERMS_KEY_PREFIX = 'dev-term-roulette-seen'

const CATEGORIES: BuiltInCategory[] = [
  {
    id: 'frontend',
    label: '프론트엔드',
    color: '#34d399',
    terms: [
      'DOM', 'Virtual DOM', 'Hydration', 'Reconciliation', 'Component', 'Props', 'State', 'Hook', 'Context', 'Portal',
      'Event Delegation', 'Synthetic Event', 'Controlled Component', 'Uncontrolled Component', 'Memoization', 'Lazy Loading',
      'Code Splitting', 'Tree Shaking', 'Bundle', 'Chunk', 'Source Map', 'CSS Module', 'CSS-in-JS', 'Responsive Design',
      'Accessibility', 'ARIA', 'Focus Trap', 'Tab Order', 'Semantic HTML', 'Form Validation', 'Debounce', 'Throttle',
      'Intersection Observer', 'Mutation Observer', 'Service Worker', 'Web Worker', 'PWA', 'SPA', 'SSR', 'SSG', 'ISR',
      'Routing', 'Nested Route', 'Client Cache', 'Optimistic UI', 'Skeleton UI', 'Toast', 'Modal', 'Tooltip', 'Popover',
      'Design Token', 'Breakpoint', 'Media Query', 'Container Query', 'Flexbox', 'Grid Layout', 'Z-index', 'Stacking Context',
      'Specificity', 'Cascade Layer', 'CSS Variable', 'Animation Frame', 'Transition', 'Keyframe', 'Canvas', 'WebGL',
      'WebSocket UI', 'Drag and Drop', 'Clipboard API', 'Web Storage', 'IndexedDB', 'Fetch API', 'AbortController',
      'Error Boundary', 'Suspense', 'Concurrent Rendering', 'Server Component'
    ],
  },
  {
    id: 'backend',
    label: '백엔드',
    color: '#60a5fa',
    terms: [
      'API', 'REST', 'GraphQL', 'gRPC', 'Endpoint', 'Middleware', 'Controller', 'Service Layer', 'Repository Pattern',
      'DTO', 'DAO', 'ORM', 'Migration', 'Seed Data', 'Connection Pool', 'Transaction', 'Isolation Level', 'Deadlock',
      'Index', 'Query Plan', 'N+1 Query', 'Pagination', 'Cursor Pagination', 'Rate Limiting', 'Idempotency',
      'Authentication', 'Authorization', 'Session', 'JWT', 'OAuth', 'Refresh Token', 'CSRF', 'CORS', 'Input Sanitization',
      'Validation', 'Serialization', 'Deserialization', 'Message Queue', 'Pub/Sub', 'Event Sourcing', 'CQRS', 'Webhook',
      'Cron Job', 'Scheduler', 'Background Job', 'Worker', 'Cache', 'Redis', 'TTL', 'Cache Invalidation', 'CDN',
      'Reverse Proxy', 'Load Balancer', 'Health Check', 'Circuit Breaker', 'Retry Policy', 'Backoff', 'Timeout',
      'Logging', 'Tracing', 'Metric', 'APM', 'OpenTelemetry', 'SLA', 'SLO', 'Error Budget', 'Blue-Green Deploy',
      'Canary Deploy', 'Feature Flag', 'Configuration', 'Secret Management', 'Environment Variable', 'Container',
      'Docker Image', 'Kubernetes Pod', 'Ingress', 'Horizontal Scaling', 'Vertical Scaling', 'Sharding', 'Replication'
    ],
  },
  {
    id: 'cs',
    label: '컴퓨터 과학',
    color: '#f59e0b',
    terms: [
      'Algorithm', 'Data Structure', 'Array', 'Linked List', 'Stack', 'Queue', 'Deque', 'Hash Table', 'Hash Collision',
      'Tree', 'Binary Tree', 'Binary Search Tree', 'Heap', 'Trie', 'Graph', 'Directed Graph', 'Weighted Graph',
      'BFS', 'DFS', 'Dijkstra', 'Bellman-Ford', 'Floyd-Warshall', 'Union-Find', 'Topological Sort', 'Dynamic Programming',
      'Greedy', 'Backtracking', 'Divide and Conquer', 'Binary Search', 'Two Pointer', 'Sliding Window', 'Prefix Sum',
      'Big O', 'Time Complexity', 'Space Complexity', 'Recursion', 'Tail Call', 'Call Stack', 'Memory Heap', 'Garbage Collection',
      'Pointer', 'Reference', 'Value Type', 'Reference Type', 'Immutable Data', 'Mutable Data', 'Thread', 'Process',
      'Concurrency', 'Parallelism', 'Race Condition', 'Mutex', 'Semaphore', 'Lock', 'Atomic Operation', 'Context Switch',
      'Kernel', 'System Call', 'File Descriptor', 'Socket', 'TCP', 'UDP', 'DNS', 'HTTP', 'TLS', 'Handshake', 'Packet',
      'Latency', 'Throughput', 'Bandwidth', 'Encoding', 'Unicode', 'UTF-8', 'Compiler', 'Interpreter', 'AST',
      'Bytecode', 'JIT', 'Runtime', 'Type System', 'Generic', 'Polymorphism', 'Encapsulation', 'Inheritance',
      'Stable Sort', 'Unstable Sort', 'Merge Sort', 'Quick Sort', 'Heap Sort', 'Counting Sort', 'Radix Sort',
      'Bucket Sort', 'Insertion Sort', 'Selection Sort', 'Bubble Sort', 'Shell Sort', 'KMP', 'Rabin-Karp',
      'Boyer-Moore', 'Z Algorithm', 'Manacher', 'LIS', 'LCS', 'Edit Distance', 'Knapsack', 'Bitmask DP',
      'Tree DP', 'Digit DP', 'Memoization Table', 'State Compression', 'Minimum Spanning Tree', 'Kruskal',
      'Prim', 'Strongly Connected Component', 'Tarjan', 'Kosaraju', 'Articulation Point', 'Bridge',
      'Bipartite Graph', 'Maximum Flow', 'Ford-Fulkerson', 'Edmonds-Karp', 'Dinic', 'Min-Cut',
      'Bipartite Matching', 'Hungarian Algorithm', 'A* Search', 'Heuristic', 'Branch and Bound',
      'Segment Tree', 'Lazy Propagation', 'Fenwick Tree', 'Sparse Table', 'Disjoint Sparse Table',
      'Monotonic Stack', 'Monotonic Queue', 'Priority Queue', 'Balanced Tree', 'AVL Tree', 'Red-Black Tree',
      'B-Tree', 'B+ Tree', 'Suffix Array', 'Suffix Tree', 'Rolling Hash', 'Bloom Filter', 'LRU Cache',
      'LFU Cache', 'Skip List', 'Rope', 'Bitset', 'Bit Manipulation', 'XOR Trick', 'Modular Arithmetic',
      'Fast Exponentiation', 'Euclidean Algorithm', 'Extended GCD', 'Sieve of Eratosthenes', 'Prime Factorization',
      'Combinatorics', 'Permutation', 'Combination', 'Catalan Number', 'Pigeonhole Principle',
      'Inclusion-Exclusion', 'Probability DP', 'Expected Value', 'Matrix Exponentiation', 'Convex Hull',
      'Line Sweep', 'Coordinate Compression', 'Offline Query', 'Mo Algorithm', 'Meet in the Middle',
      'Ternary Search', 'Parametric Search', 'Lower Bound', 'Upper Bound', 'Amortized Analysis',
      'Cache Locality', 'Memory Alignment', 'Page Fault', 'Virtual Memory', 'Paging', 'Segmentation',
      'TLB', 'CPU Cache', 'L1 Cache', 'L2 Cache', 'Branch Prediction', 'Pipeline', 'Deadlock Prevention',
      'Starvation', 'Livelock', 'Producer-Consumer', 'Readers-Writers Problem', 'Dining Philosophers',
      'Round Robin', 'Shortest Job First', 'Priority Scheduling', 'Preemptive Scheduling', 'Non-preemptive Scheduling',
      'RAID', 'Journaling File System', 'Inode', 'DNS Resolver', 'Subnet Mask', 'CIDR', 'NAT', 'ARP',
      'ICMP', 'Three-Way Handshake', 'Congestion Control', 'Flow Control', 'Sliding Window Protocol',
      'HTTP/2', 'HTTP/3', 'QUIC', 'WebRTC', 'Serialization Format', 'B-Tree Index', 'Hash Index',
      'Clustered Index', 'Covering Index', 'Normalization', 'Denormalization', 'ACID', 'BASE',
      'CAP Theorem', 'Consistency', 'Availability', 'Partition Tolerance'
    ],
  },
]

const BUILT_IN_DESCRIPTIONS: Record<string, string> = {
  'DOM': '브라우저가 HTML 문서를 객체 트리로 표현한 구조입니다.',
  'Hydration': '서버에서 만든 HTML에 클라이언트 자바스크립트 동작을 연결하는 과정입니다.',
  'Accessibility': '키보드, 스크린 리더 등 다양한 환경에서도 사용할 수 있게 만드는 품질입니다.',
  'Idempotency': '같은 요청을 여러 번 보내도 결과가 한 번 처리된 것처럼 유지되는 성질입니다.',
  'N+1 Query': '목록 조회 뒤 각 항목마다 추가 쿼리가 반복되어 성능이 나빠지는 문제입니다.',
  'Circuit Breaker': '실패가 반복되는 외부 호출을 잠시 차단해 장애 전파를 줄이는 패턴입니다.',
  'Big O': '입력 크기가 커질 때 알고리즘 비용이 어떻게 증가하는지 표현하는 표기법입니다.',
  'Race Condition': '실행 순서에 따라 결과가 달라지는 동시성 버그입니다.',
  'Dynamic Programming': '작은 문제의 답을 저장해 중복 계산을 줄이는 알고리즘 기법입니다.',
  'Dijkstra': '음수 가중치가 없는 그래프에서 시작점 기준 최단 거리를 구하는 알고리즘입니다.',
  'Union-Find': '여러 원소가 같은 집합에 속하는지 빠르게 확인하고 합치는 자료구조입니다.',
  'Topological Sort': '방향 그래프에서 선후 관계를 만족하도록 정점을 나열하는 방법입니다.',
  'Segment Tree': '구간 합, 최솟값, 최댓값 같은 구간 질의를 빠르게 처리하는 트리 구조입니다.',
  'Fenwick Tree': '누적 합과 업데이트를 효율적으로 처리하는 배열 기반 자료구조입니다.',
  'KMP': '문자열 검색에서 이미 비교한 정보를 활용해 불필요한 비교를 줄이는 알고리즘입니다.',
  'LIS': '수열에서 순서를 유지하며 만들 수 있는 가장 긴 증가 부분 수열입니다.',
  'Minimum Spanning Tree': '그래프의 모든 정점을 최소 비용으로 연결하는 간선 집합입니다.',
  'Maximum Flow': '네트워크에서 시작점에서 도착점까지 보낼 수 있는 최대 유량을 구하는 문제입니다.',
  'Parametric Search': '정답 후보를 이분 탐색하면서 가능 여부 판정으로 최적값을 찾는 기법입니다.',
  'Amortized Analysis': '여러 연산을 묶어 평균적인 비용을 분석하는 방법입니다.',
  'Cache Locality': '가까운 메모리 위치를 연속해서 접근할수록 캐시 효율이 좋아지는 성질입니다.',
  'CAP Theorem': '분산 시스템에서 일관성, 가용성, 분할 내성을 동시에 완벽히 만족하기 어렵다는 정리입니다.',
}

const BUILT_IN_TERMS = Array.from(new Set(CATEGORIES.flatMap(category => category.terms)))

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function readJsonArray(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function getSeenKey(accountKey: string, mode: 'built-in' | 'custom', customSignature = '') {
  return `${SEEN_TERMS_KEY_PREFIX}:${accountKey}:${mode}:${customSignature}`
}

function makeResult(final: string, displayTerms: string[], description: string): SpinResult {
  const fallbackTerms = displayTerms.length >= 3 ? displayTerms : [final, final, final]
  return {
    left: fallbackTerms[0],
    center: fallbackTerms[1],
    right: fallbackTerms[2],
    final,
    description,
  }
}

function parseCustomTerms(value: string) {
  return Array.from(new Set(value.split(/[\n,]/)
    .map(term => term.trim())
    .filter(Boolean)))
}

function createUniqueResult(
  terms: string[],
  seenTerms: string[],
  descriptionFor: (term: string) => string,
) {
  const availableTerms = terms.filter(term => !seenTerms.includes(term))
  const pool = availableTerms.length > 0 ? availableTerms : terms
  const final = pick(pool)
  const sidePool = terms.filter(term => term !== final)
  const displayTerms = [final, ...Array.from({ length: 2 }, () => pick(sidePool.length > 0 ? sidePool : terms))]
    .sort(() => Math.random() - 0.5)

  return {
    result: makeResult(final, displayTerms, descriptionFor(final)),
    resetSeen: availableTerms.length === 0,
  }
}

function makeBuiltInResult(): SpinResult {
  const { result } = createUniqueResult(
    BUILT_IN_TERMS,
    [],
    term => BUILT_IN_DESCRIPTIONS[term] || `${term}는 개발자가 자주 마주치는 핵심 개념입니다. 관련 예제와 실제 사용 상황을 같이 찾아보면 기억에 오래 남습니다.`,
  )
  return result
}

function formatTimer(ms: number) {
  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.ceil(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

function notifyTimerDone(term: string) {
  document.title = `15분 완료 - ${term}`
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('개발 용어 15분 완료', {
      body: `${term} 복습 시간이 끝났어요.`,
      tag: 'dev-term-roulette-timer',
    })
  }
}

function App() {
  const [mode, setMode] = useState<'built-in' | 'custom'>('built-in')
  const [customText, setCustomText] = useState('React\nTypeScript\nAPI\nDocker\nSQL\nGit\n테스트\n배포')
  const [isSpinning, setIsSpinning] = useState(false)
  const [result, setResult] = useState<SpinResult>(() => makeBuiltInResult())
  const [history, setHistory] = useState<string[]>([])
  const [accountKey, setAccountKey] = useState('guest')
  const [seenTerms, setSeenTerms] = useState<string[]>([])
  const [timerEndAt, setTimerEndAt] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [timerDoneTerm, setTimerDoneTerm] = useState('')
  const customTerms = useMemo(() => parseCustomTerms(customText), [customText])
  const customSignature = useMemo(() => customTerms.join('|'), [customTerms])
  const activeTerms = mode === 'built-in' ? BUILT_IN_TERMS : customTerms
  const seenKey = getSeenKey(accountKey, mode, mode === 'custom' ? customSignature : '')
  const remainingCount = Math.max(0, activeTerms.length - seenTerms.filter(term => activeTerms.includes(term)).length)

  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(response => response.json())
      .then(data => {
        const login = data?.user?.login
        setAccountKey(login ? `user-${login}` : 'guest')
      })
      .catch(() => setAccountKey('guest'))
  }, [])

  useEffect(() => {
    setSeenTerms(readJsonArray(seenKey).filter(term => activeTerms.includes(term)))
  }, [activeTerms, seenKey])

  useEffect(() => {
    if (!timerEndAt) return

    const updateTimer = () => {
      const nextTimeLeft = Math.max(0, timerEndAt - Date.now())
      setTimeLeft(nextTimeLeft)
      if (nextTimeLeft === 0) {
        setTimerEndAt(null)
        setTimerDoneTerm(result.final)
        notifyTimerDone(result.final)
      }
    }

    updateTimer()
    const timer = window.setInterval(updateTimer, 1000)
    return () => window.clearInterval(timer)
  }, [result.final, timerEndAt])

  const spin = () => {
    if (isSpinning) return
    if (mode === 'custom' && customTerms.length < 3) return

    requestNotificationPermission()
    setTimerDoneTerm('')
    document.title = '개발 용어 룰렛'
    setIsSpinning(true)
    window.setTimeout(() => {
      const terms = mode === 'built-in' ? BUILT_IN_TERMS : customTerms
      const { result: next, resetSeen } = createUniqueResult(
        terms,
        seenTerms,
        term => mode === 'built-in'
          ? BUILT_IN_DESCRIPTIONS[term] || `${term}는 개발자가 자주 마주치는 핵심 개념입니다. 관련 예제와 실제 사용 상황을 같이 찾아보면 기억에 오래 남습니다.`
          : '사용자 지정 단어에서 뽑힌 결과입니다. 직접 만든 주제로 복습, 발표, 게임을 진행할 수 있습니다.',
      )
      const nextSeenTerms = resetSeen ? [next.final] : [...seenTerms, next.final]
      localStorage.setItem(seenKey, JSON.stringify(nextSeenTerms))
      setSeenTerms(nextSeenTerms)
      setResult(next)
      setHistory(prev => [next.final, ...prev.filter(item => item !== next.final)].slice(0, 12))
      setTimerEndAt(Date.now() + TIMER_DURATION_MS)
      setTimeLeft(TIMER_DURATION_MS)
      setIsSpinning(false)
    }, 1600)
  }

  return (
    <main className="roulette-app">
      <section className="machine">
        <div className="machine-header">
          <a href="/" className="home-link">← 놀이터</a>
          <div>
            <p className="eyebrow">Dev Term Roulette</p>
            <h1>개발 용어 룰렛</h1>
          </div>
          <div className="term-count">
            {mode === 'built-in' ? `${remainingCount}/${BUILT_IN_TERMS.length}개 남음` : `${remainingCount}/${customTerms.length}개 남음`}
          </div>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="게임 모드">
          <button className={mode === 'built-in' ? 'active' : ''} onClick={() => setMode('built-in')}>기본 용어</button>
          <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>사용자 지정 게임</button>
        </div>

        <div className="machine-body">
          <div className="slot-panel">
            <div className={`slot-window ${isSpinning ? 'spinning' : ''}`}>
              {CATEGORIES.map((category, index) => (
                <div className="slot-reel" key={category.id} style={{ '--reel-color': category.color } as React.CSSProperties}>
                  <span>{mode === 'built-in' ? category.label : `사용자 ${index + 1}`}</span>
                  <strong>{[result.left, result.center, result.right][index]}</strong>
                </div>
              ))}
            </div>
            <div className={`result-card ${isSpinning ? 'loading' : ''}`}>
              <span>선택된 단어</span>
              <h2>{isSpinning ? '돌리는 중...' : result.final}</h2>
              <p>{result.description}</p>
            </div>
          </div>

          <div className="lever-panel">
            <button
              className={`lever ${isSpinning ? 'pulled' : ''}`}
              onClick={spin}
              disabled={isSpinning || (mode === 'custom' && customTerms.length < 3)}
              aria-label="레버 내리기"
              title="레버 내리기"
            >
              <span className="lever-knob" />
              <span className="lever-stick" />
            </button>
            <button className="spin-button" onClick={spin} disabled={isSpinning || (mode === 'custom' && customTerms.length < 3)}>
              {isSpinning ? '룰렛 회전 중' : '레버 내리기'}
            </button>
            <div className={`timer-card ${timerDoneTerm ? 'done' : ''}`}>
              <span>15분 타이머</span>
              <strong>{timerEndAt ? formatTimer(timeLeft) : '15:00'}</strong>
              <p>
                {timerDoneTerm
                  ? `${timerDoneTerm} 복습 시간이 끝났습니다.`
                  : timerEndAt
                    ? `${result.final} 기준으로 진행 중`
                    : '룰렛을 돌리면 시작됩니다.'}
              </p>
            </div>
            {mode === 'custom' && customTerms.length < 3 && <p className="hint">사용자 지정 게임은 단어 3개 이상이 필요합니다.</p>}
          </div>
        </div>
      </section>

      <section className="control-grid">
        <article className="panel">
          <h2>{mode === 'built-in' ? '카테고리' : '사용자 지정 단어'}</h2>
          {mode === 'built-in' ? (
            <div className="category-list">
              {CATEGORIES.map(category => (
                <div className="category-item" key={category.id}>
                  <span style={{ background: category.color }} />
                  <strong>{category.label}</strong>
                  <small>{category.terms.length}개</small>
                </div>
              ))}
            </div>
          ) : (
            <>
              <textarea
                value={customText}
                onChange={event => setCustomText(event.target.value)}
                placeholder="한 줄에 하나씩, 또는 쉼표로 구분해서 단어를 넣으세요."
              />
              <p className="hint">현재 {customTerms.length}개 단어가 준비되었습니다. 같은 목록에서는 계정별로 중복 없이 나옵니다.</p>
            </>
          )}
        </article>

        <article className="panel">
          <h2>최근 결과</h2>
          <div className="history-list">
            {history.length > 0 ? history.map(item => <span key={item}>{item}</span>) : <p className="hint">아직 돌린 기록이 없습니다.</p>}
          </div>
        </article>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
