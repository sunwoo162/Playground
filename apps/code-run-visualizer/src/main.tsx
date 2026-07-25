import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
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

const phaseNodes: Phase[] = ['tokenize', 'parse', 'compile', 'execute']

type ExpressionFrame = {
  label: string
  expression: string
  focus: string
  note: string
}

type FeatureBlock = {
  id: string
  kind: 'input' | 'function' | 'loop' | 'condition' | 'calculation' | 'return' | 'output'
  title: string
  value: string
  detail: string
}

type StructureKind = 'array' | 'queue' | 'stack' | 'tree'

type StructureModel = {
  kind: StructureKind
  title: string
  items: string[]
  activeItem: string
  operation: string
}

type CompileResult = {
  ok: boolean
  checkedUntilLine: number
  errorLine?: number
  message: string
  fix: string
}

type RuntimeResult = {
  ok: boolean
  language: Language
  outputs: string[]
  values: Record<string, string>
  errorLine?: number
  error?: string
}

type CompletionItem = {
  label: string
  insert: string
  detail: string
}

const completions: Record<Language, CompletionItem[]> = {
  JavaScript: [
    { label: 'console.log', insert: 'console.log($1)', detail: '콘솔 출력' },
    { label: 'function', insert: 'function $1() {\n  $2\n}', detail: '함수 선언' },
    { label: 'for', insert: 'for (const item of $1) {\n  $2\n}', detail: '반복문' },
    { label: 'if', insert: 'if ($1) {\n  $2\n}', detail: '조건문' },
    { label: 'return', insert: 'return $1', detail: '값 반환' },
    { label: 'const', insert: 'const $1 = $2', detail: '상수 선언' },
    { label: 'let', insert: 'let $1 = $2', detail: '변수 선언' },
  ],
  Python: [
    { label: 'print', insert: 'print($1)', detail: '콘솔 출력' },
    { label: 'def', insert: 'def $1():\n    $2', detail: '함수 선언' },
    { label: 'for', insert: 'for item in $1:\n    $2', detail: '반복문' },
    { label: 'if', insert: 'if $1:\n    $2', detail: '조건문' },
    { label: 'return', insert: 'return $1', detail: '값 반환' },
  ],
  Java: [
    { label: 'sout', insert: 'System.out.println($1);', detail: '콘솔 출력' },
    { label: 'main', insert: 'public static void main(String[] args) {\n  $1\n}', detail: 'main 함수' },
    { label: 'for', insert: 'for (int i = 0; i < $1; i++) {\n  $2\n}', detail: '반복문' },
    { label: 'if', insert: 'if ($1) {\n  $2\n}', detail: '조건문' },
    { label: 'return', insert: 'return $1;', detail: '값 반환' },
  ],
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

function tokensFromLine(lineText: string) {
  return lineText
    .trim()
    .split(/(\s+|[()[\]{}.,;:+\-*/=<>])/)
    .map(token => token.trim())
    .filter(Boolean)
    .slice(0, 9)
}

function memoryCells(lineText: string, activeIndex: number, runtime: RuntimeResult) {
  const trimmed = lineText.trim()
  const variableMatch = trimmed.match(/(?:const|let|var|int|String|double|float)?\s*([a-zA-Z_$][\w$]*)\s*=/)
  const valueMatch = trimmed.match(/=\s*(.+?);?$/)
  const primary = variableMatch?.[1] || (/total/.test(trimmed) ? 'total' : /score/.test(trimmed) ? 'score' : 'result')
  const runtimeEntries = Object.entries(runtime.values).slice(0, 2).map(([key, value]) => ({ key, value }))
  return [
    { key: primary, value: runtime.values[primary] || valueMatch?.[1]?.replace(/[;{}]/g, '').trim() || 'pending' },
    ...runtimeEntries.filter(item => item.key !== primary),
    { key: 'line', value: String(activeIndex + 1) },
  ].slice(0, 3)
}

function normalizeExpression(lineText: string) {
  const trimmed = lineText.trim().replace(/;$/, '')
  const callMatch = trimmed.match(/(?:console\.log|print|System\.out\.println)\((.*)\)$/)
  if (callMatch) return callMatch[1]
  const returnMatch = trimmed.match(/^return\s+(.+)$/)
  if (returnMatch) return returnMatch[1]
  const assignmentMatch = trimmed.match(/=\s*(.+)$/)
  if (assignmentMatch) return assignmentMatch[1]
  return trimmed
}

function evaluateSimpleExpression(expression: string) {
  const numeric = expression
  if (!/^[\d\s+\-*/().]+$/.test(numeric)) return null
  try {
    const value = Function(`"use strict"; return (${numeric})`)()
    return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : null
  } catch {
    return null
  }
}

function substituteRuntimeValues(expression: string, values: Record<string, string>) {
  return Object.entries(values).reduce((next, [key, value]) => {
    if (!/^-?\d+(\.\d+)?$/.test(value)) return next
    return next.replace(new RegExp(`\\b${key}\\b`, 'g'), value)
  }, expression)
}

function expressionFrames(lineText: string, activeIndex: number, runtime: RuntimeResult): ExpressionFrame[] {
  const expression = normalizeExpression(lineText)
  const tokens = tokensFromLine(expression)
  const substituted = runtime.ok ? substituteRuntimeValues(expression, runtime.values) : expression
  const hasOperator = /[+\-*/]/.test(expression)
  const priorityMatch = substituted.match(/(\d+(?:\.\d+)?)\s*([*/])\s*(\d+(?:\.\d+)?)/)
  const priorityValue = priorityMatch
    ? String(Math.round(Function(`"use strict"; return (${priorityMatch[0]})`)() * 1000) / 1000)
    : null
  const result = evaluateSimpleExpression(substituted)
  const frames: ExpressionFrame[] = [
    {
      label: '1. 식 선택',
      expression,
      focus: tokens[0] || expression || 'source',
      note: '현재 줄에서 실제로 계산되는 식만 뽑습니다.',
    },
    {
      label: '2. 토큰 분해',
      expression: tokens.join('  '),
      focus: tokens[Math.min(activeIndex % Math.max(tokens.length, 1), Math.max(tokens.length - 1, 0))] || expression,
      note: '변수, 숫자, 연산자, 괄호를 계산 단위로 나눕니다.',
    },
    {
      label: '3. 값 대입',
      expression: substituted,
      focus: substituted !== expression ? '변수 -> 실제 값' : '리터럴 유지',
      note: runtime.ok ? '방금 실제 실행에서 얻은 변수 값을 식 안으로 넣습니다.' : '실행 실패 상태라 대입 가능한 실제 값이 없습니다.',
    },
  ]
  if (hasOperator) {
    frames.push({
      label: '4. 우선순위 계산',
      expression: priorityMatch && priorityValue ? substituted.replace(priorityMatch[0], priorityValue) : substituted,
      focus: priorityMatch?.[0] || '왼쪽부터 평가',
      note: priorityMatch ? '곱셈/나눗셈을 먼저 줄입니다.' : '우선순위가 같은 연산은 왼쪽에서 오른쪽으로 계산합니다.',
    })
  }
  frames.push({
    label: `${hasOperator ? '5' : '4'}. 결과`,
    expression: result || substituted || expression,
    focus: result || '결과 후보',
    note: '줄 실행이 끝나면 이 값이 변수 저장, return, console 출력으로 전달됩니다.',
  })
  return frames
}

function buildFeatureBlocks(code: string, runtime: RuntimeResult): FeatureBlock[] {
  const blocks: FeatureBlock[] = []
  const arrayMatch = code.match(/\[([\d,\s.-]+)\]/)
  const functionMatch = code.match(/function\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)/) || code.match(/def\s+([a-zA-Z_][\w]*)\s*\(([^)]*)\)/)
  const loopMatch = code.match(/\bfor\b[^{:\n]*[{:]?/)
  const conditionMatch = code.match(/\bif\s*\(([^)]*)\)|\bif\s+([^:]+):/)
  const calcMatch = code.match(/([a-zA-Z_$][\w$]*)\s*([+\-*/]?=)\s*([^;\n]+)/)
  const returnMatch = code.match(/\breturn\s+([^;\n]+)/)
  const outputMatch = code.match(/(console\.log|print|System\.out\.println)\(([^)]*)\)/)
  const resultValue = runtime.outputs[0] || Object.values(runtime.values)[0] || 'result'

  if (arrayMatch) {
    blocks.push({ id: 'input', kind: 'input', title: '입력 데이터', value: `[${arrayMatch[1].trim()}]`, detail: '처음 들어오는 값 묶음' })
  } else {
    blocks.push({ id: 'input', kind: 'input', title: '입력', value: 'source', detail: '코드에서 시작 값 생성' })
  }
  if (functionMatch) {
    blocks.push({ id: 'function', kind: 'function', title: functionMatch[1], value: functionMatch[2] || 'args', detail: '값을 받아 처리할 기능 단위' })
  }
  if (loopMatch) {
    blocks.push({ id: 'loop', kind: 'loop', title: '반복 처리', value: arrayMatch ? arrayMatch[1].split(',').map(item => item.trim()).filter(Boolean).join(' -> ') : 'items', detail: '데이터를 하나씩 꺼내 같은 계산 반복' })
  }
  if (conditionMatch) {
    blocks.push({ id: 'condition', kind: 'condition', title: '조건 분기', value: conditionMatch[1] || conditionMatch[2] || 'condition', detail: '조건 결과에 따라 흐름 선택' })
  }
  if (calcMatch) {
    blocks.push({ id: 'calculation', kind: 'calculation', title: '계산/저장', value: `${calcMatch[1]} ${calcMatch[2]} ${calcMatch[3].trim()}`, detail: '중간 값을 갱신' })
  }
  if (returnMatch) {
    blocks.push({ id: 'return', kind: 'return', title: '반환', value: substituteRuntimeValues(returnMatch[1].trim(), runtime.values), detail: '계산 결과를 호출 위치로 전달' })
  }
  if (outputMatch) {
    blocks.push({ id: 'output', kind: 'output', title: '화면 출력', value: resultValue, detail: '사용자가 보는 최종 결과' })
  } else {
    blocks.push({ id: 'output', kind: 'output', title: '결과', value: resultValue, detail: '실행이 끝난 뒤 남는 값' })
  }
  return blocks
}

function buildStructureModel(code: string, activeIndex: number): StructureModel {
  const arrayMatch = code.match(/\[([\d,\s.'"a-zA-Z_-]+)\]/)
  const items = arrayMatch
    ? arrayMatch[1].split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    : ['A', 'B', 'C']
  const lower = code.toLowerCase()
  const activeItem = items[Math.min(items.length - 1, activeIndex % Math.max(items.length, 1))] || 'item'
  if (/queue|enqueue|dequeue|shift\(/.test(lower)) {
    return { kind: 'queue', title: 'Queue', items, activeItem, operation: activeIndex % 2 ? 'dequeue' : 'enqueue' }
  }
  if (/stack|push\(|pop\(/.test(lower)) {
    return { kind: 'stack', title: 'Stack', items, activeItem, operation: activeIndex % 2 ? 'pop' : 'push' }
  }
  if (/tree|node|left|right|dfs|bfs/.test(lower)) {
    return { kind: 'tree', title: 'Tree Traversal', items: items.slice(0, 7), activeItem, operation: /bfs/.test(lower) ? 'BFS' : 'DFS' }
  }
  return { kind: 'array', title: 'Array Iteration', items, activeItem, operation: /for|while/.test(lower) ? 'iterate' : 'read' }
}

function wordAtCursor(value: string, cursor: number) {
  const before = value.slice(0, cursor)
  const match = before.match(/[a-zA-Z_$][\w$.:]*$/)
  return match?.[0] || ''
}

function indentationBeforeCursor(value: string, cursor: number) {
  const lineStart = value.lastIndexOf('\n', cursor - 1) + 1
  return value.slice(lineStart, cursor).match(/^\s*/)?.[0] || ''
}

function cleanSnippet(snippet: string) {
  const markerIndex = snippet.indexOf('$1')
  const withoutMarkers = snippet.replace(/\$1|\$2/g, '')
  const cursorOffset = markerIndex === -1 ? withoutMarkers.length : markerIndex
  return { text: withoutMarkers, cursorOffset }
}

function compileCheck(code: string, language: Language): CompileResult {
  const lines = code.split('\n')
  const stack: { char: string; line: number }[] = []
  let quoteChar = ''
  let quoteLine = 0
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const closing = new Set(Object.values(pairs))

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex]
      const previous = line[charIndex - 1]
      if ((char === '"' || char === "'" || char === '`') && previous !== '\\') {
        if (quoteChar === char) {
          quoteChar = ''
          quoteLine = 0
        } else if (!quoteChar) {
          quoteChar = char
          quoteLine = lineIndex + 1
        }
        continue
      }
      if (quoteChar) continue
      if (pairs[char]) {
        stack.push({ char, line: lineIndex + 1 })
      } else if (closing.has(char)) {
        const last = stack.pop()
        if (!last || pairs[last.char] !== char) {
          return {
            ok: false,
            checkedUntilLine: lineIndex,
            errorLine: lineIndex + 1,
            message: `${char} 닫는 기호가 맞는 여는 기호 없이 나왔습니다.`,
            fix: '바로 앞 식의 괄호/중괄호/대괄호 쌍을 확인하고 불필요한 닫는 기호를 지우세요.',
          }
        }
      }
    }
    const trimmed = line.trim()
    if (language === 'Python' && /^(def|if|for|while|elif|else)\b/.test(trimmed) && !trimmed.endsWith(':')) {
      return {
        ok: false,
        checkedUntilLine: lineIndex,
        errorLine: lineIndex + 1,
        message: 'Python 블록 문장 끝에 : 이 없습니다.',
        fix: `${lineIndex + 1}번 줄 끝에 : 를 붙이고 다음 줄을 들여쓰기 하세요.`,
      }
    }
    if (language === 'Java' && trimmed && !/[{};:]$/.test(trimmed) && !/^(public|class|for|if|else|while)\b/.test(trimmed)) {
      return {
        ok: false,
        checkedUntilLine: lineIndex,
        errorLine: lineIndex + 1,
        message: 'Java 문장이 세미콜론으로 끝나지 않았습니다.',
        fix: `${lineIndex + 1}번 줄 끝에 ; 를 추가하세요.`,
      }
    }
  }

  if (quoteChar) {
    return {
      ok: false,
      checkedUntilLine: quoteLine - 1,
      errorLine: quoteLine,
      message: `${quoteChar} 문자열이 닫히지 않았습니다.`,
      fix: `${quoteLine}번 줄의 문자열 끝에 ${quoteChar} 를 추가하세요.`,
    }
  }
  if (stack.length) {
    const last = stack[stack.length - 1]
    return {
      ok: false,
      checkedUntilLine: last.line - 1,
      errorLine: last.line,
      message: `${last.char} 여는 기호가 닫히지 않았습니다.`,
      fix: `${last.line}번 줄 이후에 ${pairs[last.char]} 를 추가해 블록이나 식을 닫으세요.`,
    }
  }

  return {
    ok: true,
    checkedUntilLine: lines.length,
    message: '컴파일 검사 통과. 실행 애니메이션을 재생할 수 있습니다.',
    fix: '현재 문법 검사에서 발견된 문제는 없습니다.',
  }
}

function captureDeclaredNames(code: string) {
  const names = Array.from(code.matchAll(/\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)/g)).map(match => match[1])
  return Array.from(new Set(names)).slice(0, 12)
}

function runJavaScript(code: string): RuntimeResult {
  const outputs: string[] = []
  const values: Record<string, string> = {}
  const names = captureDeclaredNames(code)
  try {
    const captureCode = names
      .map(name => `try { __values[${JSON.stringify(name)}] = String(${name}); } catch {}`)
      .join('\n')
    Function('console', '__values', `"use strict";\n${code}\n${captureCode}`)(
      {
        log: (...args: unknown[]) => outputs.push(args.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')),
      },
      values,
    )
    return { ok: true, language: 'JavaScript', outputs, values }
  } catch (error) {
    const message = error instanceof Error ? error.message : '실행 중 알 수 없는 오류가 발생했습니다.'
    const lineMatch = message.match(/<anonymous>:(\d+):\d+/)
    const rawLine = lineMatch ? Math.max(1, Number(lineMatch[1]) - 2) : undefined
    return { ok: false, language: 'JavaScript', outputs, values, errorLine: rawLine, error: message }
  }
}

function runCode(code: string, language: Language): RuntimeResult {
  if (language === 'JavaScript') return runJavaScript(code)
  return {
    ok: true,
    language,
    outputs: [],
    values: {},
    error: `${language}는 현재 브라우저에서 실제 런타임 실행이 아니라 문법 검사와 과정 시뮬레이션으로 표시됩니다.`,
  }
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
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const [code, setCode] = useState(sampleCode)
  const [language, setLanguage] = useState<Language>('JavaScript')
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(850)
  const [showHeat, setShowHeat] = useState(true)
  const [cursor, setCursor] = useState(0)
  const [compileResult, setCompileResult] = useState<CompileResult>(() => compileCheck(sampleCode, 'JavaScript'))
  const [runtimeResult, setRuntimeResult] = useState<RuntimeResult>(() => runCode(sampleCode, 'JavaScript'))
  const [askedToVisualize, setAskedToVisualize] = useState(false)
  const [visualizing, setVisualizing] = useState(false)
  const steps = useMemo(() => buildSteps(code, language), [code, language])
  const active = steps[Math.min(activeIndex, steps.length - 1)]
  const lines = code.split('\n')
  const consoleOutput = runtimeResult.outputs.length ? runtimeResult.outputs : steps.slice(0, activeIndex + 1).filter(step => step.output).map(step => step.output)
  const activeLineText = lines[(active?.line || 1) - 1] || ''
  const activeTokens = tokensFromLine(activeLineText)
  const activePhasePosition = Math.max(0, phaseNodes.indexOf(active?.phase || 'tokenize'))
  const memory = memoryCells(activeLineText, activeIndex, runtimeResult)
  const frames = expressionFrames(activeLineText, activeIndex, runtimeResult)
  const activeFrameIndex = Math.min(frames.length - 1, Math.max(0, activeIndex % Math.max(frames.length, 1)))
  const activeFrame = frames[activeFrameIndex]
  const featureBlocks = useMemo(() => buildFeatureBlocks(code, runtimeResult), [code, runtimeResult])
  const activeFeatureIndex = Math.min(featureBlocks.length - 1, activeIndex % Math.max(featureBlocks.length, 1))
  const activeFeature = featureBlocks[activeFeatureIndex] || featureBlocks[0]
  const structure = useMemo(() => buildStructureModel(code, activeIndex), [activeIndex, code])
  const currentWord = wordAtCursor(code, cursor)
  const suggestions = completions[language]
    .filter(item => currentWord ? item.label.toLowerCase().startsWith(currentWord.toLowerCase()) : true)
    .slice(0, 5)

  useEffect(() => {
    setActiveIndex(0)
    setPlaying(false)
    setAskedToVisualize(false)
    setVisualizing(false)
    const nextCompile = compileCheck(code, language)
    setCompileResult(nextCompile)
    setRuntimeResult(nextCompile.ok ? runCode(code, language) : { ok: false, language, outputs: [], values: {}, errorLine: nextCompile.errorLine, error: nextCompile.message })
  }, [code, language])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setActiveIndex(current => {
        if (current >= featureBlocks.length - 1) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [featureBlocks.length, playing, speed])

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

  function runCompileAndPlay() {
    const result = compileCheck(code, language)
    setCompileResult(result)
    setVisualizing(false)
    if (result.ok) {
      const runtime = runCode(code, language)
      setRuntimeResult(runtime)
      if (!runtime.ok) {
        setPlaying(false)
        setAskedToVisualize(false)
        setActiveIndex(Math.max(0, steps.findIndex(step => step.line === runtime.errorLine)))
        return
      }
      setActiveIndex(0)
      setPlaying(false)
      setAskedToVisualize(true)
      return
    }
    setPlaying(false)
    setAskedToVisualize(false)
    const failedStepIndex = steps.findIndex(step => step.line === result.errorLine)
    setActiveIndex(Math.max(0, failedStepIndex === -1 ? result.checkedUntilLine - 1 : failedStepIndex))
  }

  function startVisualization() {
    setActiveIndex(0)
    setVisualizing(true)
    setAskedToVisualize(false)
    setPlaying(true)
  }

  function updateEditor(nextCode: string, nextCursor: number) {
    setCode(nextCode)
    window.requestAnimationFrame(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(nextCursor, nextCursor)
      setCursor(nextCursor)
    })
  }

  function insertAtCursor(insert: string, replaceLength = 0) {
    const element = editorRef.current
    if (!element) return
    const start = element.selectionStart
    const end = element.selectionEnd
    const from = Math.max(0, start - replaceLength)
    const { text, cursorOffset } = cleanSnippet(insert)
    updateEditor(`${code.slice(0, from)}${text}${code.slice(end)}`, from + cursorOffset)
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget
    const start = element.selectionStart
    const selected = code.slice(element.selectionStart, element.selectionEnd)
    if (event.key === 'Tab') {
      event.preventDefault()
      const word = wordAtCursor(code, start)
      const completion = completions[language].find(item => item.label.toLowerCase().startsWith(word.toLowerCase()))
      if (completion && word) {
        insertAtCursor(completion.insert, word.length)
      } else {
        insertAtCursor('  ')
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const indent = indentationBeforeCursor(code, start)
      const previousChar = code[start - 1]
      const extra = previousChar === '{' || previousChar === ':' ? '  ' : ''
      insertAtCursor(`\n${indent}${extra}`)
      return
    }
    const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' }
    if (pairs[event.key]) {
      event.preventDefault()
      const close = pairs[event.key]
      if (selected) {
        const wrapped = `${event.key}${selected}${close}`
        updateEditor(`${code.slice(0, element.selectionStart)}${wrapped}${code.slice(element.selectionEnd)}`, element.selectionStart + wrapped.length)
      } else {
        updateEditor(`${code.slice(0, start)}${event.key}${close}${code.slice(element.selectionEnd)}`, start + 1)
      }
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
          <button onClick={playing ? () => setPlaying(false) : runCompileAndPlay}>{playing ? '일시정지' : '컴파일 후 실행'}</button>
          <button onClick={() => setActiveIndex(index => Math.max(0, index - 1))}>이전 줄</button>
          <button onClick={() => setActiveIndex(index => Math.min(steps.length - 1, index + 1))}>다음 줄</button>
          <button onClick={() => setActiveIndex(0)}>처음</button>
        </div>
        <div className={`compile-status ${compileResult.ok ? 'ok' : 'error'}`}>
          <strong>{compileResult.ok ? '컴파일 통과' : `${compileResult.errorLine}번 줄 에러`}</strong>
          <p>{compileResult.message}</p>
        </div>
      </aside>

      <main className="workspace">
        <section className="editor-pane">
          <div className="pane-header">
            <strong>입력 코드</strong>
            <span>Tab 자동완성 · {lines.length} lines</span>
          </div>
          <div className="completion-bar">
            {suggestions.map((item, index) => (
              <button type="button" key={item.label} onClick={() => insertAtCursor(item.insert, currentWord.length)}>
                <strong>{item.label}</strong>
                <span>{index === 0 ? 'Tab' : item.detail}</span>
              </button>
            ))}
          </div>
          <div className="code-editor">
            <textarea
              ref={editorRef}
              value={code}
              onChange={event => {
                setCode(event.target.value)
                setCursor(event.target.selectionStart)
              }}
              onClick={event => setCursor(event.currentTarget.selectionStart)}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={event => setCursor(event.currentTarget.selectionStart)}
              spellCheck={false}
            />
            <div className="code-preview" aria-hidden>
              {lines.map((line, index) => {
                const lineNumber = index + 1
                const passed = showHeat && steps.slice(0, activeIndex + 1).some(step => step.line === lineNumber)
                const failed = (!compileResult.ok && compileResult.errorLine === lineNumber) || (!runtimeResult.ok && runtimeResult.errorLine === lineNumber)
                const checked = !compileResult.ok && lineNumber <= compileResult.checkedUntilLine
                return (
                  <div className={`code-line ${active?.line === lineNumber ? 'active' : ''} ${passed || checked ? 'passed' : ''} ${failed ? 'failed' : ''}`} key={`${lineNumber}-${line}`}>
                    <span>{lineNumber}</span>
                    <code>{line || ' '}</code>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="runtime-pane">
          <section className={`result-card ${runtimeResult.ok ? 'ok' : 'error'}`}>
            <div>
              <span>{runtimeResult.language === 'JavaScript' ? '실제 실행 결과' : '시뮬레이션 결과'}</span>
              <strong>{runtimeResult.ok ? runtimeResult.outputs[0] || '출력 없이 실행 완료' : runtimeResult.error}</strong>
            </div>
            <div className="result-values">
              {Object.entries(runtimeResult.values).length ? Object.entries(runtimeResult.values).map(([key, value]) => (
                <code key={key}>{key} = {value}</code>
              )) : <code>{runtimeResult.language === 'JavaScript' ? 'captured variables 없음' : '브라우저 실제 실행 미지원'}</code>}
            </div>
            {askedToVisualize && runtimeResult.ok && (
              <div className="visualize-question">
                <strong>이 코드가 어떻게 동작했는지 볼까요?</strong>
                <p>실제 실행으로 나온 값이 식에 대입되고, 연산이 줄어들어 결과가 되는 과정을 단계별로 보여줍니다.</p>
                <div>
                  <button type="button" onClick={startVisualization}>작동 방식 보기</button>
                  <button type="button" onClick={() => setAskedToVisualize(false)}>결과만 볼게요</button>
                </div>
              </div>
            )}
          </section>
          <section className={`cinema-stage ${visualizing ? 'visualizing' : 'waiting'}`}>
            <div className="stage-topline">
              <span>{visualizing ? 'STEP BY STEP' : 'WAITING'}</span>
              <strong>{visualizing ? `${activeFeature?.title || '기능'} 흐름` : '작동 방식 보기 버튼을 누르면 시작합니다'}</strong>
            </div>
            <div className="motion-field" key={active?.id}>
              <div className="flow-stage" key={`${activeFeature?.id}-${activeFeatureIndex}`}>
                <div className="flow-lane">
                  {featureBlocks.map((block, index) => (
                    <div className={`feature-node ${block.kind} ${index === activeFeatureIndex ? 'active' : index < activeFeatureIndex ? 'done' : ''}`} key={block.id}>
                      <span>{index + 1}</span>
                      <strong>{block.title}</strong>
                    </div>
                  ))}
                  <div className="data-packet" style={{ left: `${featureBlocks.length <= 1 ? 50 : 8 + activeFeatureIndex * (84 / (featureBlocks.length - 1))}%` }}>
                    {activeFeature?.value}
                  </div>
                </div>
                <div className={`feature-spotlight ${activeFeature?.kind}`}>
                  <span>{activeFeature?.kind}</span>
                  <strong>{activeFeature?.title}</strong>
                  <code>{activeFeature?.value}</code>
                  <p>{activeFeature?.detail}</p>
                </div>
                <div className={`structure-view ${structure.kind}`}>
                  <div className="structure-title">
                    <span>{structure.title}</span>
                    <strong>{structure.operation}</strong>
                  </div>
                  {structure.kind === 'stack' ? (
                    <div className="stack-visual">
                      {structure.items.map((item, index) => (
                        <div className={item === structure.activeItem ? 'active' : ''} key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  ) : structure.kind === 'tree' ? (
                    <div className="tree-visual">
                      {structure.items.map((item, index) => (
                        <div className={`tree-node node-${index} ${item === structure.activeItem ? 'active' : ''}`} key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  ) : (
                    <div className={`linear-visual ${structure.kind}`}>
                      {structure.items.map((item, index) => (
                        <div className={item === structure.activeItem ? 'active' : ''} key={`${item}-${index}`}>{item}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="reel-dots">
                {featureBlocks.map((block, index) => (
                  <button className={index === activeFeatureIndex ? 'active' : index < activeFeatureIndex ? 'done' : ''} type="button" onClick={() => setActiveIndex(index)} key={block.id}>
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="reel-memory">
                {memory.map(cell => <code key={`${cell.key}-${cell.value}`}>{cell.key}: {cell.value}</code>)}
              </div>
            </div>
          </section>
          <div className="stage-card current">
            <div className={`phase-chip ${compileResult.ok && runtimeResult.ok ? '' : 'error'}`}>{!compileResult.ok ? '컴파일 실패' : !runtimeResult.ok ? '실행 실패' : phaseLabel[active?.phase || 'tokenize']}</div>
            <h2>{compileResult.ok && runtimeResult.ok ? active?.title || '대기 중' : `${compileResult.errorLine || runtimeResult.errorLine || active?.line}번 줄에서 멈춤`}</h2>
            <p>{compileResult.ok ? runtimeResult.ok ? active?.detail || '코드를 입력하고 재생을 누르세요.' : runtimeResult.error : compileResult.message}</p>
            {(!compileResult.ok || !runtimeResult.ok) && (
              <div className="fix-panel">
                <strong>수정 제안</strong>
                <p>{compileResult.ok ? '실행 중 에러 메시지를 기준으로 변수 이름, 함수 호출, 잘못된 값 접근을 확인하세요.' : compileResult.fix}</p>
              </div>
            )}
            <div className="progress-track">
              <div className={compileResult.ok ? '' : 'error'} style={{ width: `${((activeIndex + 1) / Math.max(steps.length, 1)) * 100}%` }} />
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
