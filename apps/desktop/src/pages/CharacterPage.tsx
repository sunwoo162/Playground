import "./Character.css";

type CharacterPageProps = {
  onAddCharacter: () => void;
};

const starterBehaviors = ["기본", "걷기", "달리기", "잠자기", "드래그", "놀람"];

export function CharacterPage({ onAddCharacter }: CharacterPageProps) {
  return (
    <div className="character-page">
      <header className="character-header">
        <div>
          <span className="character-eyebrow">CHARACTER</span>
          <h1>캐릭터</h1>
          <p>데스크톱에서 함께할 캐릭터와 행동을 관리해요.</p>
        </div>

        <button className="character-primary-button" onClick={onAddCharacter}>
          캐릭터 추가하기
        </button>
      </header>

      <section className="character-current-card">
        <div className="character-current-preview" aria-hidden="true">
          <div className="character-preview-glow" />
          <span>☾</span>
        </div>

        <div className="character-current-info">
          <span className="character-card-label">현재 캐릭터</span>
          <div className="character-name-row">
            <h2>Luna</h2>
            <span className="character-active-badge">사용 중</span>
          </div>
          <p>기본 캐릭터 · 등록된 행동 6개</p>

          <div className="character-behavior-pills">
            {starterBehaviors.map((behavior) => (
              <span key={behavior}>{behavior}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="character-empty-area">
        <div>
          <h3>나만의 캐릭터를 만들어 보세요</h3>
          <p>상황별 이미지를 올리면 Luna가 행동에 맞춰 캐릭터를 바꿔 보여줄 수 있어요.</p>
        </div>

        <button className="character-secondary-button" onClick={onAddCharacter}>
          커스터마이징 시작
        </button>
      </section>
    </div>
  );
}
