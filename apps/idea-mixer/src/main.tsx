import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Mode = 'product' | 'service' | 'content' | 'experiment';

type Idea = {
  title: string;
  oneLine: string;
  detail: string;
  tag: string;
};

const SAMPLE_PAIRS = [
  ['사과', '카메라'],
  ['우산', '이어폰'],
  ['책상', '정원'],
  ['신발', '알람'],
  ['거울', '일기'],
  ['라면', '지도'],
];

const MODE_LABELS: Record<Mode, string> = {
  product: '제품',
  service: '서비스',
  content: '콘텐츠',
  experiment: '실험',
};

const frameworks = [
  {
    tag: '형태 전환',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${a} 모양의 ${b}`,
      oneLine: `${a}의 생김새를 ${b}의 외형과 사용 경험으로 옮긴 ${MODE_LABELS[mode]}입니다.`,
      detail: `${a}가 가진 색, 질감, 실루엣을 ${b}의 핵심 구조에 입힙니다. 보는 순간 낯설지만 기능은 바로 이해되는 방향이라 굿즈, 전시, 숏폼 썸네일에 강합니다.`,
      tag: '형태 전환',
    }),
  },
  {
    tag: '결과 변형',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${b}가 만드는 ${a}`,
      oneLine: `${b}를 쓰면 결과물이 ${a}처럼 보이거나 작동하는 ${MODE_LABELS[mode]}입니다.`,
      detail: `입력은 ${b}인데 출력은 ${a}의 규칙을 따르게 만듭니다. 예를 들어 사진, 기록, 알림, 추천 결과를 ${a}의 단면처럼 층층이 보여주는 식으로 확장할 수 있습니다.`,
      tag: '결과 변형',
    }),
  },
  {
    tag: '감각 결합',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${a}의 감각을 가진 ${b}`,
      oneLine: `${a}에서 떠오르는 맛, 소리, 촉감, 분위기를 ${b} 경험에 섞습니다.`,
      detail: `${b}가 단순한 도구가 아니라 ${a}를 만질 때의 느낌을 재현합니다. 색상, 사운드, 진동, 인터랙션을 같이 설계하면 브랜드 경험으로 만들기 좋습니다.`,
      tag: '감각 결합',
    }),
  },
  {
    tag: '문제 해결',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${a} 문제를 푸는 ${b}`,
      oneLine: `${a}와 관련된 불편함을 ${b} 방식으로 해결하는 ${MODE_LABELS[mode]}입니다.`,
      detail: `${a}를 쓰거나 먹거나 관리할 때 생기는 작은 귀찮음을 찾고, ${b}의 기능을 해결 도구로 씁니다. 실제 앱이나 하드웨어 콘셉트로 발전시키기 쉽습니다.`,
      tag: '문제 해결',
    }),
  },
  {
    tag: '반대 조합',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${a}답지 않은 ${b}`,
      oneLine: `${a}의 예상 이미지를 일부러 깨뜨려 ${b}에 붙인 아이디어입니다.`,
      detail: `${a}를 떠올리면 보통 기대하는 속성을 정한 뒤 그 반대로 설계합니다. 귀엽지만 차갑게, 자연스럽지만 디지털하게, 가볍지만 정교하게 같은 긴장이 컨셉을 만듭니다.`,
      tag: '반대 조합',
    }),
  },
  {
    tag: '사용자 장면',
    make: (a: string, b: string, mode: Mode): Idea => ({
      title: `${a}를 좋아하는 사람을 위한 ${b}`,
      oneLine: `${a} 취향의 사람이 ${b}를 더 자주 쓰게 만드는 ${MODE_LABELS[mode]}입니다.`,
      detail: `사용자를 '${a}를 좋아하는 사람'으로 좁히고 ${b}의 기능을 그 취향에 맞춰 바꿉니다. 첫 구매 이유, 공유 이유, 반복 사용 이유를 만들기 좋은 접근입니다.`,
      tag: '사용자 장면',
    }),
  },
];

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function createIdeas(a: string, b: string, mode: Mode) {
  return frameworks.map((framework) => framework.make(a, b, mode));
}

function App() {
  const [first, setFirst] = useState('사과');
  const [second, setSecond] = useState('카메라');
  const [mode, setMode] = useState<Mode>('product');
  const [saved, setSaved] = useState<Idea[]>([]);

  const wordA = normalize(first) || '첫 번째 단어';
  const wordB = normalize(second) || '두 번째 단어';
  const ideas = useMemo(() => createIdeas(wordA, wordB, mode), [wordA, wordB, mode]);

  const swapWords = () => {
    setFirst(second);
    setSecond(first);
  };

  const loadSample = () => {
    const next = SAMPLE_PAIRS[Math.floor(Math.random() * SAMPLE_PAIRS.length)];
    setFirst(next[0]);
    setSecond(next[1]);
  };

  const saveIdea = (idea: Idea) => {
    setSaved((current) => current.some((item) => item.title === idea.title) ? current : [idea, ...current].slice(0, 8));
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="intro">
          <a className="back-link" href="/">Playground</a>
          <h1>아이디어 믹서</h1>
          <p>단어 두 개를 부딪혀서 제품, 서비스, 콘텐츠 아이디어로 빠르게 펼칩니다.</p>
        </div>

        <div className="mixer-panel">
          <label>
            <span>단어 A</span>
            <input value={first} onChange={(event) => setFirst(event.target.value)} placeholder="예: 사과" />
          </label>
          <button className="icon-button" type="button" onClick={swapWords} aria-label="단어 순서 바꾸기" title="단어 순서 바꾸기">
            ⇄
          </button>
          <label>
            <span>단어 B</span>
            <input value={second} onChange={(event) => setSecond(event.target.value)} placeholder="예: 카메라" />
          </label>
          <button className="sample-button" type="button" onClick={loadSample}>랜덤 조합</button>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="아이디어 유형">
          {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
            <button
              key={key}
              type="button"
              className={mode === key ? 'active' : ''}
              onClick={() => setMode(key)}
            >
              {MODE_LABELS[key]}
            </button>
          ))}
        </div>

        <section className="idea-grid" aria-label="추천 아이디어">
          {ideas.map((idea) => (
            <article className="idea-card" key={idea.tag}>
              <div className="card-top">
                <span>{idea.tag}</span>
                <button type="button" onClick={() => saveIdea(idea)} title="저장하기">＋</button>
              </div>
              <h2>{idea.title}</h2>
              <strong>{idea.oneLine}</strong>
              <p>{idea.detail}</p>
            </article>
          ))}
        </section>
      </section>

      <aside className="side-panel">
        <div className="combo-preview">
          <span>{wordA}</span>
          <b>+</b>
          <span>{wordB}</span>
        </div>
        <div className="prompt-box">
          <h2>발상 질문</h2>
          <p>{wordA}의 모양, 감각, 문제, 사용자, 분위기 중 하나를 {wordB}에 강제로 붙이면 무엇이 바뀔까?</p>
        </div>
        <div className="saved-box">
          <h2>저장한 아이디어</h2>
          {saved.length === 0 ? (
            <p className="empty">카드의 + 버튼을 누르면 여기에 모입니다.</p>
          ) : (
            <ul>
              {saved.map((idea) => <li key={idea.title}>{idea.title}</li>)}
            </ul>
          )}
        </div>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
