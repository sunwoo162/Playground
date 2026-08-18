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
        <div className="room-wall">
          <div className="room-window">
            <div className="window-sky">
              <span className="window-moon">☾</span>
              <span className="window-star star-a">✦</span>
              <span className="window-star star-b">·</span>
              <span className="window-star star-c">✧</span>
            </div>

            <div className="window-frame window-frame-v" />
            <div className="window-frame window-frame-h" />
          </div>

          <div className="room-picture">
            <span>☾</span>
          </div>

          <div className="room-shelf">
            <div className="shelf-item shelf-book" />
            <div className="shelf-item shelf-book small" />
            <div className="shelf-plant">♧</div>
          </div>

          <div className="room-lamp">
            <div className="lamp-light" />
            <div className="lamp-shade" />
            <div className="lamp-neck" />
            <div className="lamp-base" />
          </div>

          <div className="room-message">
            <span>Tonight feels quiet.</span>
            <strong>Perfect for staying here a little longer.</strong>
          </div>
        </div>

        <div className="room-floor">
          <div className="room-rug" />

          <div className="room-luna">
            <div className="room-luna-glow" />

            <div className="room-luna-body">
              <span className="room-luna-eye" />
              <span className="room-luna-eye" />
              <span className="room-luna-mouth">⌣</span>
            </div>

            <div className="luna-shadow" />
          </div>
        </div>
      </section>
    </div>
  );
}