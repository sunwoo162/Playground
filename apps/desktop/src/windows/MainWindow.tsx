export function MainWindow() {
  return (
    <main className="luna-pet-shell">
      <section className="luna-pet-card">
        <div className="luna-pet-eyebrow">DESKTOP PET</div>
        <h1>Luna</h1>
        <p className="luna-pet-lead">
          Luna는 이제 데스크톱 펫 전용 프로젝트입니다. Agent 기반 소프트웨어 제작 플랫폼은 Bloom으로 분리되었습니다.
        </p>

        <div className="luna-pet-grid">
          <article>
            <span>Character</span>
            <strong>Pet appearance</strong>
            <p>캐릭터 이미지, 크기, 방향과 기본 외형을 관리하는 영역입니다.</p>
          </article>
          <article>
            <span>Behavior</span>
            <strong>Pet animation</strong>
            <p>idle, walk, run, drag 같은 행동과 애니메이션 프레임을 관리합니다.</p>
          </article>
          <article>
            <span>Desktop</span>
            <strong>Pet window</strong>
            <p>Always-on-top, drag, 위치 복구처럼 데스크톱 펫 자체 동작만 담당합니다.</p>
          </article>
        </div>

        <p className="luna-pet-note">
          이 앱에는 PM, Agent Team, Review, QA, Builder Worker 기능을 두지 않습니다.
        </p>
      </section>
    </main>
  );
}
