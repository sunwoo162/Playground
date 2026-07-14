import { useEffect, useMemo, useState } from 'react'

type Stock = {
  symbol: string
  name: string
  price?: number
  change?: number
  changeRate?: number
  volume?: number
  marketCap?: number
  sector: string
  high?: number
  low?: number
  description: string
  points?: number[]
  realtime: boolean
}

type ChartCandle = {
  datetime?: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  realtime?: boolean
}

type Holding = {
  symbol: string
  name: string
  quantity: number
  averagePrice: number
  currentPrice: number
  invested: number
  evaluated: number
  profit: number
  profitRate: number
}

type Portfolio = {
  cash: number
  rewardedAmount: number
  invested: number
  evaluated: number
  totalAsset: number
  profit: number
  profitRate: number
  holdings: Holding[]
}

type Order = {
  id: number
  type: 'BUY' | 'SELL'
  symbol: string
  name: string
  quantity: number
  price: number
  createdAt: string
}

type Journal = {
  id: number
  symbol: string
  name: string
  title: string
  content: string
  result: string
  createdAt: string
}

type Ranking = {
  rank: number
  nickname: string
  totalAsset: number
  profitRate: number
}

type StockRequest = {
  id: number
  userId: string
  nickname: string
  company: string
  symbol?: string
  memo?: string
  status: string
  createdAt: string
}

type AdminAccount = {
  userId: string
  login?: string
  nickname: string
  avatarUrl?: string
  cash: number
  rewardedAmount: number
  invested: number
  evaluated: number
  totalAsset: number
  profit: number
  profitRate: number
}

type Tab = 'dashboard' | 'stocks' | 'orders' | 'journal' | 'ranking' | 'admin'
type ChartRange = '5Y' | '1Y' | '6M' | '1M' | '1W' | '1D'

const API = '/api/mock-invest'
const CHART_RANGES: Array<[ChartRange, string, number]> = [
  ['5Y', '5년', 60],
  ['1Y', '1년', 48],
  ['6M', '6개월', 36],
  ['1M', '1달', 24],
  ['1W', '일주일', 12],
  ['1D', '1일', 16],
]

const POPULAR_STOCKS: Stock[] = [
  { symbol: 'AAPL', name: '애플', sector: '기술', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'MSFT', name: '마이크로소프트', sector: '기술', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'NVDA', name: '엔비디아', sector: '반도체', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'GOOGL', name: '구글', sector: '인터넷', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'UBER', name: '우버', sector: '모빌리티', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'AMZN', name: '아마존', sector: '이커머스', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'META', name: '메타', sector: '소셜미디어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'TSLA', name: '테슬라', sector: '전기차', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'AVGO', name: '브로드컴', sector: '반도체', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'COST', name: '코스트코', sector: '유통', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'NFLX', name: '넷플릭스', sector: '미디어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'AMD', name: 'AMD', sector: '반도체', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'INTC', name: '인텔', sector: '반도체', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'QCOM', name: '퀄컴', sector: '반도체', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'PEP', name: '펩시코', sector: '소비재', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'ADBE', name: '어도비', sector: '소프트웨어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'CSCO', name: '시스코', sector: '네트워크', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'ORCL', name: '오라클', sector: '소프트웨어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'CRM', name: '세일즈포스', sector: '소프트웨어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'IBM', name: 'IBM', sector: '기술', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'JPM', name: '제이피모건 체이스', sector: '금융', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'V', name: '비자', sector: '결제', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'MA', name: '마스터카드', sector: '결제', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'WMT', name: '월마트', sector: '유통', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'MCD', name: '맥도날드', sector: '외식', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'KO', name: '코카콜라', sector: '소비재', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'DIS', name: '디즈니', sector: '미디어', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'NKE', name: '나이키', sector: '소비재', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'BA', name: '보잉', sector: '항공', description: '주요 미국 종목입니다.', realtime: true },
  { symbol: 'XOM', name: '엑슨모빌', sector: '에너지', description: '주요 미국 종목입니다.', realtime: true },
]

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (res.status === 401) {
    window.location.href = `/auth/github?returnTo=${encodeURIComponent(window.location.pathname)}`
    throw new Error('로그인이 필요합니다.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || data?.error || '요청에 실패했습니다.')
  return data
}

function money(value: number) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function signedMoney(value: number) {
  return `${value >= 0 ? '+' : ''}${money(value)}`
}

function percent(value: number) {
  const n = Number(value || 0)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [watchlist, setWatchlist] = useState<Stock[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [journals, setJournals] = useState<Journal[]>([])
  const [rankings, setRankings] = useState<Ranking[]>([])
  const [tab, setTab] = useState<Tab>('dashboard')
  const [query, setQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL')
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [chartRange, setChartRange] = useState<ChartRange>('1D')
  const [remoteCandles, setRemoteCandles] = useState<ChartCandle[]>([])
  const [journalTitle, setJournalTitle] = useState('')
  const [journalContent, setJournalContent] = useState('')
  const [journalResult, setJournalResult] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [stockRequestOpen, setStockRequestOpen] = useState(false)
  const [requestCompany, setRequestCompany] = useState('')
  const [requestMemo, setRequestMemo] = useState('')
  const [myStockRequests, setMyStockRequests] = useState<StockRequest[]>([])
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([])
  const [adminRequests, setAdminRequests] = useState<StockRequest[]>([])
  const [cashTargetUserId, setCashTargetUserId] = useState('')
  const [cashAmount, setCashAmount] = useState(10000)

  const loadPortfolio = async () => setPortfolio(await api<Portfolio>('/portfolio'))
  const loadWatchlist = async () => {
    try {
      setWatchlist(await api<Stock[]>('/watchlist'))
    } catch {
      setWatchlist([])
    }
  }
  const loadOrders = async () => setOrders(await api<Order[]>('/orders'))
  const loadJournals = async () => setJournals(await api<Journal[]>('/journals'))
  const loadRankings = async () => {
    try {
      setRankings(await api<Ranking[]>('/rankings'))
    } catch {
      setRankings([])
    }
  }
  const loadAdminStatus = async () => {
    try {
      const result = await api<{ admin: boolean }>('/admin/me')
      setIsAdmin(result.admin)
      return result.admin
    } catch {
      setIsAdmin(false)
      return false
    }
  }
  const loadMyStockRequests = async () => {
    try {
      setMyStockRequests(await api<StockRequest[]>('/stock-requests/my'))
    } catch {
      setMyStockRequests([])
    }
  }
  const loadAdminData = async () => {
    const [accountsResult, requestsResult] = await Promise.allSettled([
      api<AdminAccount[]>('/admin/accounts'),
      api<StockRequest[]>('/admin/stock-requests'),
    ])
    if (accountsResult.status === 'fulfilled') {
      setAdminAccounts(accountsResult.value)
      if (!cashTargetUserId && accountsResult.value[0]) setCashTargetUserId(accountsResult.value[0].userId)
    }
    if (requestsResult.status === 'fulfilled') setAdminRequests(requestsResult.value)
  }

  const loadStocks = async (keyword = '') => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const list = POPULAR_STOCKS.filter((stock) => !normalizedKeyword
      || stock.symbol.toLowerCase().includes(normalizedKeyword)
      || stock.name.toLowerCase().includes(normalizedKeyword)
      || stock.sector.toLowerCase().includes(normalizedKeyword))
    setStocks(list)
    if (!selectedStock && list[0]) {
      const preferred = list.find((stock) => stock.symbol === selectedSymbol)
        || list.find((stock) => stock.symbol === 'AAPL')
        || list[0]
      setSelectedSymbol(preferred.symbol)
      setSelectedStock(preferred)
      try {
        setSelectedStock(await api<Stock>(`/stocks/${encodeURIComponent(preferred.symbol)}`))
      } catch {
        setSelectedStock(preferred)
      }
    }
  }

  const loadSelectedStock = async (symbol: string) => {
    const localStock = stocks.find((stock) => stock.symbol === symbol)
    setSelectedSymbol(symbol)
    if (localStock) setSelectedStock(localStock)
    setRemoteCandles([])
    setQuoteLoading(true)
    try {
      const nextStock = await api<Stock>(`/stocks/${encodeURIComponent(symbol)}`)
      setSelectedStock(nextStock)
      setMessage('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '시세를 불러오지 못했습니다.')
    } finally {
      setQuoteLoading(false)
    }
  }

  const refreshAll = async () => {
    await Promise.all([loadPortfolio(), loadOrders(), loadJournals()])
  }

  useEffect(() => {
    Promise.allSettled([loadPortfolio(), loadStocks(), loadOrders(), loadJournals(), loadAdminStatus(), loadMyStockRequests()])
      .then((results) => {
        const failed = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
        if (failed) setMessage(failed.reason?.message || 'Twelve Data API 정보를 불러오지 못했습니다.')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'dashboard') {
      loadWatchlist()
    }
    if (tab === 'ranking') {
      loadRankings()
    }
    if (tab === 'admin' && isAdmin) {
      loadAdminData().catch((err) => setMessage(err.message))
    }
  }, [tab])

  useEffect(() => {
    const id = window.setTimeout(() => {
      loadStocks(query).catch((err) => setMessage(err.message))
    }, 250)
    return () => window.clearTimeout(id)
  }, [query])

  useEffect(() => {
    if (!selectedSymbol) return
    let active = true
    setRemoteCandles([])
    api<ChartCandle[]>(`/stocks/${encodeURIComponent(selectedSymbol)}/chart?range=${chartRange}`)
      .then((candles) => {
        if (active) setRemoteCandles(candles)
      })
      .catch(() => {
        if (active) setRemoteCandles([])
      })
    return () => {
      active = false
    }
  }, [selectedSymbol, chartRange])

  const holdingSymbols = useMemo(() => new Set((portfolio?.holdings || []).map((h) => h.symbol)), [portfolio])
  const watchSymbols = useMemo(() => new Set(watchlist.map((stock) => stock.symbol)), [watchlist])

  const trade = async (type: 'buy' | 'sell') => {
    if (!selectedStock) return
    await api<Order>(`/trades/${type}`, {
      method: 'POST',
      body: JSON.stringify({ symbol: selectedStock.symbol, quantity }),
    })
    setMessage(`${selectedStock.name} ${quantity}주 ${type === 'buy' ? '매수' : '매도'} 완료`)
    await refreshAll()
  }

  const submitStockRequest = async () => {
    if (!requestCompany.trim()) {
      setMessage('요청할 기업명을 입력해주세요.')
      return
    }
    await api<StockRequest>('/stock-requests', {
      method: 'POST',
      body: JSON.stringify({
        company: requestCompany.trim(),
        memo: requestMemo.trim() || null,
      }),
    })
    setRequestCompany('')
    setRequestMemo('')
    setStockRequestOpen(false)
    setMessage('주식 추가 요청을 보냈습니다. 관리자가 확인할 수 있습니다.')
    await loadMyStockRequests()
    if (isAdmin) await loadAdminData()
  }

  const addAdminCash = async () => {
    if (!cashTargetUserId || cashAmount <= 0) {
      setMessage('입금할 사용자와 금액을 확인해주세요.')
      return
    }
    await api<AdminAccount>('/admin/accounts/cash', {
      method: 'POST',
      body: JSON.stringify({ userId: cashTargetUserId, amount: cashAmount, reason: 'ADMIN_GRANT' }),
    })
    setMessage(`${money(cashAmount)}을 지급했습니다.`)
    await loadAdminData()
    await loadPortfolio()
  }

  const toggleWatch = async () => {
    if (!selectedStock) return
    if (watchSymbols.has(selectedStock.symbol)) {
      await api(`/watchlist/${selectedStock.symbol}`, { method: 'DELETE' })
    } else {
      await api('/watchlist', { method: 'POST', body: JSON.stringify({ symbol: selectedStock.symbol }) })
    }
    await loadWatchlist()
  }

  const addJournal = async () => {
    if (!selectedStock || !journalTitle.trim() || !journalContent.trim()) {
      setMessage('투자 일지 제목과 투자 이유를 입력해주세요.')
      return
    }
    await api('/journals', {
      method: 'POST',
      body: JSON.stringify({
        symbol: selectedStock.symbol,
        title: journalTitle,
        content: journalContent,
        result: journalResult || '결과 기록 전',
      }),
    })
    setJournalTitle('')
    setJournalContent('')
    setJournalResult('')
    setMessage('투자 일지를 저장했습니다.')
    await loadJournals()
  }

  if (loading || !portfolio) {
    return (
      <div className="app-shell">
        <main className="layout">
          <p className="status-line">{loading ? '모의 투자 정보를 불러오는 중...' : (message || '포트폴리오를 불러오지 못했습니다.')}</p>
        </main>
      </div>
    )
  }

  const current = selectedStock || stocks[0]
  const selectedRange = CHART_RANGES.find(([id]) => id === chartRange) || CHART_RANGES[5]
  const chartCandles = remoteCandles
  const firstCandle = chartCandles[0]
  const lastCandle = chartCandles[chartCandles.length - 1]
  const quotePrice = current?.price || 0
  const quoteChange = current?.change || 0
  const quoteChangeRate = current?.changeRate || 0
  const quoteHigh = current?.high || 0
  const quoteLow = current?.low || 0
  const quoteVolume = current?.volume || 0
  const hasQuoteData = quotePrice > 0
  const hasChartData = chartCandles.length > 0
  const rangeOpen = firstCandle?.open || quotePrice
  const rangeClose = lastCandle?.close || quotePrice
  const rangeChange = rangeClose - rangeOpen
  const rangeChangeRate = rangeOpen ? (rangeChange / rangeOpen) * 100 : 0
  const rangeHigh = chartCandles.length ? Math.max(...chartCandles.map((c) => c.high)) : quoteHigh
  const rangeLow = chartCandles.length ? Math.min(...chartCandles.map((c) => c.low)) : quoteLow
  const rangeVolume = chartCandles.reduce((sum, candle) => sum + candle.volume, 0)
  const displayPrice = hasChartData ? rangeClose : quotePrice
  const displayChange = hasChartData ? rangeChange : quoteChange
  const displayChangeRate = hasChartData ? rangeChangeRate : quoteChangeRate
  const displayHigh = hasChartData ? rangeHigh : quoteHigh
  const displayLow = hasChartData ? rangeLow : quoteLow
  const displayVolume = hasChartData ? rangeVolume : quoteVolume
  const hasDisplayData = hasChartData || hasQuoteData
  const chartMin = chartCandles.length ? Math.min(...chartCandles.map((c) => c.low)) : 0
  const chartMax = chartCandles.length ? Math.max(...chartCandles.map((c) => c.high)) : 0
  const chartValueRange = chartMax - chartMin || 1
  const maxVolume = chartCandles.length ? Math.max(...chartCandles.map((c) => c.volume)) || 1 : 1
  const priceTicks = hasChartData
    ? [chartMax, chartMax - chartValueRange * 0.25, chartMax - chartValueRange * 0.5, chartMax - chartValueRange * 0.75, chartMin]
    : []
  const timeTicks = buildTimeTicks(chartRange, chartCandles)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="back-link" href="/">← 놀이터</a>
        <div>
          <h1>📈 모의 투자</h1>
          <p>Twelve Data 시세 연동 · 주요 미국 종목 30개와 선택 종목 실시간 시세</p>
        </div>
      </header>

      <main className="layout">
        <section className="hero-panel">
          <div><span className="eyebrow">총자산</span><strong>{money(portfolio.totalAsset)}</strong><p className={portfolio.profit >= 0 ? 'positive' : 'negative'}>{money(portfolio.profit)} · {percent(portfolio.profitRate)}</p></div>
          <div><span className="eyebrow">보유 현금</span><strong>{money(portfolio.cash)}</strong><p>기준 원금 {money(portfolio.rewardedAmount)}</p></div>
          <div><span className="eyebrow">투자 금액</span><strong>{money(portfolio.invested)}</strong><p>평가 금액 {money(portfolio.evaluated)}</p></div>
        </section>

        <nav className="tabs" aria-label="모의 투자 메뉴">
          {[
            ['dashboard', '대시보드'], ['stocks', '종목'], ['orders', '거래내역'], ['journal', '투자일지'], ['ranking', '랭킹'],
            ...(isAdmin ? [['admin', '관리자']] : []),
          ].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as Tab)}>{label}</button>)}
        </nav>

        {message && <p className="status-line">{message}</p>}

        {tab === 'dashboard' && (
          <div className="content-grid">
            <section className="panel wide">
              <div className="panel-header"><h2>포트폴리오</h2><span>{portfolio.holdings.length}개 보유</span></div>
              {portfolio.holdings.length === 0 ? <p className="empty">아직 보유 종목이 없습니다.</p> : (
                <div className="table-list">
                  {portfolio.holdings.map((holding) => (
                    <button key={holding.symbol} className="row-button" onClick={() => { loadSelectedStock(holding.symbol); setTab('stocks') }}>
                      <span><strong>{holding.name}</strong><small>{holding.symbol} · {holding.quantity}주 · 평균 {money(holding.averagePrice)}</small></span>
                      <span className={holding.profit >= 0 ? 'positive' : 'negative'}>{money(holding.evaluated)}<small>{money(holding.profit)} · {percent(holding.profitRate)}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="panel">
              <div className="panel-header"><h2>관심 종목</h2></div>
              <div className="watch-list">
                {watchlist.map((stock) => (
                  <button key={stock.symbol} onClick={() => { loadSelectedStock(stock.symbol); setTab('stocks') }}>
                    <span>{stock.name}</span><strong>{money(stock.price || 0)}</strong><small className={(stock.changeRate || 0) >= 0 ? 'positive' : 'negative'}>{percent(stock.changeRate || 0)}</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === 'stocks' && current && (
          <div className="content-grid">
            <section className="panel stock-list-panel">
              <button className="primary-btn request-stock-btn" onClick={() => setStockRequestOpen(true)}>+ 주식 추가 요청하기</button>
              <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명, 티커, 업종 검색" />
              <div className="stock-list-meta">
                <strong>전체 종목</strong>
                <span>{stocks.length.toLocaleString('ko-KR')}개 표시</span>
              </div>
              {myStockRequests.length > 0 && (
                <div className="request-summary">
                  <strong>내 요청</strong>
                  {myStockRequests.slice(0, 3).map((request) => (
                    <span key={request.id}>{request.company}{request.symbol ? ` · ${request.symbol}` : ''} · {request.status}</span>
                  ))}
                </div>
              )}
              <div className="stock-list">
                {stocks.length === 0 && <p className="empty">Twelve Data 종목을 불러오지 못했습니다. 서버 API 키 설정을 확인해주세요.</p>}
                {stocks.map((stock) => (
                  <button key={stock.symbol} className={selectedSymbol === stock.symbol ? 'selected' : ''} onClick={() => loadSelectedStock(stock.symbol)}>
                    <span><strong>{stock.name}</strong><small>{stock.symbol} · {stock.sector}{holdingSymbols.has(stock.symbol) ? ' · 보유중' : ''}</small></span>
                    {stock.price ? (
                      <span className={(stock.changeRate || 0) >= 0 ? 'positive' : 'negative'}>{percent(stock.changeRate || 0)}</span>
                    ) : (
                      <span className="quote-chip">시세 보기</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
            <section className="panel wide">
              <div className="stock-detail">
                <div><h2>{current.name}</h2><p>{current.symbol} · {current.sector}</p></div>
                <button className="ghost-btn" onClick={toggleWatch}>{watchSymbols.has(current.symbol) ? '★ 관심 해제' : '☆ 관심 등록'}</button>
              </div>
              <div className="quote-grid">
                <div><span>현재가</span><strong>{hasDisplayData ? money(displayPrice) : quoteLoading ? '조회 중' : '시세 없음'}</strong></div>
                <div>
                  <span>{hasChartData ? selectedRange[1] : '당일'} 등락률</span>
                  <strong className={displayChange >= 0 ? 'positive' : 'negative'}>{hasDisplayData ? percent(displayChangeRate) : quoteLoading ? '조회 중' : '-'}</strong>
                  {hasDisplayData && <small className={displayChange >= 0 ? 'positive' : 'negative'}>{signedMoney(displayChange)}</small>}
                </div>
                <div><span>{hasChartData ? selectedRange[1] : '당일'} 고가/저가</span><strong>{hasDisplayData ? `${money(displayHigh)} / ${money(displayLow)}` : quoteLoading ? '조회 중' : '-'}</strong></div>
                <div><span>{hasChartData ? selectedRange[1] : '당일'} 거래량</span><strong>{hasDisplayData ? displayVolume.toLocaleString('ko-KR') : quoteLoading ? '조회 중' : '0'}</strong></div>
              </div>
              <div className="chart-range-tabs" aria-label="차트 기간">
                {CHART_RANGES.map(([id, label]) => (
                  <button key={id} className={chartRange === id ? 'active' : ''} onClick={() => setChartRange(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="stock-chart" aria-label="최근 가격 캔들 차트">
                <div className="chart-grid" />
                <div className="chart-price-axis" aria-hidden="true">
                  {priceTicks.map((tick, index) => <span key={`${tick}-${index}`}>{money(tick)}</span>)}
                </div>
                <div className="chart-time-axis" aria-hidden="true">
                  {timeTicks.map((tick) => <span key={tick}>{tick}</span>)}
                </div>
                {chartCandles.length === 0 ? (
                  <p className="empty chart-empty">차트 데이터를 불러오지 못했습니다.</p>
                ) : null}
                <div className="chart-candles">
                  {chartCandles.map((candle, index) => {
                    const top = ((chartMax - candle.high) / chartValueRange) * 100
                    const wickHeight = Math.max(3, ((candle.high - candle.low) / chartValueRange) * 100)
                    const bodyTop = ((chartMax - Math.max(candle.open, candle.close)) / chartValueRange) * 100
                    const bodyHeight = Math.max(2, (Math.abs(candle.close - candle.open) / chartValueRange) * 100)
                    const volumeHeight = Math.max(4, (candle.volume / maxVolume) * 100)
                    const rising = candle.close >= candle.open
                    return (
                      <span
                        className={`candle ${rising ? 'rise' : 'fall'}`}
                        key={`${candle.close}-${index}`}
                        title={`${rising ? '상승' : '하락'} ${money(candle.open)} → ${money(candle.close)}`}
                      >
                        <i className="wick" style={{ top: `${top}%`, height: `${wickHeight}%` }} />
                        <i className="body" style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
                        <i className="volume" style={{ height: `${volumeHeight}%` }} />
                      </span>
                    )
                  })}
                </div>
              </div>
              <p className="description">
                {hasChartData
                  ? 'Twelve Data에서 조회한 실제 기간 차트입니다.'
                  : hasQuoteData
                    ? '현재 시세는 조회됐지만 기간 차트는 불러오지 못했습니다.'
                    : '실제 시세를 불러오지 못했습니다. 임의 가격은 표시하지 않습니다.'}
              </p>
              <div className="trade-box">
                <label>주문 수량<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
                <div><span>예상 금액</span><strong>{money(quotePrice * Math.max(1, quantity || 1))}</strong></div>
                <button className="buy-btn" onClick={() => trade('buy')} disabled={!hasQuoteData}>매수</button>
                <button className="sell-btn" onClick={() => trade('sell')} disabled={!hasQuoteData}>매도</button>
              </div>
            </section>
          </div>
        )}

        {tab === 'orders' && (
          <section className="panel wide full">
            <div className="panel-header"><h2>거래 내역</h2><span>{orders.length}건</span></div>
            <div className="table-list">
              {orders.map((order) => <div className="row-button static" key={order.id}><span><strong>{order.type === 'BUY' ? '매수' : '매도'} · {order.name}</strong><small>{new Date(order.createdAt).toLocaleString('ko-KR')} · {order.quantity}주</small></span><span>{money(order.price * order.quantity)}<small>{money(order.price)}</small></span></div>)}
            </div>
          </section>
        )}

        {tab === 'journal' && current && (
          <div className="content-grid">
            <section className="panel">
              <h2>투자 일지 작성</h2>
              <label>종목<select value={selectedSymbol} onChange={(event) => loadSelectedStock(event.target.value)}>{stocks.map((stock) => <option key={stock.symbol} value={stock.symbol}>{stock.name}</option>)}</select></label>
              <label>제목<input value={journalTitle} onChange={(event) => setJournalTitle(event.target.value)} placeholder="AI 수요 증가 기대" /></label>
              <label>투자 이유<textarea value={journalContent} onChange={(event) => setJournalContent(event.target.value)} placeholder="매수하거나 관심 등록한 이유" /></label>
              <label>결과<textarea value={journalResult} onChange={(event) => setJournalResult(event.target.value)} placeholder="결과나 회고" /></label>
              <button className="primary-btn" onClick={addJournal}>일지 저장</button>
            </section>
            <section className="panel wide">
              <div className="panel-header"><h2>투자 일지</h2><span>{journals.length}개</span></div>
              <div className="journal-list">{journals.map((journal) => <article key={journal.id}><span>{journal.name} · {new Date(journal.createdAt).toLocaleDateString('ko-KR')}</span><h3>{journal.title}</h3><p>{journal.content}</p><small>{journal.result}</small></article>)}</div>
            </section>
          </div>
        )}

        {tab === 'ranking' && (
          <section className="panel wide full">
            <div className="panel-header"><h2>수익률 랭킹</h2><span>DB 사용자 기준</span></div>
            <div className="ranking-list">{rankings.map((item) => <div key={`${item.rank}-${item.nickname}`}><strong>{item.rank}</strong><span>{item.nickname}</span><span>{money(item.totalAsset)}</span><span className={item.profitRate >= 0 ? 'positive' : 'negative'}>{percent(item.profitRate)}</span></div>)}</div>
          </section>
        )}

        {tab === 'admin' && isAdmin && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>주식 추가 요청</h2><span>{adminRequests.length}건</span></div>
              <div className="admin-list">
                {adminRequests.map((request) => (
                  <article key={request.id}>
                    <strong>{request.company}</strong>
                    <span>{request.status}</span>
                    <small>{request.nickname} · {new Date(request.createdAt).toLocaleString('ko-KR')}</small>
                    {request.memo && <p>{request.memo}</p>}
                  </article>
                ))}
                {adminRequests.length === 0 && <p className="empty">아직 주식 추가 요청이 없습니다.</p>}
              </div>
            </section>
            <section className="panel wide">
              <div className="panel-header"><h2>사용자 자금 관리</h2><span>{adminAccounts.length}명</span></div>
              <div className="admin-cash-form">
                <label>사용자
                  <select value={cashTargetUserId} onChange={(event) => setCashTargetUserId(event.target.value)}>
                    {adminAccounts.map((account) => (
                      <option key={account.userId} value={account.userId}>{account.nickname} {account.login ? `(${account.login})` : ''}</option>
                    ))}
                  </select>
                </label>
                <label>추가 금액
                  <input type="number" min={1} value={cashAmount} onChange={(event) => setCashAmount(Number(event.target.value))} />
                </label>
                <button className="primary-btn" onClick={addAdminCash}>돈 추가</button>
              </div>
              <div className="admin-account-list">
                {adminAccounts.map((account) => (
                  <div key={account.userId}>
                    <span><strong>{account.nickname}</strong><small>{account.login || account.userId}</small></span>
                    <span>현금 <strong>{money(account.cash)}</strong></span>
                    <span>총자산 <strong>{money(account.totalAsset)}</strong></span>
                    <span className={account.profit >= 0 ? 'positive' : 'negative'}>{percent(account.profitRate)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
      {stockRequestOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-panel">
            <div className="panel-header">
              <h2>주식 추가 요청</h2>
              <button className="ghost-btn" onClick={() => setStockRequestOpen(false)}>닫기</button>
            </div>
            <label>기업명
              <input value={requestCompany} onChange={(event) => setRequestCompany(event.target.value)} placeholder="예: 팔란티어" />
            </label>
            <label>요청 메모
              <textarea value={requestMemo} onChange={(event) => setRequestMemo(event.target.value)} placeholder="추가하고 싶은 이유나 참고할 정보" />
            </label>
            <button className="primary-btn full-width" onClick={submitStockRequest}>요청 보내기</button>
          </section>
        </div>
      )}
    </div>
  )
}

function buildTimeTicks(range: ChartRange, candles: ChartCandle[]) {
  const count = candles.length
  if (count === 0) return []
  const labels = 5
  const step = Math.max(1, Math.floor((count - 1) / (labels - 1)))
  const indexes = Array.from({ length: labels }, (_, index) => Math.min(count - 1, index * step))
  indexes[indexes.length - 1] = count - 1
  return indexes.map((index) => {
    const candleTime = formatCandleTime(candles[index]?.datetime, range)
    if (candleTime) return candleTime
    const now = new Date()
    const date = new Date(now)
    if (range === '5Y') date.setMonth(now.getMonth() - Math.round((count - 1 - index) * 1))
    if (range === '1Y') date.setDate(now.getDate() - Math.round((count - 1 - index) * 7.6))
    if (range === '6M') date.setDate(now.getDate() - Math.round((count - 1 - index) * 5))
    if (range === '1M') date.setDate(now.getDate() - Math.round((count - 1 - index) * 1.3))
    if (range === '1W') date.setDate(now.getDate() - Math.round((count - 1 - index) * 0.6))
    if (range === '1D') date.setHours(now.getHours() - Math.round((count - 1 - index) * 0.5))
    if (range === '1D') {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    if (range === '5Y' || range === '1Y') {
      return date.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit' }).replace(/\\. /g, '.').replace('.', '.')
    }
    return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }).replace(/\\. /g, '.').replace('.', '.')
  })
}

function formatCandleTime(value: string | undefined, range: ChartRange) {
  if (!value) return ''
  const normalized = value.trim()
  if (!normalized) return ''
  if (range === '1D') {
    const time = normalized.includes(' ') ? normalized.split(' ')[1] : normalized.split('T')[1]
    return time ? time.slice(0, 5) : normalized.slice(5, 10).replace('-', '.')
  }
  if (range === '5Y' || range === '1Y') {
    return normalized.slice(2, 7).replace('-', '.')
  }
  return normalized.slice(5, 10).replace('-', '.')
}

export default App
