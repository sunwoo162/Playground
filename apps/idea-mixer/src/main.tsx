import React, { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type IdeaNote = {
  id: string;
  first: string;
  second: string;
  text: string;
  createdAt: string;
};

type ExampleIdea = {
  tag: string;
  question: string;
  hint: string;
};

const WORDS_A = [
  '사과', '우산', '거울', '신발', '라면', '책상', '구름', '열쇠', '자석', '달력',
  '연필', '바다', '캔디', '정원', '시계', '풍선', '도서관', '버튼', '지도', '향수',
  '엘리베이터', '종이컵', '손전등', '냉장고', '스티커', '베개', '비누', '초콜릿',
];

const WORDS_B = [
  '카메라', '이어폰', '알람', '일기', '자동차', '앱', '가방', '의자', '게임', '로봇',
  '메신저', '자판기', '키보드', '프린터', '노트', '조명', '결제', '시계', '검색',
  '음악', '포스터', '배달', '운동화', '휴지통', '캘린더', '리모컨', '티켓', '렌즈',
];

const STARTERS = [
  '모양을 빌리면',
  '출력 방식을 바꾸면',
  '사용 장면을 뒤집으면',
  '불편함을 해결한다면',
  '선물처럼 만든다면',
  '소리를 붙인다면',
];

const EXAMPLE_PATTERNS = [
  {
    tag: '모양',
    create: (a: string, b: string): ExampleIdea => ({
      tag: '모양',
      question: `${a}의 생김새를 ${b}에 붙이면 뭐가 달라질까?`,
      hint: `겉모양, 색, 재질, 크기, 접히는 방식부터 상상해보기`,
    }),
  },
  {
    tag: '출력',
    create: (a: string, b: string): ExampleIdea => ({
      tag: '출력',
      question: `${b}의 결과물이 ${a}처럼 나오면 어떤 일이 생길까?`,
      hint: `사진, 알림, 기록, 추천, 화면 결과가 어떻게 바뀌는지 생각하기`,
    }),
  },
  {
    tag: '상황',
    create: (a: string, b: string): ExampleIdea => ({
      tag: '상황',
      question: `${a}가 꼭 필요한 순간에 ${b}가 있다면?`,
      hint: `누가, 언제, 왜 쓰는지 한 장면으로 좁혀보기`,
    }),
  },
  {
    tag: '문제',
    create: (a: string, b: string): ExampleIdea => ({
      tag: '문제',
      question: `${a} 때문에 생기는 불편함을 ${b}로 풀 수 있을까?`,
      hint: `귀찮음, 낭비, 실수, 기다림 같은 작은 문제부터 찾기`,
    }),
  },
];

const randomItem = (items: string[]) => items[Math.floor(Math.random() * items.length)];

function createPair() {
  return {
    first: randomItem(WORDS_A),
    second: randomItem(WORDS_B),
  };
}

function loadSavedNotes(): IdeaNote[] {
  try {
    const raw = localStorage.getItem('idea-mixer-notes');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function App() {
  const initialPair = useMemo(createPair, []);
  const [first, setFirst] = useState(initialPair.first);
  const [second, setSecond] = useState(initialPair.second);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState<IdeaNote[]>(loadSavedNotes);
  const [boardStatus, setBoardStatus] = useState('');
  const importRef = useRef<HTMLInputElement | null>(null);

  const starter = useMemo(() => randomItem(STARTERS), [first, second]);
  const examples = useMemo(() => EXAMPLE_PATTERNS.map((pattern) => pattern.create(first, second)), [first, second]);

  const saveNotes = (nextNotes: IdeaNote[]) => {
    setNotes(nextNotes);
    localStorage.setItem('idea-mixer-notes', JSON.stringify(nextNotes));
  };

  const drawFirst = () => setFirst(randomItem(WORDS_A));
  const drawSecond = () => setSecond(randomItem(WORDS_B));
  const drawBoth = () => {
    const next = createPair();
    setFirst(next.first);
    setSecond(next.second);
    setDraft('');
  };

  const saveCurrentIdea = () => {
    const text = draft.trim();
    if (!text) return;

    saveNotes([
      {
        id: crypto.randomUUID(),
        first,
        second,
        text,
        createdAt: new Date().toLocaleString('ko-KR', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
      ...notes,
    ]);
    setDraft('');
  };

  const removeNote = (id: string) => {
    saveNotes(notes.filter((note) => note.id !== id));
    setBoardStatus('아이디어를 삭제했습니다.');
  };

  const exportBoard = () => {
    const payload = {
      app: 'idea-mixer',
      version: 1,
      exportedAt: new Date().toISOString(),
      notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `idea-mixer-board-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setBoardStatus('아이디어 보드를 내보냈습니다.');
  };

  const importBoard = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== 'idea-mixer' || payload?.version !== 1 || !Array.isArray(payload.notes)) {
        throw new Error('idea-mixer 보드 파일이 아닙니다.');
      }
      const restored = payload.notes.map((note: Partial<IdeaNote>) => ({
        id: crypto.randomUUID(),
        first: String(note.first || '단어 A'),
        second: String(note.second || '단어 B'),
        text: String(note.text || '').trim(),
        createdAt: String(note.createdAt || new Date().toLocaleString('ko-KR')),
      })).filter((note: IdeaNote) => note.text);
      saveNotes(restored);
      setBoardStatus(`${restored.length}개 아이디어를 불러왔습니다.`);
    } catch (error) {
      setBoardStatus(error instanceof Error ? error.message : '아이디어 보드를 불러오지 못했습니다.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="intro">
          <a className="back-link" href="/">Playground</a>
          <h1>아이디어 믹서</h1>
          <p>랜덤으로 뽑힌 단어 두 개를 조합하고, 떠오른 아이디어를 바로 적어두는 공간입니다.</p>
        </div>

        <section className="draw-board" aria-label="랜덤 단어 조합">
          <div className="word-card">
            <span>단어 A</span>
            <strong>{first}</strong>
            <button type="button" onClick={drawFirst}>A 다시 뽑기</button>
          </div>
          <div className="plus-mark">+</div>
          <div className="word-card">
            <span>단어 B</span>
            <strong>{second}</strong>
            <button type="button" onClick={drawSecond}>B 다시 뽑기</button>
          </div>
          <button className="draw-button" type="button" onClick={drawBoth}>둘 다 랜덤</button>
        </section>

        <section className="writing-zone" aria-label="아이디어 작성">
          <div className="prompt-line">
            <span>{first} + {second}</span>
            <p>{starter} 어떤 물건, 앱, 콘텐츠, 서비스가 될 수 있을까?</p>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`1. ${first}에서 떠오르는 특징은?
2. ${second}는 보통 어떻게 쓰이지?
3. 둘을 억지로 붙이면 어떤 장면이 생기지?

여기에 떠오른 생각을 적어보세요.`}
          />
          <div className="writer-actions">
            <span>{draft.trim().length}자</span>
            <button type="button" onClick={saveCurrentIdea} disabled={!draft.trim()}>아이디어 저장</button>
          </div>
        </section>

        <section className="example-zone" aria-label="발상 예시">
          <div className="section-heading">
            <h2>생각을 여는 질문</h2>
            <p>정답 예시가 아니라, 다른 방향으로 생각해보게 만드는 질문입니다.</p>
          </div>
          <div className="idea-grid">
            {examples.map((example) => (
              <article className="idea-card" key={example.tag}>
                <span>{example.tag}</span>
                <h3>{example.question}</h3>
                <p>{example.hint}</p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <aside className="side-panel">
        <div className="combo-preview">
          <span>{first}</span>
          <b>+</b>
          <span>{second}</span>
        </div>
        <div className="saved-box">
          <div className="board-heading">
            <h2>아이디어 보드</h2>
            <div>
              <button type="button" onClick={exportBoard} disabled={notes.length === 0}>내보내기</button>
              <label>
                불러오기
                <input ref={importRef} type="file" accept="application/json,.json" onChange={importBoard} />
              </label>
            </div>
          </div>
          {boardStatus && <p className="board-status">{boardStatus}</p>}
          {notes.length === 0 ? (
            <p className="empty">랜덤 단어를 보고 떠오른 생각을 적으면 여기에 저장됩니다.</p>
          ) : (
            <div className="note-list">
              {notes.map((note) => (
                <article className="note-card" key={note.id}>
                  <div>
                    <strong>{note.first} + {note.second}</strong>
                    <span>{note.createdAt}</span>
                  </div>
                  <p>{note.text}</p>
                  <button type="button" onClick={() => removeNote(note.id)}>삭제</button>
                </article>
              ))}
            </div>
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
