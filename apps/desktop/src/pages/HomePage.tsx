export function HomePage() {
  return (
    <div className="home-page">
      <header className="home-header">
        <div>
          <span className="home-eyebrow">LUNA'S ROOM</span>
          <h1>Good evening</h1>
          <p>Take your time. Luna is here with you.</p>
        </div>

        <div className="home-status">
          <span className="status-dot" />
          Luna is awake
        </div>
      </header>

      <section className="room-card">
        <div className="room-sky">
          <span className="room-moon">☾</span>
          <span className="star star-one">✦</span>
          <span className="star star-two">·</span>
          <span className="star star-three">✧</span>
        </div>

        <div className="room-content">
          <div className="room-message">
            <span>Tonight feels quiet.</span>
            <strong>Perfect for staying here a little longer.</strong>
          </div>

          <div className="room-luna">
            <div className="room-luna-glow" />
            <div className="room-luna-body">
              <span className="room-luna-eye" />
              <span className="room-luna-eye" />
              <span className="room-luna-mouth">⌣</span>
            </div>
          </div>

          <div className="room-floor" />
        </div>
      </section>

      <section className="home-widgets">
        <article className="home-widget">
          <span className="widget-label">TODAY</span>
          <strong>2h 14m</strong>
          <p>Focus time</p>
        </article>

        <article className="home-widget">
          <span className="widget-label">TASKS</span>
          <strong>3 / 5</strong>
          <p>Completed today</p>
        </article>

        <article className="home-widget">
          <span className="widget-label">LUNA</span>
          <strong>Calm</strong>
          <p>Current mood</p>
        </article>
      </section>
    </div>
  );
}