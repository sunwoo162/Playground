import { useMemo, useState } from 'react'

type Stock = {
  symbol: string
  name: string
  price: number
  changeRate: number
  volume: number
  marketCap: number
  sector: string
  high: number
  low: number
  description: string
  points: number[]
}

type Holding = {
  symbol: string
  quantity: number
  averagePrice: number
}

type Order = {
  id: string
  type: 'BUY' | 'SELL'
  symbol: string
  name: string
  quantity: number
  price: number
  createdAt: string
}

type Journal = {
  id: string
  symbol: string
  title: string
  content: string
  result: string
  createdAt: string
}

type Portfolio = {
  cash: number
  rewarded: number
  holdings: Holding[]
  orders: Order[]
  watchlist: string[]
  journals: Journal[]
}

type Tab = 'dashboard' | 'stocks' | 'orders' | 'journal' | 'ranking'

const STORAGE_KEY = 'mock-invest-portfolio-v1'
const INITIAL_CASH = 10_000_000
const ACTIVITY_REWARD = 250_000

const STOCKS: Stock[] = [
  {
    symbol: '005930',
    name: '삼성전자',
    price: 72500,
    changeRate: 1.24,
    volume: 12345678,
    marketCap: 432_000_000_000_000,
    sector: '반도체',
    high: 73000,
    low: 71800,
    description: '메모리 반도체와 모바일 기기를 중심으로 글로벌 사업을 운영합니다.',
    points: [67600, 68800, 70200, 69500, 71000, 71800, 72500],
  },
  {
    symbol: '000660',
    name: 'SK하이닉스',
    price: 232000,
    changeRate: 2.38,
    volume: 3210450,
    marketCap: 168_900_000_000_000,
    sector: '반도체',
    high: 235500,
    low: 225000,
    description: 'DRAM과 NAND를 중심으로 AI 반도체 수요의 영향을 크게 받습니다.',
    points: [211000, 216000, 219500, 224000, 228000, 229500, 232000],
  },
  {
    symbol: '035420',
    name: 'NAVER',
    price: 188500,
    changeRate: -0.64,
    volume: 842310,
    marketCap: 30_600_000_000_000,
    sector: '플랫폼',
    high: 191000,
    low: 186000,
    description: '검색, 커머스, 콘텐츠, 클라우드 서비스를 제공하는 플랫폼 기업입니다.',
    points: [193000, 191500, 190000, 192000, 189500, 187500, 188500],
  },
  {
    symbol: '035720',
    name: '카카오',
    price: 49200,
    changeRate: -1.12,
    volume: 1567800,
    marketCap: 21_800_000_000_000,
    sector: '플랫폼',
    high: 50500,
    low: 48800,
    description: '메신저, 콘텐츠, 모빌리티, 금융 서비스를 연결하는 생활 플랫폼입니다.',
    points: [51600, 50900, 50300, 49800, 50100, 49400, 49200],
  },
  {
    symbol: '005380',
    name: '현대차',
    price: 267500,
    changeRate: 0.92,
    volume: 765400,
    marketCap: 56_000_000_000_000,
    sector: '자동차',
    high: 270000,
    low: 263000,
    description: '완성차, 전기차, 수소차, 모빌리티 서비스를 확장하는 자동차 기업입니다.',
    points: [254000, 257500, 259000, 263000, 266000, 265000, 267500],
  },
  {
    symbol: '068270',
    name: '셀트리온',
    price: 184000,
    changeRate: 1.73,
    volume: 521900,
    marketCap: 40_100_000_000_000,
    sector: '바이오',
    high: 186500,
    low: 179500,
    description: '바이오시밀러와 의약품 개발, 생산, 판매를 수행합니다.',
    points: [171000, 174000, 176500, 180000, 181000, 183000, 184000],
  },
]

const RANKING = [
  { rank: 1, nickname: '차트장인', asset: 12480000, profitRate: 24.8 },
  { rank: 2, nickname: '분산투자러', asset: 11890000, profitRate: 18.9 },
  { rank: 3, nickname: '장기보유', asset: 11230000, profitRate: 12.3 },
]

function defaultPortfolio(): Portfolio {
  return {
    cash: INITIAL_CASH,
    rewarded: INITIAL_CASH,
    holdings: [],
    orders: [],
    watchlist: ['005930', '000660'],
    journals: [],
  }
}

function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultPortfolio(), ...JSON.parse(raw) } : defaultPortfolio()
  } catch {
    return defaultPortfolio()
  }
}

function savePortfolio(data: Portfolio) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function money(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function percent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function findStock(symbol: string) {
  return STOCKS.find((stock) => stock.symbol === symbol)
}

function App() {
  const [portfolio, setPortfolio] = useState<Portfolio>(loadPortfolio)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [query, setQuery] = useState('')
  const [selectedSymbol, setSelectedSymbol] = useState(STOCKS[0].symbol)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState('')
  const [journalTitle, setJournalTitle] = useState('')
  const [journalContent, setJournalContent] = useState('')
  const [journalResult, setJournalResult] = useState('')

  const selectedStock = findStock(selectedSymbol) || STOCKS[0]
  const filteredStocks = STOCKS.filter((stock) =>
    `${stock.name} ${stock.symbol} ${stock.sector}`.toLowerCase().includes(query.toLowerCase()),
  )

  const holdings = useMemo(() => portfolio.holdings.map((holding) => {
    const stock = findStock(holding.symbol)
    const currentPrice = stock?.price || holding.averagePrice
    const invested = holding.averagePrice * holding.quantity
    const evaluated = currentPrice * holding.quantity
    const profit = evaluated - invested
    return {
      ...holding,
      name: stock?.name || holding.symbol,
      currentPrice,
      invested,
      evaluated,
      profit,
      profitRate: invested > 0 ? (profit / invested) * 100 : 0,
    }
  }), [portfolio.holdings])

  const invested = holdings.reduce((sum, holding) => sum + holding.invested, 0)
  const evaluated = holdings.reduce((sum, holding) => sum + holding.evaluated, 0)
  const totalAsset = portfolio.cash + evaluated
  const profit = totalAsset - portfolio.rewarded
  const profitRate = portfolio.rewarded > 0 ? (profit / portfolio.rewarded) * 100 : 0

  const commitPortfolio = (next: Portfolio, nextMessage: string) => {
    setPortfolio(next)
    savePortfolio(next)
    setMessage(nextMessage)
  }

  const addActivityReward = () => {
    commitPortfolio(
      { ...portfolio, cash: portfolio.cash + ACTIVITY_REWARD, rewarded: portfolio.rewarded + ACTIVITY_REWARD },
      `놀이터 활동 보상 ${money(ACTIVITY_REWARD)}이 지급됐습니다.`,
    )
  }

  const buy = () => {
    const qty = Math.floor(quantity)
    if (qty < 1) return setMessage('주문 수량은 최소 1주 이상이어야 합니다.')
    const cost = selectedStock.price * qty
    if (portfolio.cash < cost) return setMessage('보유 현금이 부족합니다.')

    const existing = portfolio.holdings.find((holding) => holding.symbol === selectedStock.symbol)
    const nextHoldings = existing
      ? portfolio.holdings.map((holding) => {
          if (holding.symbol !== selectedStock.symbol) return holding
          const totalQty = holding.quantity + qty
          return {
            ...holding,
            quantity: totalQty,
            averagePrice: ((holding.averagePrice * holding.quantity) + cost) / totalQty,
          }
        })
      : [...portfolio.holdings, { symbol: selectedStock.symbol, quantity: qty, averagePrice: selectedStock.price }]

    const order: Order = {
      id: crypto.randomUUID(),
      type: 'BUY',
      symbol: selectedStock.symbol,
      name: selectedStock.name,
      quantity: qty,
      price: selectedStock.price,
      createdAt: new Date().toISOString(),
    }

    commitPortfolio(
      { ...portfolio, cash: portfolio.cash - cost, holdings: nextHoldings, orders: [order, ...portfolio.orders] },
      `${selectedStock.name} ${qty}주 매수 완료`,
    )
  }

  const sell = () => {
    const qty = Math.floor(quantity)
    if (qty < 1) return setMessage('주문 수량은 최소 1주 이상이어야 합니다.')
    const existing = portfolio.holdings.find((holding) => holding.symbol === selectedStock.symbol)
    if (!existing || existing.quantity < qty) return setMessage('보유 수량이 부족합니다.')

    const nextHoldings = portfolio.holdings
      .map((holding) => holding.symbol === selectedStock.symbol ? { ...holding, quantity: holding.quantity - qty } : holding)
      .filter((holding) => holding.quantity > 0)

    const order: Order = {
      id: crypto.randomUUID(),
      type: 'SELL',
      symbol: selectedStock.symbol,
      name: selectedStock.name,
      quantity: qty,
      price: selectedStock.price,
      createdAt: new Date().toISOString(),
    }

    commitPortfolio(
      { ...portfolio, cash: portfolio.cash + selectedStock.price * qty, holdings: nextHoldings, orders: [order, ...portfolio.orders] },
      `${selectedStock.name} ${qty}주 매도 완료`,
    )
  }

  const toggleWatch = (symbol: string) => {
    const watchlist = portfolio.watchlist.includes(symbol)
      ? portfolio.watchlist.filter((item) => item !== symbol)
      : [...portfolio.watchlist, symbol]
    commitPortfolio({ ...portfolio, watchlist }, '관심 종목을 업데이트했습니다.')
  }

  const addJournal = () => {
    if (!journalTitle.trim() || !journalContent.trim()) return setMessage('투자 일지 제목과 투자 이유를 입력해주세요.')
    const journal: Journal = {
      id: crypto.randomUUID(),
      symbol: selectedStock.symbol,
      title: journalTitle.trim(),
      content: journalContent.trim(),
      result: journalResult.trim() || '결과 기록 전',
      createdAt: new Date().toISOString(),
    }
    commitPortfolio({ ...portfolio, journals: [journal, ...portfolio.journals] }, '투자 일지를 저장했습니다.')
    setJournalTitle('')
    setJournalContent('')
    setJournalResult('')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="back-link" href="/">← 놀이터</a>
        <div>
          <h1>📈 모의 투자</h1>
          <p>실제 돈 없이 가상 자산으로 투자 판단을 연습하세요</p>
        </div>
        <button className="reward-btn" onClick={addActivityReward}>+ 활동 보상</button>
      </header>

      <main className="layout">
        <section className="hero-panel">
          <div>
            <span className="eyebrow">총자산</span>
            <strong>{money(totalAsset)}</strong>
            <p className={profit >= 0 ? 'positive' : 'negative'}>
              {money(profit)} · {percent(profitRate)}
            </p>
          </div>
          <div>
            <span className="eyebrow">보유 현금</span>
            <strong>{money(portfolio.cash)}</strong>
            <p>지급 누적 {money(portfolio.rewarded)}</p>
          </div>
          <div>
            <span className="eyebrow">투자 금액</span>
            <strong>{money(invested)}</strong>
            <p>평가 금액 {money(evaluated)}</p>
          </div>
        </section>

        <nav className="tabs" aria-label="모의 투자 메뉴">
          {[
            ['dashboard', '대시보드'],
            ['stocks', '종목'],
            ['orders', '거래내역'],
            ['journal', '투자일지'],
            ['ranking', '랭킹'],
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as Tab)}>
              {label}
            </button>
          ))}
        </nav>

        {message && <p className="status-line">{message}</p>}

        {tab === 'dashboard' && (
          <div className="content-grid">
            <section className="panel wide">
              <div className="panel-header">
                <h2>포트폴리오</h2>
                <span>{holdings.length}개 보유</span>
              </div>
              {holdings.length === 0 ? (
                <p className="empty">아직 보유 종목이 없습니다. 종목 탭에서 첫 매수를 해보세요.</p>
              ) : (
                <div className="table-list">
                  {holdings.map((holding) => (
                    <button key={holding.symbol} className="row-button" onClick={() => { setSelectedSymbol(holding.symbol); setTab('stocks') }}>
                      <span>
                        <strong>{holding.name}</strong>
                        <small>{holding.symbol} · {holding.quantity}주 · 평균 {money(holding.averagePrice)}</small>
                      </span>
                      <span className={holding.profit >= 0 ? 'positive' : 'negative'}>
                        {money(holding.evaluated)}
                        <small>{money(holding.profit)} · {percent(holding.profitRate)}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>관심 종목</h2>
              </div>
              <div className="watch-list">
                {portfolio.watchlist.map((symbol) => {
                  const stock = findStock(symbol)
                  if (!stock) return null
                  return (
                    <button key={symbol} onClick={() => { setSelectedSymbol(symbol); setTab('stocks') }}>
                      <span>{stock.name}</span>
                      <strong>{money(stock.price)}</strong>
                      <small className={stock.changeRate >= 0 ? 'positive' : 'negative'}>{percent(stock.changeRate)}</small>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        )}

        {tab === 'stocks' && (
          <div className="content-grid">
            <section className="panel stock-list-panel">
              <input
                className="search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="종목명, 티커, 업종 검색"
              />
              <div className="stock-list">
                {filteredStocks.map((stock) => (
                  <button
                    key={stock.symbol}
                    className={selectedStock.symbol === stock.symbol ? 'selected' : ''}
                    onClick={() => setSelectedSymbol(stock.symbol)}
                  >
                    <span>
                      <strong>{stock.name}</strong>
                      <small>{stock.symbol} · {stock.sector}</small>
                    </span>
                    <span className={stock.changeRate >= 0 ? 'positive' : 'negative'}>{percent(stock.changeRate)}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel wide">
              <div className="stock-detail">
                <div>
                  <h2>{selectedStock.name}</h2>
                  <p>{selectedStock.symbol} · {selectedStock.sector}</p>
                </div>
                <button className="ghost-btn" onClick={() => toggleWatch(selectedStock.symbol)}>
                  {portfolio.watchlist.includes(selectedStock.symbol) ? '★ 관심 해제' : '☆ 관심 등록'}
                </button>
              </div>

              <div className="quote-grid">
                <div><span>현재가</span><strong>{money(selectedStock.price)}</strong></div>
                <div><span>등락률</span><strong className={selectedStock.changeRate >= 0 ? 'positive' : 'negative'}>{percent(selectedStock.changeRate)}</strong></div>
                <div><span>고가/저가</span><strong>{money(selectedStock.high)} / {money(selectedStock.low)}</strong></div>
                <div><span>거래량</span><strong>{selectedStock.volume.toLocaleString('ko-KR')}</strong></div>
              </div>

              <div className="chart" aria-label="최근 가격 흐름">
                {selectedStock.points.map((point, index) => {
                  const min = Math.min(...selectedStock.points)
                  const max = Math.max(...selectedStock.points)
                  const height = max === min ? 40 : 20 + ((point - min) / (max - min)) * 80
                  return <span key={`${point}-${index}`} style={{ height: `${height}%` }} title={money(point)} />
                })}
              </div>
              <p className="description">{selectedStock.description}</p>

              <div className="trade-box">
                <label>
                  주문 수량
                  <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
                </label>
                <div>
                  <span>예상 금액</span>
                  <strong>{money(selectedStock.price * Math.max(1, quantity || 1))}</strong>
                </div>
                <button className="buy-btn" onClick={buy}>매수</button>
                <button className="sell-btn" onClick={sell}>매도</button>
              </div>
            </section>
          </div>
        )}

        {tab === 'orders' && (
          <section className="panel wide full">
            <div className="panel-header">
              <h2>거래 내역</h2>
              <span>{portfolio.orders.length}건</span>
            </div>
            {portfolio.orders.length === 0 ? <p className="empty">거래 내역이 없습니다.</p> : (
              <div className="table-list">
                {portfolio.orders.map((order) => (
                  <div className="row-button static" key={order.id}>
                    <span>
                      <strong>{order.type === 'BUY' ? '매수' : '매도'} · {order.name}</strong>
                      <small>{new Date(order.createdAt).toLocaleString('ko-KR')} · {order.quantity}주</small>
                    </span>
                    <span>
                      {money(order.price * order.quantity)}
                      <small>{money(order.price)}</small>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'journal' && (
          <div className="content-grid">
            <section className="panel">
              <h2>투자 일지 작성</h2>
              <label>
                종목
                <select value={selectedSymbol} onChange={(event) => setSelectedSymbol(event.target.value)}>
                  {STOCKS.map((stock) => <option key={stock.symbol} value={stock.symbol}>{stock.name}</option>)}
                </select>
              </label>
              <label>
                제목
                <input value={journalTitle} onChange={(event) => setJournalTitle(event.target.value)} placeholder="AI 수요 증가 기대" />
              </label>
              <label>
                투자 이유
                <textarea value={journalContent} onChange={(event) => setJournalContent(event.target.value)} placeholder="매수하거나 관심 등록한 이유" />
              </label>
              <label>
                결과
                <textarea value={journalResult} onChange={(event) => setJournalResult(event.target.value)} placeholder="결과나 회고" />
              </label>
              <button className="primary-btn" onClick={addJournal}>일지 저장</button>
            </section>

            <section className="panel wide">
              <div className="panel-header">
                <h2>투자 일지</h2>
                <span>{portfolio.journals.length}개</span>
              </div>
              {portfolio.journals.length === 0 ? <p className="empty">작성한 투자 일지가 없습니다.</p> : (
                <div className="journal-list">
                  {portfolio.journals.map((journal) => (
                    <article key={journal.id}>
                      <span>{findStock(journal.symbol)?.name || journal.symbol} · {new Date(journal.createdAt).toLocaleDateString('ko-KR')}</span>
                      <h3>{journal.title}</h3>
                      <p>{journal.content}</p>
                      <small>{journal.result}</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === 'ranking' && (
          <section className="panel wide full">
            <div className="panel-header">
              <h2>수익률 랭킹</h2>
              <span>학습용 지표</span>
            </div>
            <div className="ranking-list">
              {[...RANKING, { rank: 4, nickname: '나', asset: totalAsset, profitRate }].sort((a, b) => b.profitRate - a.profitRate).map((item, index) => (
                <div key={item.nickname} className={item.nickname === '나' ? 'me' : ''}>
                  <strong>{index + 1}</strong>
                  <span>{item.nickname}</span>
                  <span>{money(item.asset)}</span>
                  <span className={item.profitRate >= 0 ? 'positive' : 'negative'}>{percent(item.profitRate)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
