import { useEffect, useMemo, useState } from 'react'

type Stock = {
  symbol: string
  name: string
  price?: number
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

type Tab = 'dashboard' | 'stocks' | 'orders' | 'journal' | 'ranking'
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
  const [chartRange, setChartRange] = useState<ChartRange>('1D')
  const [remoteCandles, setRemoteCandles] = useState<ChartCandle[]>([])
  const [journalTitle, setJournalTitle] = useState('')
  const [journalContent, setJournalContent] = useState('')
  const [journalResult, setJournalResult] = useState('')

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
    try {
      setRemoteCandles([])
      const nextStock = await api<Stock>(`/stocks/${encodeURIComponent(symbol)}`)
      setSelectedSymbol(symbol)
      setSelectedStock(nextStock)
      setMessage('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '시세를 불러오지 못했습니다.')
    }
  }

  const refreshAll = async () => {
    await Promise.all([loadPortfolio(), loadOrders(), loadJournals()])
  }

  useEffect(() => {
    Promise.allSettled([loadPortfolio(), loadStocks(), loadOrders(), loadJournals()])
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

  const addActivityReward = async () => {
    setPortfolio(await api<Portfolio>('/assets/reward', {
      method: 'POST',
      body: JSON.stringify({ amount: 250000, reason: 'PLAYGROUND_ACTIVITY' }),
    }))
    setMessage(`놀이터 활동 보상 ${money(250000)}이 지급됐습니다.`)
  }

  const trade = async (type: 'buy' | 'sell') => {
    if (!selectedStock) return
    await api<Order>(`/trades/${type}`, {
      method: 'POST',
      body: JSON.stringify({ symbol: selectedStock.symbol, quantity }),
    })
    setMessage(`${selectedStock.name} ${quantity}주 ${type === 'buy' ? '매수' : '매도'} 완료`)
    await refreshAll()
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
  const chartCandles = remoteCandles.length ? remoteCandles : buildCandles(current, selectedRange[2], chartRange)
  const firstCandle = chartCandles[0]
  const lastCandle = chartCandles[chartCandles.length - 1]
  const rangeOpen = firstCandle?.open || current?.price || 0
  const rangeClose = lastCandle?.close || current?.price || 0
  const rangeChange = rangeClose - rangeOpen
  const rangeChangeRate = rangeOpen ? (rangeChange / rangeOpen) * 100 : 0
  const rangeHigh = chartCandles.length ? Math.max(...chartCandles.map((c) => c.high)) : current?.high || 0
  const rangeLow = chartCandles.length ? Math.min(...chartCandles.map((c) => c.low)) : current?.low || 0
  const rangeVolume = chartCandles.reduce((sum, candle) => sum + candle.volume, 0)
  const hasRangeData = chartCandles.length > 0
  const chartMin = chartCandles.length ? Math.min(...chartCandles.map((c) => c.low)) : 0
  const chartMax = chartCandles.length ? Math.max(...chartCandles.map((c) => c.high)) : 0
  const chartValueRange = chartMax - chartMin || 1
  const maxVolume = chartCandles.length ? Math.max(...chartCandles.map((c) => c.volume)) || 1 : 1
  const priceTicks = [chartMax, chartMax - chartValueRange * 0.25, chartMax - chartValueRange * 0.5, chartMax - chartValueRange * 0.75, chartMin]
  const timeTicks = buildTimeTicks(chartRange, chartCandles.length)

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="back-link" href="/">← 놀이터</a>
        <div>
          <h1>📈 모의 투자</h1>
          <p>Twelve Data 시세 연동 · 주요 미국 종목 30개와 선택 종목 실시간 시세</p>
        </div>
        <button className="reward-btn" onClick={addActivityReward}>+ 활동 보상</button>
      </header>

      <main className="layout">
        <section className="hero-panel">
          <div><span className="eyebrow">총자산</span><strong>{money(portfolio.totalAsset)}</strong><p className={portfolio.profit >= 0 ? 'positive' : 'negative'}>{money(portfolio.profit)} · {percent(portfolio.profitRate)}</p></div>
          <div><span className="eyebrow">보유 현금</span><strong>{money(portfolio.cash)}</strong><p>지급 누적 {money(portfolio.rewardedAmount)}</p></div>
          <div><span className="eyebrow">투자 금액</span><strong>{money(portfolio.invested)}</strong><p>평가 금액 {money(portfolio.evaluated)}</p></div>
        </section>

        <nav className="tabs" aria-label="모의 투자 메뉴">
          {[
            ['dashboard', '대시보드'], ['stocks', '종목'], ['orders', '거래내역'], ['journal', '투자일지'], ['ranking', '랭킹'],
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
              <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="종목명, 티커, 업종 검색" />
              <div className="stock-list-meta">
                <strong>전체 종목</strong>
                <span>{stocks.length.toLocaleString('ko-KR')}개 표시</span>
              </div>
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
                <div><span>현재가</span><strong>{hasRangeData ? money(rangeClose) : '시세 선택 필요'}</strong></div>
                <div>
                  <span>{selectedRange[1]} 등락률</span>
                  <strong className={rangeChange >= 0 ? 'positive' : 'negative'}>{hasRangeData ? percent(rangeChangeRate) : '-'}</strong>
                  {hasRangeData && <small className={rangeChange >= 0 ? 'positive' : 'negative'}>{signedMoney(rangeChange)}</small>}
                </div>
                <div><span>{selectedRange[1]} 고가/저가</span><strong>{hasRangeData ? `${money(rangeHigh)} / ${money(rangeLow)}` : '-'}</strong></div>
                <div><span>{selectedRange[1]} 거래량</span><strong>{hasRangeData ? rangeVolume.toLocaleString('ko-KR') : '0'}</strong></div>
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
              <p className="description">{current.description}</p>
              <div className="trade-box">
                <label>주문 수량<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
                <div><span>예상 금액</span><strong>{money((current.price || 0) * Math.max(1, quantity || 1))}</strong></div>
                <button className="buy-btn" onClick={() => trade('buy')}>매수</button>
                <button className="sell-btn" onClick={() => trade('sell')}>매도</button>
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
      </main>
    </div>
  )
}

function buildCandles(stock: Stock | null | undefined, count: number, range: ChartRange) {
  if (!stock) return []
  const closePrice = stock.price || stock.points?.[stock.points.length - 1] || 0
  if (!closePrice) return []
  const periodRate = rangeTrendRate(stock, range)
  const denominator = 1 + periodRate / 100
  const startPrice = denominator > 0.05 ? closePrice / denominator : closePrice
  const trendWidth = Math.abs(closePrice - startPrice)
  const result: Array<{ open: number; high: number; low: number; close: number; volume: number }> = []
  const baseVolume = Math.max(1000, Number(stock.volume || 5000000))
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0 : index / (count - 1)
    const trendClose = startPrice + (closePrice - startPrice) * ratio
    const noise = index === 0 || index === count - 1
      ? 0
      : wave(index, stock.symbol) * (trendWidth * 0.18 + closePrice * 0.002)
    const close = Math.max(0.01, trendClose + noise)
    const previousClose = result[index - 1]?.close ?? startPrice
    const open = previousClose
    const spread = Math.max(close, open) * (0.006 + Math.abs(wave(index + 3, stock.symbol)) * 0.01)
    const high = Math.max(open, close) + spread
    const low = Math.max(0.01, Math.min(open, close) - spread)
    const volume = Math.round(baseVolume * (0.28 + Math.abs(wave(index + 7, stock.symbol)) * 0.72))
    result.push({ open, high, low, close, volume })
  }
  return result
}

function rangeTrendRate(stock: Stock, range: ChartRange) {
  const dailyRate = Number(stock.changeRate || 0)
  const multiplier: Record<ChartRange, number> = {
    '1D': 1,
    '1W': 3,
    '1M': 8,
    '6M': 18,
    '1Y': 30,
    '5Y': 60,
  }
  const rate = dailyRate * multiplier[range]
  return Math.max(-85, Math.min(220, rate))
}

function wave(index: number, symbol: string) {
  const seed = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return Math.sin(index * 1.73 + seed * 0.13)
}

function buildTimeTicks(range: ChartRange, count: number) {
  if (count === 0) return []
  const now = new Date()
  const labels = 5
  const step = Math.max(1, Math.floor((count - 1) / (labels - 1)))
  const indexes = Array.from({ length: labels }, (_, index) => Math.min(count - 1, index * step))
  indexes[indexes.length - 1] = count - 1
  return indexes.map((index) => {
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

export default App
