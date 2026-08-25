import { useEffect, useState, type ChangeEvent } from "react";

import type { CharacterDraft } from "./CharacterCreatePage";

type CharacterSetupPageProps = {
  initialDraft: CharacterDraft;
  onBack: () => void;
  onComplete: (draft: CharacterDraft) => void;
};

function useObjectUrl(file: File) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

export function CharacterSetupPage({
  initialDraft,
  onBack,
  onComplete,
}: CharacterSetupPageProps) {
  const [name, setName] = useState(initialDraft.name ?? "");
  const [motionName, setMotionName] = useState(initialDraft.motionName ?? "걷기");
  const [frameDurationInput, setFrameDurationInput] = useState(
    String(initialDraft.frameDurationMs ?? 150),
  );
  const [loop, setLoop] = useState(initialDraft.loop ?? true);

  const basePreview = useObjectUrl(initialDraft.baseImage);
  const motionPreview = useObjectUrl(initialDraft.motionImage);
  const frameDurationMs = Number(frameDurationInput);
  const isDurationValid =
    Number.isFinite(frameDurationMs) && frameDurationMs >= 50 && frameDurationMs <= 1000;
  const canComplete =
    name.trim().length > 0 && motionName.trim().length > 0 && isDurationValid;

  const handleDurationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFrameDurationInput(event.target.value);
  };

  const handleComplete = () => {
    if (!canComplete) {
      return;
    }

    onComplete({
      ...initialDraft,
      name: name.trim(),
      motionName: motionName.trim(),
      frameDurationMs: Math.round(frameDurationMs),
      loop,
    });
  };

  return (
    <div className="character-setup-page">
      <header className="character-setup-header">
        <div className="character-setup-title-row">
          <button
            className="character-back-button"
            type="button"
            onClick={onBack}
            aria-label="필수 사진 등록 단계로 돌아가기"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>

          <div>
            <div className="character-setup-kicker">STEP 2 OF 2</div>
            <h1>캐릭터 설정</h1>
            <p>이름과 기본 움직임 설정을 정하면 캐릭터 등록 준비가 끝나요.</p>
          </div>
        </div>

        <span className="character-setup-progress">2 / 2</span>
      </header>

      <div className="character-setup-content">
        <section className="character-setup-card">
          <div className="character-setup-card-heading">
            <div>
              <span className="character-setup-section-number">01</span>
              <div>
                <h2>캐릭터 정보</h2>
                <p>관리 화면과 데스크톱에서 표시할 이름을 정해 주세요.</p>
              </div>
            </div>
            <span className="required-badge">필수</span>
          </div>

          <div className="character-setup-grid character-identity-grid">
            <div className="character-setup-preview-panel">
              <span className="character-preview-label">기본 상태 미리보기</span>
              <div className="character-setup-preview-box">
                {basePreview && (
                  <img src={basePreview} alt="기본 상태 캐릭터 미리보기" />
                )}
              </div>
            </div>

            <div className="character-setup-fields">
              <label className="character-field-label" htmlFor="character-name">
                캐릭터 이름
              </label>
              <input
                id="character-name"
                className="character-text-input"
                type="text"
                value={name}
                maxLength={20}
                placeholder="예: Luna, 카피바라"
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
              <div className="character-field-help">
                <span>1~20자까지 입력할 수 있어요.</span>
                <span>{name.length}/20</span>
              </div>
            </div>
          </div>
        </section>

        <section className="character-setup-card">
          <div className="character-setup-card-heading">
            <div>
              <span className="character-setup-section-number">02</span>
              <div>
                <h2>기본 움직임 설정</h2>
                <p>두 번째 이미지가 어떤 행동인지와 기본 재생 방식을 정해 주세요.</p>
              </div>
            </div>
          </div>

          <div className="character-setup-grid character-motion-grid">
            <div className="character-setup-preview-panel">
              <span className="character-preview-label">움직이는 상태 미리보기</span>
              <div className="character-setup-preview-box motion">
                {motionPreview && (
                  <img src={motionPreview} alt="움직이는 상태 캐릭터 미리보기" />
                )}
              </div>
            </div>

            <div className="character-setup-fields character-motion-fields">
              <div>
                <label className="character-field-label" htmlFor="motion-name">
                  움직임 이름
                </label>
                <input
                  id="motion-name"
                  className="character-text-input"
                  type="text"
                  value={motionName}
                  maxLength={20}
                  placeholder="예: 걷기, 뛰기"
                  onChange={(event) => setMotionName(event.target.value)}
                />
              </div>

              <div>
                <label className="character-field-label" htmlFor="frame-duration">
                  기본 재생 간격
                </label>
                <div className="character-duration-input-wrap">
                  <input
                    id="frame-duration"
                    className={`character-text-input ${
                      frameDurationInput && !isDurationValid ? "invalid" : ""
                    }`}
                    type="number"
                    min={50}
                    max={1000}
                    step={10}
                    value={frameDurationInput}
                    onChange={handleDurationChange}
                  />
                  <span>ms</span>
                </div>
                <p className="character-duration-help">
                  50~1000ms · 이후 행동 프레임을 추가할 때 기본값으로 사용돼요.
                </p>
              </div>

              <label className="character-loop-option">
                <span>
                  <strong>반복 재생</strong>
                  <small>움직임이 끝나면 처음부터 다시 재생합니다.</small>
                </span>
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(event) => setLoop(event.target.checked)}
                />
                <span className="character-toggle" aria-hidden="true">
                  <span />
                </span>
              </label>
            </div>
          </div>
        </section>
      </div>

      <footer className="character-create-footer character-setup-footer">
        <button
          type="button"
          className="character-footer-button secondary"
          onClick={onBack}
        >
          이전
        </button>
        <button
          type="button"
          className="character-footer-button primary character-complete-button"
          disabled={!canComplete}
          onClick={handleComplete}
        >
          캐릭터 생성
        </button>
      </footer>
    </div>
  );
}
