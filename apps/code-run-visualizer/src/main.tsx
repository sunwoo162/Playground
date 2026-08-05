import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

localStorage.removeItem('playground-theme')
document.documentElement.dataset.theme = 'dark'

type Phase = 'tokenize' | 'parse' | 'compile' | 'execute'
type Language = 'JavaScript' | 'Python' | 'Java'
type SortAlgorithm = 'community' | 'selection' | 'insertion' | 'quick' | 'merge' | 'heap' | 'linearSearch' | 'binarySearch'

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
const algorithmList: SortAlgorithm[] = ['community', 'selection', 'insertion', 'quick', 'merge', 'heap', 'linearSearch', 'binarySearch']
const WORKSPACE_KEY = 'code-run-visualizer-workspace'
const algorithmNames: Record<SortAlgorithm, string> = {
  community: '버블 정렬 (Bubble Sort)',
  selection: '선택 정렬 (Selection Sort)',
  insertion: '삽입 정렬 (Insertion Sort)',
  quick: '퀵 정렬 (Quick Sort)',
  merge: '병합 정렬 (Merge Sort)',
  heap: '힙 정렬 (Heap Sort)',
  linearSearch: '선형 탐색 (Linear Search)',
  binarySearch: '이진 탐색 (Binary Search)',
}

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

type SortStep = {
  array: number[]
  compare: number[]
  active: number[]
  sorted: number[]
  lifted?: number
  line: number
  action: string
  comparisons: number
  swaps: number
}

const sortCode: Record<SortAlgorithm, string[]> = {
  community: [
    'for i from 0 to n - 1',
    '  for j from 0 to n - i - 2',
    '    compare a[j], a[j + 1]',
    '    if a[j] > a[j + 1]',
    '      swap a[j], a[j + 1]',
  ],
  selection: [
    'for i from 0 to n - 1',
    '  min = i',
    '  for j from i + 1 to n',
    '    compare a[j] with a[min]',
    '    if a[j] < a[min], min = j',
    '  swap a[i], a[min]',
  ],
  insertion: [
    'for i from 1 to n - 1',
    '  key = a[i]',
    '  while j >= 0 and a[j] > key',
    '    shift a[j] right',
    '  insert key at j + 1',
  ],
  quick: [
    'choose pivot',
    'partition values around pivot',
    '  compare current with pivot',
    '  swap into lower partition',
    'recurse left and right',
  ],
  merge: [
    'split array in half',
    'sort left half',
    'sort right half',
    'merge smaller values first',
    'write merged result',
  ],
  heap: [
    'build max heap',
    'compare parent and child',
    'swap largest to parent',
    'move root to sorted tail',
    'heapify remaining range',
  ],
  linearSearch: [
    'target value 준비',
    'for each index',
    '  compare item with target',
    '  if same, stop',
    'not found after full scan',
  ],
  binarySearch: [
    'left = 0, right = n - 1',
    'mid = floor((left + right) / 2)',
    'compare a[mid] with target',
    'move left or right boundary',
    'found target or stop',
  ],
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

const sortSamples: Record<SortAlgorithm, string> = {
  community: `const arr = [42, 18, 67, 9, 55, 31, 74]

for (let i = 0; i < arr.length; i++) {
  for (let j = 0; j < arr.length - i - 1; j++) {
    if (arr[j] > arr[j + 1]) {
      const temp = arr[j]
      arr[j] = arr[j + 1]
      arr[j + 1] = temp
    }
  }
}

console.log(arr.join(", "))`,
  selection: `const arr = [42, 18, 67, 9, 55, 31, 74]

for (let i = 0; i < arr.length; i++) {
  let min = i
  for (let j = i + 1; j < arr.length; j++) {
    if (arr[j] < arr[min]) {
      min = j
    }
  }
  const temp = arr[i]
  arr[i] = arr[min]
  arr[min] = temp
}

console.log(arr.join(", "))`,
  insertion: `const arr = [42, 18, 67, 9, 55, 31, 74]

for (let i = 1; i < arr.length; i++) {
  const key = arr[i]
  let j = i - 1
  while (j >= 0 && arr[j] > key) {
    arr[j + 1] = arr[j]
    j--
  }
  arr[j + 1] = key
}

console.log(arr.join(", "))`,
  quick: `const arr = [42, 18, 67, 9, 55, 31, 74]
const pivot = arr[arr.length - 1]

for (let i = 0; i < arr.length - 1; i++) {
  if (arr[i] < pivot) {
    console.log("lower", arr[i])
  }
}

console.log("pivot", pivot)`,
  merge: `const arr = [42, 18, 67, 9, 55, 31, 74]
const mid = Math.floor(arr.length / 2)
const left = arr.slice(0, mid)
const right = arr.slice(mid)

console.log("split", left.length, right.length)`,
  heap: `const arr = [42, 18, 67, 9, 55, 31, 74]

function heapify(items, root) {
  const left = root * 2 + 1
  const right = root * 2 + 2
  console.log("children", left, right)
}

heapify(arr, 0)`,
  linearSearch: `const arr = [42, 18, 67, 9, 55, 31, 74]
const target = 55

for (let i = 0; i < arr.length; i++) {
  if (arr[i] === target) {
    console.log("found", i)
    break
  }
}`,
  binarySearch: `const arr = [9, 18, 31, 42, 55, 67, 74]
const target = 55
let left = 0
let right = arr.length - 1

while (left <= right) {
  const mid = Math.floor((left + right) / 2)
  if (arr[mid] === target) break
  if (arr[mid] < target) left = mid + 1
  else right = mid - 1
}`,
}

function sortSampleFor(algorithm: SortAlgorithm, selectedLanguage: Language) {
  const list = algorithm === 'binarySearch' ? '9, 18, 31, 42, 55, 67, 74' : '42, 18, 67, 9, 55, 31, 74'
  if (selectedLanguage === 'JavaScript') return sortSamples[algorithm]
  if (selectedLanguage === 'Python') {
    if (algorithm === 'linearSearch') return `arr = [${list}]\ntarget = 55\n\nfor i, value in enumerate(arr):\n    if value == target:\n        print("found", i)\n        break`
    if (algorithm === 'binarySearch') return `arr = [${list}]\ntarget = 55\nleft = 0\nright = len(arr) - 1\n\nwhile left <= right:\n    mid = (left + right) // 2\n    if arr[mid] == target:\n        break\n    if arr[mid] < target:\n        left = mid + 1\n    else:\n        right = mid - 1`
    if (algorithm === 'quick') return `arr = [${list}]\npivot = arr[-1]\n\nfor value in arr[:-1]:\n    if value < pivot:\n        print("lower", value)\n\nprint("pivot", pivot)`
    if (algorithm === 'merge') return `arr = [${list}]\nmid = len(arr) // 2\nleft = arr[:mid]\nright = arr[mid:]\n\nprint("split", len(left), len(right))`
    if (algorithm === 'heap') return `arr = [${list}]\nroot = 0\nleft = root * 2 + 1\nright = root * 2 + 2\n\nprint("children", left, right)`
    if (algorithm === 'selection') return `arr = [${list}]\n\nfor i in range(len(arr)):\n    min_index = i\n    for j in range(i + 1, len(arr)):\n        if arr[j] < arr[min_index]:\n            min_index = j\n    arr[i], arr[min_index] = arr[min_index], arr[i]\n\nprint(arr)`
    if (algorithm === 'insertion') return `arr = [${list}]\n\nfor i in range(1, len(arr)):\n    key = arr[i]\n    j = i - 1\n    while j >= 0 and arr[j] > key:\n        arr[j + 1] = arr[j]\n        j -= 1\n    arr[j + 1] = key\n\nprint(arr)`
    return `arr = [${list}]\n\nfor i in range(len(arr)):\n    for j in range(0, len(arr) - i - 1):\n        if arr[j] > arr[j + 1]:\n            arr[j], arr[j + 1] = arr[j + 1], arr[j]\n\nprint(arr)`
  }
  const javaList = `{${list}}`
  if (algorithm === 'linearSearch') return `public class Main {\n  public static void main(String[] args) {\n    int[] arr = ${javaList};\n    int target = 55;\n    for (int i = 0; i < arr.length; i++) {\n      if (arr[i] == target) System.out.println(i);\n    }\n  }\n}`
  if (algorithm === 'binarySearch') return `public class Main {\n  public static void main(String[] args) {\n    int[] arr = ${javaList};\n    int target = 55;\n    int left = 0, right = arr.length - 1;\n    while (left <= right) {\n      int mid = (left + right) / 2;\n      if (arr[mid] == target) break;\n      if (arr[mid] < target) left = mid + 1; else right = mid - 1;\n    }\n  }\n}`
  return `public class Main {\n  public static void main(String[] args) {\n    int[] arr = ${javaList};\n    System.out.println(arr.length);\n  }\n}`
}

function replaceNumberList(code: string, values: number[]) {
  const csv = values.join(', ')
  if (/\[[\d,\s.-]+\]/.test(code)) return code.replace(/\[[\d,\s.-]+\]/, `[${csv}]`)
  if (/\{[\d,\s.-]+\}/.test(code)) return code.replace(/\{[\d,\s.-]+\}/, `{${csv}}`)
  return `${code}\n// values = [${csv}]`
}

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

function pushSortStep(steps: SortStep[], step: Omit<SortStep, 'array'> & { array: number[] }) {
  steps.push({ ...step, array: [...step.array], compare: [...step.compare], active: [...step.active], sorted: [...step.sorted] })
}

function buildSortSteps(source: number[], algorithm: SortAlgorithm): SortStep[] {
  const arr = algorithm === 'binarySearch' ? [...source].sort((a, b) => a - b) : [...source]
  const steps: SortStep[] = []
  let comparisons = 0
  let swaps = 0
  pushSortStep(steps, { array: arr, compare: [], active: [], sorted: [], line: 1, action: '초기 배열 준비', comparisons, swaps })

  if (algorithm === 'linearSearch') {
    const target = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.65))] ?? arr[0]
    for (let i = 0; i < arr.length; i += 1) {
      comparisons += 1
      pushSortStep(steps, { array: arr, compare: [i], active: [], sorted: arr.slice(0, i).map((_, index) => index), line: 3, action: `${i}번 값 ${arr[i]} 와 target ${target} 비교`, comparisons, swaps })
      if (arr[i] === target) {
        pushSortStep(steps, { array: arr, compare: [], active: [i], sorted: arr.slice(0, i + 1).map((_, index) => index), line: 4, action: `${i}번 위치에서 target 발견`, comparisons, swaps })
        return steps
      }
    }
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: 'target 없음', comparisons, swaps })
    return steps
  }

  if (algorithm === 'binarySearch') {
    const target = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.65))] ?? arr[0]
    let left = 0
    let right = arr.length - 1
    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      comparisons += 1
      pushSortStep(steps, { array: arr, compare: [mid], active: [left, right], sorted: [], line: 3, action: `mid ${mid}: ${arr[mid]} 와 target ${target} 비교`, comparisons, swaps })
      if (arr[mid] === target) {
        pushSortStep(steps, { array: arr, compare: [], active: [mid], sorted: [mid], line: 5, action: `target ${target} 발견`, comparisons, swaps })
        return steps
      }
      if (arr[mid] < target) left = mid + 1
      else right = mid - 1
      pushSortStep(steps, { array: arr, compare: [], active: [left, right].filter(index => index >= 0 && index < arr.length), sorted: [], line: 4, action: `탐색 범위를 ${left}~${right} 로 좁힘`, comparisons, swaps })
    }
    return steps
  }

  if (algorithm === 'quick') {
    const partition = (left: number, right: number) => {
      if (left >= right) return
      const pivot = arr[right]
      let wall = left
      pushSortStep(steps, { array: arr, compare: [], active: [right], sorted: [], line: 1, action: `pivot ${pivot} 선택`, comparisons, swaps })
      for (let i = left; i < right; i += 1) {
        comparisons += 1
        pushSortStep(steps, { array: arr, compare: [i], active: [right, wall], sorted: [], line: 3, action: `${arr[i]} 와 pivot ${pivot} 비교`, comparisons, swaps })
        if (arr[i] < pivot) {
          ;[arr[i], arr[wall]] = [arr[wall], arr[i]]
          swaps += 1
          pushSortStep(steps, { array: arr, compare: [i, wall], active: [right], sorted: [], line: 4, action: `pivot보다 작은 값을 왼쪽 구역으로 이동`, comparisons, swaps })
          wall += 1
        }
      }
      ;[arr[wall], arr[right]] = [arr[right], arr[wall]]
      swaps += 1
      pushSortStep(steps, { array: arr, compare: [wall, right], active: [wall], sorted: [wall], line: 5, action: `pivot을 최종 위치 ${wall}에 배치`, comparisons, swaps })
      partition(left, wall - 1)
      partition(wall + 1, right)
    }
    partition(0, arr.length - 1)
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: '정렬 완료', comparisons, swaps })
    return steps
  }

  if (algorithm === 'merge') {
    const sorted = [...arr].sort((a, b) => a - b)
    pushSortStep(steps, { array: arr, compare: [0, Math.floor(arr.length / 2)], active: [], sorted: [], line: 1, action: '배열을 왼쪽/오른쪽 절반으로 분할', comparisons, swaps })
    sorted.forEach((value, index) => {
      comparisons += 1
      arr[index] = value
      swaps += 1
      pushSortStep(steps, { array: arr, compare: [index], active: [index], sorted: arr.slice(0, index + 1).map((_, sortedIndex) => sortedIndex), line: 4, action: `가장 작은 남은 값 ${value} 병합`, comparisons, swaps })
    })
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: '정렬 완료', comparisons, swaps })
    return steps
  }

  if (algorithm === 'heap') {
    const heapify = (size: number, root: number) => {
      let largest = root
      const left = root * 2 + 1
      const right = root * 2 + 2
      ;[left, right].forEach(child => {
        if (child < size) {
          comparisons += 1
          pushSortStep(steps, { array: arr, compare: [largest, child], active: [root], sorted: arr.slice(size).map((_, index) => size + index), line: 2, action: `부모 ${arr[largest]} 와 자식 ${arr[child]} 비교`, comparisons, swaps })
          if (arr[child] > arr[largest]) largest = child
        }
      })
      if (largest !== root) {
        ;[arr[root], arr[largest]] = [arr[largest], arr[root]]
        swaps += 1
        pushSortStep(steps, { array: arr, compare: [root, largest], active: [root], sorted: arr.slice(size).map((_, index) => size + index), line: 3, action: `큰 자식을 부모 자리로 올림`, comparisons, swaps })
        heapify(size, largest)
      }
    }
    for (let i = Math.floor(arr.length / 2) - 1; i >= 0; i -= 1) heapify(arr.length, i)
    for (let end = arr.length - 1; end > 0; end -= 1) {
      ;[arr[0], arr[end]] = [arr[end], arr[0]]
      swaps += 1
      pushSortStep(steps, { array: arr, compare: [0, end], active: [0], sorted: arr.slice(end).map((_, index) => end + index), line: 4, action: `루트 최대값을 정렬 영역으로 이동`, comparisons, swaps })
      heapify(end, 0)
    }
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: '정렬 완료', comparisons, swaps })
    return steps
  }

  if (algorithm === 'selection') {
    for (let i = 0; i < arr.length; i += 1) {
      let min = i
      pushSortStep(steps, { array: arr, compare: [], active: [i], sorted: arr.slice(0, i).map((_, index) => index), line: 2, action: `현재 위치 ${i}, 최소값 후보 선택`, comparisons, swaps })
      for (let j = i + 1; j < arr.length; j += 1) {
        comparisons += 1
        pushSortStep(steps, { array: arr, compare: [j, min], active: [min], sorted: arr.slice(0, i).map((_, index) => index), line: 4, action: `${arr[j]} 와 현재 최소 ${arr[min]} 비교`, comparisons, swaps })
        if (arr[j] < arr[min]) {
          min = j
          pushSortStep(steps, { array: arr, compare: [j], active: [min], sorted: arr.slice(0, i).map((_, index) => index), line: 5, action: `새 최소값 ${arr[min]} 발견`, comparisons, swaps })
        }
      }
      if (min !== i) {
        ;[arr[i], arr[min]] = [arr[min], arr[i]]
        swaps += 1
        pushSortStep(steps, { array: arr, compare: [i, min], active: [i], sorted: arr.slice(0, i + 1).map((_, index) => index), line: 6, action: `${i}번 위치와 최소값 위치 swap`, comparisons, swaps })
      }
    }
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 6, action: '정렬 완료', comparisons, swaps })
    return steps
  }

  if (algorithm === 'insertion') {
    for (let i = 1; i < arr.length; i += 1) {
      const key = arr[i]
      let j = i - 1
      pushSortStep(steps, { array: arr, compare: [i], active: [i], sorted: arr.slice(0, i).map((_, index) => index), lifted: i, line: 2, action: `${key} 값을 들어 올림`, comparisons, swaps })
      while (j >= 0 && arr[j] > key) {
        comparisons += 1
        arr[j + 1] = arr[j]
        swaps += 1
        pushSortStep(steps, { array: arr, compare: [j, j + 1], active: [j], sorted: [], lifted: j + 1, line: 4, action: `${arr[j]} 를 오른쪽으로 밀기`, comparisons, swaps })
        j -= 1
      }
      if (j >= 0) comparisons += 1
      arr[j + 1] = key
      pushSortStep(steps, { array: arr, compare: [j + 1], active: [j + 1], sorted: arr.slice(0, i + 1).map((_, index) => index), line: 5, action: `${key} 를 알맞은 위치에 삽입`, comparisons, swaps })
    }
    pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: '정렬 완료', comparisons, swaps })
    return steps
  }

  for (let i = 0; i < arr.length; i += 1) {
    for (let j = 0; j < arr.length - i - 1; j += 1) {
      comparisons += 1
      pushSortStep(steps, { array: arr, compare: [j, j + 1], active: [j, j + 1], sorted: arr.slice(arr.length - i).map((_, index) => arr.length - i + index), line: 3, action: `${arr[j]} 와 ${arr[j + 1]} 비교`, comparisons, swaps })
      if (arr[j] > arr[j + 1]) {
        ;[arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]
        swaps += 1
        pushSortStep(steps, { array: arr, compare: [j, j + 1], active: [j, j + 1], sorted: arr.slice(arr.length - i).map((_, index) => arr.length - i + index), line: 5, action: `큰 값을 오른쪽으로 이동`, comparisons, swaps })
      }
    }
  }
  pushSortStep(steps, { array: arr, compare: [], active: [], sorted: arr.map((_, index) => index), line: 5, action: '정렬 완료', comparisons, swaps })
  return steps
}

function extractNumbersFromCode(code: string) {
  const arrayMatch = code.match(/\[([\d,\s.-]+)\]/) || code.match(/\{([\d,\s.-]+)\}/)
  if (!arrayMatch) return [42, 18, 67, 9, 55, 31, 74]
  const parsed = arrayMatch[1]
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value))
  return parsed.length ? parsed.slice(0, 12) : [42, 18, 67, 9, 55, 31, 74]
}

function detectSortAlgorithm(code: string): SortAlgorithm {
  const lower = code.toLowerCase()
  if (/binarysearch|binary search|left\s*=|right\s*=|mid\s*=|target/.test(lower) && /mid|right/.test(lower)) return 'binarySearch'
  if (/linearsearch|linear search|target/.test(lower)) return 'linearSearch'
  if (/heap|heapify|largest|root\s*\*/.test(lower)) return 'heap'
  if (/merge|slice|left\s*=.*slice|right\s*=.*slice|split/.test(lower)) return 'merge'
  if (/quick|pivot|partition|wall/.test(lower)) return 'quick'
  if (/insertion|key\s*=|while\s*\([^)]*>\s*key|while\s+j\s*>=/.test(lower)) return 'insertion'
  if (/selection|min\s*=|minindex|minimum/.test(lower)) return 'selection'
  return 'community'
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
  const importRef = useRef<HTMLInputElement | null>(null)
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
  const [sortIndex, setSortIndex] = useState(0)
  const [workspaceStatus, setWorkspaceStatus] = useState('')
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
  const detectedSortAlgorithm = useMemo(() => detectSortAlgorithm(code), [code])
  const detectedSortValues = useMemo(() => extractNumbersFromCode(code), [code])
  const sortSteps = useMemo(() => buildSortSteps(detectedSortValues, detectedSortAlgorithm), [detectedSortAlgorithm, detectedSortValues])
  const sortStep = sortSteps[Math.min(sortIndex, sortSteps.length - 1)]
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
    try {
      const raw = localStorage.getItem(WORKSPACE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (typeof saved.code === 'string') setCode(saved.code)
      if (['JavaScript', 'Python', 'Java'].includes(saved.language)) setLanguage(saved.language)
      if (typeof saved.speed === 'number') setSpeed(saved.speed)
      if (typeof saved.showHeat === 'boolean') setShowHeat(saved.showHeat)
      setWorkspaceStatus('이전 작업 상태를 불러왔습니다.')
    } catch {
      setWorkspaceStatus('저장된 작업 상태를 읽지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ code, language, speed, showHeat, updatedAt: new Date().toISOString() }))
  }, [code, language, speed, showHeat])

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setActiveIndex(current => {
        if (current >= sortSteps.length - 1) {
          setPlaying(false)
          return current
        }
        setSortIndex(current + 1)
        return current + 1
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [playing, sortSteps.length, speed])

  function loadDemo(nextLanguage: Language) {
    setLanguage(nextLanguage)
    setCode(sortSampleFor(detectedSortAlgorithm, nextLanguage))
    setSortIndex(0)
    setActiveIndex(0)
    setPlaying(false)
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
    setSortIndex(0)
    setVisualizing(true)
    setAskedToVisualize(false)
    setPlaying(true)
  }

  function randomizeSortValues() {
    const values = Array.from({ length: 7 }, () => 8 + Math.floor(Math.random() * 72))
    setCode(replaceNumberList(sortSampleFor(detectedSortAlgorithm, language), values))
    setSortIndex(0)
    setActiveIndex(0)
    setPlaying(false)
    setVisualizing(false)
  }

  function exportWorkspace() {
    const payload = {
      app: 'code-run-visualizer',
      version: 1,
      exportedAt: new Date().toISOString(),
      code,
      language,
      speed,
      showHeat,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `code-run-visualizer-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    setWorkspaceStatus('작업 파일을 내보냈습니다.')
  }

  async function importWorkspace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const payload = JSON.parse(await file.text())
      if (payload?.app !== 'code-run-visualizer' || payload?.version !== 1 || typeof payload?.code !== 'string') {
        throw new Error('code-run-visualizer 작업 파일이 아닙니다.')
      }
      setCode(payload.code)
      if (['JavaScript', 'Python', 'Java'].includes(payload.language)) setLanguage(payload.language)
      if (typeof payload.speed === 'number') setSpeed(Math.min(1600, Math.max(250, payload.speed)))
      if (typeof payload.showHeat === 'boolean') setShowHeat(payload.showHeat)
      setSortIndex(0)
      setActiveIndex(0)
      setPlaying(false)
      setWorkspaceStatus('작업 파일을 불러왔습니다.')
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : '작업 파일을 불러오지 못했습니다.')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
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
        <div className="control-group">
          <label>알고리즘 시각화</label>
          <div className="segmented sort-tabs">
            {algorithmList.map(item => (
              <button className={detectedSortAlgorithm === item ? 'active' : ''} key={item} onClick={() => { setCode(sortSampleFor(item, language)); setSortIndex(0); setActiveIndex(0); setPlaying(false) }}>
                {algorithmNames[item]}
              </button>
            ))}
          </div>
          <button className="randomize-button" type="button" onClick={randomizeSortValues}>배열 랜덤</button>
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
        <div className="workspace-actions">
          <button type="button" onClick={exportWorkspace}>작업 내보내기</button>
          <label>
            작업 불러오기
            <input ref={importRef} type="file" accept="application/json,.json" onChange={importWorkspace} />
          </label>
        </div>
        {workspaceStatus && <p className="workspace-status">{workspaceStatus}</p>}
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
              <code>visual = {algorithmNames[detectedSortAlgorithm]}</code>
              <code>array = [{detectedSortValues.join(', ')}]</code>
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
              <div className="sort-visualizer" key={`${detectedSortAlgorithm}-${sortIndex}`}>
                <div className="sort-stats">
                  <div><span>Time</span><strong>{sortIndex}</strong></div>
                  <div><span>Compare</span><strong>{sortStep?.comparisons || 0}</strong></div>
                  <div><span>Swap/Move</span><strong>{sortStep?.swaps || 0}</strong></div>
                </div>
                {sortStep && (
                  detectedSortAlgorithm === 'heap' ? (
                    <div className="heap-stage">
                      <div className="stage-caption">부모 노드가 두 자식 중 더 큰 값을 위로 올립니다</div>
                      <div className="heap-edge edge-a" />
                      <div className="heap-edge edge-b" />
                      <div className="heap-edge edge-c" />
                      <div className="heap-edge edge-d" />
                      <div className="heap-edge edge-e" />
                      <div className="heap-edge edge-f" />
                      {sortStep.array.map((value, index) => (
                        <div
                          className={`heap-node level-${Math.floor(Math.log2(index + 1))} ${sortStep.compare.includes(index) ? 'compare' : ''} ${sortStep.active.includes(index) ? 'selected' : ''} ${sortStep.sorted.includes(index) ? 'sorted' : ''}`}
                          key={`${index}-${value}`}
                        >
                          <span>{value}</span>
                          <small>{sortStep.active.includes(index) ? 'parent' : sortStep.compare.includes(index) ? 'child' : `i=${index}`}</small>
                        </div>
                      ))}
                    </div>
                  ) : detectedSortAlgorithm === 'linearSearch' ? (
                    <div className="search-stage linear">
                      <div className="stage-caption">왼쪽부터 하나씩 target과 비교하고 지나간 칸은 방문 처리합니다</div>
                      {sortStep.array.map((value, index) => (
                        <div className={`search-cell ${sortStep.compare.includes(index) ? 'compare' : ''} ${sortStep.active.includes(index) ? 'selected' : ''} ${sortStep.sorted.includes(index) ? 'visited' : ''}`} key={`${index}-${value}`}>
                          <small>{sortStep.compare.includes(index) ? '현재 비교' : sortStep.sorted.includes(index) ? '방문 완료' : `i=${index}`}</small>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : detectedSortAlgorithm === 'binarySearch' ? (
                    <div className="search-stage binary">
                      <div className="stage-caption">정렬된 배열에서 mid를 보고 왼쪽/오른쪽 절반을 버립니다</div>
                      {sortStep.array.map((value, index) => {
                        const bounds = sortStep.active.length >= 2 ? [Math.min(...sortStep.active), Math.max(...sortStep.active)] : [0, sortStep.array.length - 1]
                        const outside = index < bounds[0] || index > bounds[1]
                        return (
                          <div className={`search-cell ${outside ? 'outside' : ''} ${sortStep.compare.includes(index) ? 'compare' : ''} ${sortStep.sorted.includes(index) ? 'selected' : ''}`} key={`${index}-${value}`}>
                            <small>{sortStep.compare.includes(index) ? 'mid' : index === bounds[0] ? 'left' : index === bounds[1] ? 'right' : outside ? '제외' : `i=${index}`}</small>
                            <strong>{value}</strong>
                          </div>
                        )
                      })}
                    </div>
                  ) : detectedSortAlgorithm === 'merge' ? (
                    <div className="merge-stage">
                      <div className="stage-caption">두 묶음의 맨 앞 값을 비교해서 더 작은 값부터 output에 씁니다</div>
                      <div className="merge-row split">
                        {sortStep.array.map((value, index) => <span className={index < Math.ceil(sortStep.array.length / 2) ? 'left' : 'right'} key={`split-${index}-${value}`}><small>{index < Math.ceil(sortStep.array.length / 2) ? 'left' : 'right'}</small>{value}</span>)}
                      </div>
                      <div className="merge-arrow">merge</div>
                      <div className="merge-row output">
                        {sortStep.array.map((value, index) => <span className={`${sortStep.active.includes(index) ? 'selected' : ''} ${sortStep.sorted.includes(index) ? 'sorted' : ''}`} key={`out-${index}-${value}`}><small>out {index}</small>{value}</span>)}
                      </div>
                    </div>
                  ) : (
                    <div className={`bar-stage ${detectedSortAlgorithm === 'quick' ? 'quick' : ''}`}>
                      <div className="stage-caption">{detectedSortAlgorithm === 'quick' ? 'pivot을 기준으로 작은 값은 왼쪽, 큰 값은 오른쪽 구역으로 보냅니다' : '두 값을 비교하고 필요하면 위치를 바꿔 정렬된 영역을 늘립니다'}</div>
                      {sortStep.array.map((value, index) => (
                        <div
                          className={`sort-bar ${sortStep.compare.includes(index) ? 'compare' : ''} ${sortStep.active.includes(index) ? 'selected' : ''} ${sortStep.sorted.includes(index) ? 'sorted' : ''} ${sortStep.lifted === index ? 'lifted' : ''}`}
                          style={{ height: `${80 + value * 3}px` }}
                          key={`${index}-${value}`}
                        >
                          <small>{detectedSortAlgorithm === 'quick' && sortStep.active.includes(index) ? 'pivot' : sortStep.compare.includes(index) ? '비교' : sortStep.sorted.includes(index) ? '완료' : `i=${index}`}</small>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  )
                )}
                <div className="sort-action">
                  <strong>{algorithmNames[detectedSortAlgorithm]}</strong>
                  <span>{sortStep?.action}</span>
                </div>
                <div className="sort-code">
                  {sortCode[detectedSortAlgorithm].map((line, index) => (
                    <code className={sortStep?.line === index + 1 ? 'active' : ''} key={line}>{line}</code>
                  ))}
                </div>
              </div>
              <div className="reel-dots">
                <button type="button" onClick={() => { setSortIndex(index => Math.max(0, index - 1)); setActiveIndex(index => Math.max(0, index - 1)) }}>이전</button>
                <button type="button" onClick={() => { setSortIndex(index => Math.min(sortSteps.length - 1, index + 1)); setActiveIndex(index => Math.min(sortSteps.length - 1, index + 1)) }}>다음</button>
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
