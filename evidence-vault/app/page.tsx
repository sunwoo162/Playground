import Link from "next/link";
import { LegalDisclaimer } from "@/src/components/legal-disclaimer";

const examples = [
  ["온라인 구매", "반품 가능일로 기록한 날짜까지 D-3"],
  ["정수기 렌탈", "약정 종료일로 기록한 날짜까지 D-74"],
  ["무선 이어폰", "보증 종료일로 기록한 날짜까지 D-21"],
] as const;

const steps = [
  ["01", "증빙함 만들기", "구매·구독·렌탈 같은 거래를 등록하고 중요한 날짜를 직접 기록합니다."],
  ["02", "기록 이어 붙이기", "구매, 배송, 하자 발견, 환불 요청, 업체 답변을 시간순으로 남깁니다."],
  ["03", "필요할 때 꺼내기", "선택한 사실과 파일을 중립적인 증빙 패킷으로 묶어 내보냅니다."],
] as const;

export default function LandingPage() {
  return (
    <main className="landing-shell">
      <nav className="topbar" aria-label="주요 메뉴">
        <Link className="brand" href="/" aria-label="증빙함 홈">
          <span className="brand-mark" aria-hidden="true">증</span>
          <span>증빙함</span>
        </Link>
        <a className="nav-login" href="/auth/login?returnTo=/dashboard">꽃다발로 로그인</a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">EVIDENCE, BEFORE YOU NEED IT</p>
          <h1>문제가 생긴 뒤<br />찾지 말고, <em>미리 모아두세요.</em></h1>
          <p className="hero-description">
            영수증, 주문내역, 상담 캡처, 환불 요청 기록까지. 구매와 계약의 중요한 순간을 한 타임라인에
            보관하고, 놓치기 쉬운 날짜를 먼저 보여드립니다.
          </p>
          <div className="hero-actions">
            <a className="primary-button" href="/auth/login?returnTo=/dashboard">꽃다발로 시작하기 <span>↗</span></a>
            <a className="text-button" href="#how-it-works">어떻게 쓰나요? <span>↓</span></a>
          </div>
          <p className="age-note">만 14세 이상 이용 · 의료분쟁 자료는 MVP에서 지원하지 않습니다.</p>
        </div>

        <div className="radar-card" aria-label="마감 레이더 미리보기">
          <div className="radar-head">
            <div>
              <span className="radar-kicker">DEADLINE RADAR</span>
              <h2>곧 마감돼요</h2>
            </div>
            <span className="radar-count">3</span>
          </div>
          <div className="radar-list">
            {examples.map(([title, detail], index) => (
              <article className="radar-row" key={title}>
                <span className={`urgency urgency-${index + 1}`}>
                  {index === 0 ? "3일" : index === 1 ? "74일" : "21일"}
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="radar-footer">
            <span>최근 기록</span>
            <span>환불 요청 캡처 · 방금 전</span>
          </div>
        </div>
      </section>

      <section className="principle-strip" aria-label="제품 원칙">
        <span>PRIVATE BY DEFAULT</span>
        <i aria-hidden="true" />
        <span>FACTS, NOT LEGAL JUDGMENTS</span>
        <i aria-hidden="true" />
        <span>YOUR FILES, YOUR CONTROL</span>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">A SMALL HABIT, A CLEAR RECORD</p>
          <h2>평소엔 기록함.<br />필요한 순간엔 증빙함.</h2>
        </div>
        <div className="steps-grid">
          {steps.map(([number, title, description]) => (
            <article className="step-card" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="legal-section">
        <LegalDisclaimer />
      </section>

      <footer className="footer">
        <span>증빙함 · Team Sunflower</span>
        <span>개인정보를 필요한 만큼만 보관하세요.</span>
      </footer>
    </main>
  );
}
