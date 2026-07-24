import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Phase = 'tokenize' | 'parse' | 'compile' | 'execute'
type Language = 'JavaScript' | 'Python' | 'Java'

type Step = {
  id: string
  line: number
  phase: Phase
  title: string
  detail: string
  stack: string[]
  output?: string
}

const sampleCode = `function sumScores(scores) {
  let total = 0
  for (const score of scores) {
    total += score
  }
  return total
}

const result = sumScores([82, 91, 77])
console.log("average", result / 3)`

const phaseLabel: Record<Phase, string> = {
  tokenize: '토큰화',
  parse: '구문 분석',
  compile: '컴파일',
  execute: '실행',
}

function detectLanguage(code: string): Language {
  if (/^\s*(def |import |print\()/m.test(code)) return 'Python'
  if (/public\s+class|System\.out\.println|static\s+void\s+main/.test(code)) return 'Java'
  return 'JavaScript'
}

function explainLine(lineText: string, language: Language) {
  const trimmed = lineText.trim()
  if (!trimmed) return '빈 줄입니다. 실행 위치만 다음 줄로 이동합니다.'
  if (/^(function|def |public |class )/.test(trimmed)) return '함수나 클래스의 이름, 매개변수, 블록 시작 위치를 등록합니다.'
  if (/^(for|while)\b/.test(trimmed)) return '반복 조건을 평가하고 반복 블록으로 진입할지 결정합니다.'
  if (/^(if|else if|else)\b/.test(trimmed)) return '분기 조건을 평가하고 실행할 블록을 선택합니다.'
  if (/return\b/.test(trimmed)) return '현재 함수의 반환값을 계산하고 호출한 위치로 돌아갑니다.'
  if (/console\.log|print\(|System\.out\.println/.test(trimmed)) return '콘솔 출력 값을 만들고 실행 결과 패널에 기록합니다.'
  if (/=/.test(trimmed)) return '오른쪽 표현식을 계산한 뒤 왼쪽 변수나 필드에 저장합니다.'
  if (language === 'Java' && /;/.test(trimmed)) return '문장을 바이트코드 명령으로 낮추고 다음 명령으로 이동합니다.'
  return '표현식을 평가하고 현재 스코프의 상태를 갱신합니다.'
}

function outputFromLine(lineText: string) {
  const quoted = lineText.match(/(?:console\.log|print|println)\((.*)\)/)
  if (!quoted) return undefined
  return quoted[1].replace(/^["'`]|["'`]$/g, '') || '콘솔 출력'
}

function buildSteps(code: string, selectedLanguage: Language): Step[] {
  const language = selectedLanguage || detectLanguage(code)
  const lines = code.split('\n')
  const meaningful = lines
    .map((text, index) => ({ text, line: index + 1 }))
    .filter(item => item.text.trim())

  const compileSteps: Step[] = [
    {
      id: 'tokenize',
      line: meaningful[0]?.line || 1,
      phase: 'tokenize',
      title: '문자를 토큰으로 분리',
      detail: '키워드, 변수명, 연산자, 괄호, 문자열을 컴파일러가 읽을 수 있는 단위로 나눕니다.',
      stack: ['source.ts'],
    },
    {
      id: 'parse',
      line: meaningful[0]?.line || 1,
      phase: 'parse',
      title: 'AST 생성',
      detail: '토큰을 트리 구조로 바꿔 함수, 반복문, 호출식의 부모-자식 관계를 만듭니다.',
      stack: ['parser', 'source.ts'],
    },
    {
      id: 'compile',
      line: meaningful.find(item => /function|def |class |const |let|var|=/.test(item.text))?.line || meaningful[0]?.line || 1,
      phase: 'compile',
      title: '중간 코드 생성',
      detail: `${language} 코드를 실행기가 처리할 명령 단위로 낮추고 변수 슬롯을 준비합니다.`,
      stack: ['compiler', 'parser', 'source.ts'],
    },
  ]

  const runSteps = meaningful.map((item, index) => {
    const stack = /return\b/.test(item.text)
      ? ['sumScores()', 'main']
      : /function|def |class /.test(item.text)
        ? ['declaration']
        : /for|while/.test(item.text)
          ? ['loop', 'main']
          : ['main']
    return {
      id: `run-${item.line}-${index}`,
      line: item.line,
      phase: 'execute' as Phase,
      title: `${item.line}번 줄 실행`,
      detail: explainLine(item.text, language),
      stack,
      output: outputFromLine(item.text),
    }
  })

  return [...compileSteps, ...runSteps]
}

function App() {
  const [code, setCode] = useState(sampleCode)
  const [language, setLanguage] = useState<Language>('JavaScript')
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(850)
  const [showHeat, setShowHeat] = useState(true)
  const steps = useMemo(() => buildSteps(code, language), [code, language])
  const active = steps[Math.min(activeIndex, steps.length - 1)]
  const lines = code.split('\n')
  const consoleOutput = steps.slice(0, activeIndex + 1).filter(step => step.output).map(step => step.output)

  useEffect(() => {
    setActiveIndex(0)
    setPlaying(false)
  }, [code, language])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setActiveIndex(current => {
        if (current >= steps.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [playing, speed, steps.length])

  function loadDemo(nextLanguage: Language) {
    setLanguage(nextLanguage)
    if (nextLanguage === 'Python') {
      setCode(`def average(scores):\n    total = 0\n    for score in scores:\n        total += score\n    return total / len(scores)\n\nresult = average([82, 91, 77])\nprint("average", result)`)
    } else if (nextLanguage === 'Java') {
      setCode(`public class Main {\n  public static void main(String[] args) {\n    int total = 0;\n    int[] scores = {82, 91, 77};\n    for (int score : scores) {\n      total += score;\n    }\n    System.out.println(total / 3);\n  }\n}`)
    } else {
      setCode(sampleCode)
    }
  }

  return (
    <div className="app-shell">
      <aside className="side-panel">
        <a className="home-link" href="/">Playground</a>
        <div>
          <span className="eyebrow">Code Run Visualizer</span>
          <h1>코드가 실행되는 장면을 줄 단위로 보여줍니다</h1>
        </div>
        <div className="control-group">
          <label>언어</label>
          <div className="segmented">
            {(['JavaScript', 'Python', 'Java'] as Language[]).map(item => (
              <button className={language === item ? 'active' : ''} key={item} onClick={() => loadDemo(item)}>{item}</button>
            ))}
          </div>
        </div>
        <div className="control-group">
          <label>속도 {speed}ms</label>
          <input type="range" min="250" max="1600" step="50" value={speed} onChange={event => setSpeed(Number(event.target.value))} />
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={showHeat} onChange={event => setShowHeat(event.target.checked)} />
          실행된 줄 흐름 표시
        </label>
        <div className="run-buttons">
          <button onClick={() => setPlaying(value => !value)}>{playing ? '일시정지' : '재생'}</button>
          <button onClick={() => setActiveIndex(index => Math.max(0, index - 1))}>이전 줄</button>
          <button onClick={() => setActiveIndex(index => Math.min(steps.length - 1, index + 1))}>다음 줄</button>
          <button onClick={() => setActiveIndex(0)}>처음</button>
        </div>
      </aside>

      <main className="workspace">
        <section className="editor-pane">
          <div className="pane-header">
            <strong>입력 코드</strong>
            <span>{lines.length} lines</span>
          </div>
          <div className="code-editor">
            <textarea value={code} onChange={event => setCode(event.target.value)} spellCheck={false} />
            <div className="code-preview" aria-hidden>
              {lines.map((line, index) => {
                const lineNumber = index + 1
                const passed = showHeat && steps.slice(0, activeIndex + 1).some(step => step.line === lineNumber)
                return (
                  <div className={`code-line ${active?.line === lineNumber ? 'active' : ''} ${passed ? 'passed' : ''}`} key={`${lineNumber}-${line}`}>
                    <span>{lineNumber}</span>
                    <code>{line || ' '}</code>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="runtime-pane">
          <div className="stage-card current">
            <div className="phase-chip">{phaseLabel[active?.phase || 'tokenize']}</div>
            <h2>{active?.title || '대기 중'}</h2>
            <p>{active?.detail || '코드를 입력하고 재생을 누르세요.'}</p>
            <div className="progress-track">
              <div style={{ width: `${((activeIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
            </div>
          </div>
          <div className="runtime-grid">
            <article className="stage-card">
              <h3>컴파일 타임라인</h3>
              <div className="timeline">
                {steps.map((step, index) => (
                  <button className={index === activeIndex ? 'active' : index < activeIndex ? 'done' : ''} key={step.id} onClick={() => setActiveIndex(index)}>
                    <span>{phaseLabel[step.phase]}</span>
                    <strong>{step.title}</strong>
                  </button>
                ))}
              </div>
            </article>
            <article className="stage-card">
              <h3>콜스택</h3>
              <div className="stack-list">
                {(active?.stack || ['main']).map(frame => <span key={frame}>{frame}</span>)}
              </div>
              <h3>콘솔</h3>
              <div className="console-box">
                {consoleOutput.length ? consoleOutput.map((item, index) => <p key={`${item}-${index}`}>{item}</p>) : <p>출력 대기 중</p>}
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
