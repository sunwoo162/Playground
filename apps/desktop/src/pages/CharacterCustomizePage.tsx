import { useEffect, useRef, useState } from "react";

import "./Character.css";

type CharacterCustomizePageProps = {
  onBack: () => void;
};

type BehaviorId =
  | "idle"
  | "walk"
  | "run"
  | "sleep"
  | "drag"
  | "surprised";

type FramePreview = {
  id: string;
  name: string;
  url: string;
};

type BehaviorConfig = {
  id: BehaviorId;
  label: string;
  description: string;
  icon: string;
  actionName: string;
  frameInterval: number;
  loop: boolean;
  frames: FramePreview[];
};

const initialBehaviors: BehaviorConfig[] = [
  {
    id: "idle",
    label: "기본 상태",
    description: "가만히 있을 때 보여줄 기본 모습",
    icon: "◌",
    actionName: "기본 상태",
    frameInterval: 500,
    loop: true,
    frames: [],
  },
  {
    id: "walk",
    label: "걷기",
    description: "화면을 천천히 이동할 때",
    icon: "↝",
    actionName: "걷기",
    frameInterval: 140,
    loop: true,
    frames: [],
  },
  {
    id: "run",
    label: "달리기",
    description: "빠르게 이동할 때",
    icon: "»",
    actionName: "달리기",
    frameInterval: 95,
    loop: true,
    frames: [],
  },
  {
    id: "sleep",
    label: "잠자기",
    description: "오랫동안 입력이 없을 때",
    icon: "zZ",
    actionName: "잠자기",
    frameInterval: 650,
    loop: true,
    frames: [],
  },
  {
    id: "drag",
    label: "드래그",
    description: "마우스로 캐릭터를 잡았을 때",
    icon: "✥",
    actionName: "드래그",
    frameInterval: 120,
    loop: true,
    frames: [],
  },
  {
    id: "surprised",
    label: "놀람",
    description: "드롭하거나 갑자기 반응할 때",
    icon: "!",
    actionName: "놀람",
    frameInterval: 160,
    loop: false,
    frames: [],
  },
];

export function CharacterCustomizePage({ onBack }: CharacterCustomizePageProps) {
  const [characterName, setCharacterName] = useState("새 캐릭터");
  const [selectedId, setSelectedId] = useState<BehaviorId>("idle");
  const [behaviors, setBehaviors] = useState<BehaviorConfig[]>(initialBehaviors);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createdUrlsRef = useRef<string[]>([]);

  const selectedBehavior =
    behaviors.find((behavior) => behavior.id === selectedId) ?? behaviors[0];

  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateSelectedBehavior = (patch: Partial<BehaviorConfig>) => {
    setSaved(false);
    setBehaviors((current) =>
      current.map((behavior) =>
        behavior.id === selectedId ? { ...behavior, ...patch } : behavior,
      ),
    );
  };

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      return;
    }

    const newFrames = imageFiles.map((file, index) => {
      const url = URL.createObjectURL(file);
      createdUrlsRef.current.push(url);

      return {
        id: `${file.name}-${file.lastModified}-${index}-${crypto.randomUUID()}`,
        name: file.name,
        url,
      };
    });

    updateSelectedBehavior({
      frames: [...selectedBehavior.frames, ...newFrames],
    });
  };

  const removeFrame = (frameId: string) => {
    const target = selectedBehavior.frames.find((frame) => frame.id === frameId);
    if (target) {
      URL.revokeObjectURL(target.url);
    }

    updateSelectedBehavior({
      frames: selectedBehavior.frames.filter((frame) => frame.id !== frameId),
    });
  };

  const moveFrame = (frameIndex: number, offset: number) => {
    const nextIndex = frameIndex + offset;
    if (nextIndex < 0 || nextIndex >= selectedBehavior.frames.length) {
      return;
    }

    const nextFrames = [...selectedBehavior.frames];
    const [frame] = nextFrames.splice(frameIndex, 1);
    nextFrames.splice(nextIndex, 0, frame);
    updateSelectedBehavior({ frames: nextFrames });
  };

  const handleSave = () => {
    const payload = {
      name: characterName.trim() || "새 캐릭터",
      behaviors: behaviors.map((behavior) => ({
        id: behavior.id,
        actionName: behavior.actionName,
        frameInterval: behavior.frameInterval,
        loop: behavior.loop,
        frameNames: behavior.frames.map((frame) => frame.name),
      })),
    };

    localStorage.setItem("luna:character-customize-draft", JSON.stringify(payload));
    setSaved(true);
  };

  return (
    <div className="character-customize-page">
      <header className="customize-header">
        <div className="customize-title-row">
          <button className="customize-back-button" onClick={onBack} aria-label="캐릭터 화면으로 돌아가기">
            ←
          </button>

          <div>
            <span className="character-eyebrow">CUSTOMIZE</span>
            <h1>캐릭터 커스터마이징</h1>
            <p>상황별 이미지를 등록해서 캐릭터가 어떻게 움직일지 설정해요.</p>
          </div>
        </div>

        <div className="customize-name-field">
          <label htmlFor="character-name">캐릭터 이름</label>
          <input
            id="character-name"
            value={characterName}
            onChange={(event) => {
              setCharacterName(event.target.value);
              setSaved(false);
            }}
            placeholder="캐릭터 이름"
          />
        </div>
      </header>

      <div className="customize-workspace">
        <section className="behavior-library">
          <div className="section-heading">
            <div>
              <span className="section-kicker">행동 예시</span>
              <h2>어떤 상황을 만들까요?</h2>
            </div>
            <span className="section-count">{behaviors.length}개</span>
          </div>

          <div className="behavior-grid">
            {behaviors.map((behavior) => {
              const isSelected = behavior.id === selectedId;

              return (
                <button
                  key={behavior.id}
                  className={`behavior-card ${isSelected ? "selected" : ""}`}
                  onClick={() => setSelectedId(behavior.id)}
                >
                  <div className="behavior-card-top">
                    <span className="behavior-icon">{behavior.icon}</span>
                    {behavior.frames.length > 0 && (
                      <span className="behavior-frame-count">{behavior.frames.length}장</span>
                    )}
                  </div>
                  <strong>{behavior.label}</strong>
                  <p>{behavior.description}</p>
                </button>
              );
            })}
          </div>

          <div className="behavior-help-card">
            <span>TIP</span>
            <p>같은 행동의 이미지는 프레임 순서대로 여러 장 올리면 자연스럽게 애니메이션돼요.</p>
          </div>
        </section>

        <section className="behavior-editor">
          <div className="editor-heading">
            <div>
              <span className="section-kicker">선택한 행동</span>
              <h2>{selectedBehavior.label}</h2>
            </div>
            <span className={`editor-loop-badge ${selectedBehavior.loop ? "on" : ""}`}>
              {selectedBehavior.loop ? "반복 재생" : "1회 재생"}
            </span>
          </div>

          <div
            className="frame-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(Array.from(event.dataTransfer.files));
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              ref={fileInputRef}
              className="frame-file-input"
              type="file"
              accept="image/png,image/webp,image/gif,image/jpeg"
              multiple
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />

            <div className="dropzone-icon">▧</div>
            <strong>이미지를 끌어놓거나 클릭해서 추가</strong>
            <span>PNG / WEBP 권장 · 여러 프레임을 한 번에 선택할 수 있어요</span>
          </div>

          <div className="frame-list-heading">
            <span>프레임</span>
            <span>{selectedBehavior.frames.length}장</span>
          </div>

          {selectedBehavior.frames.length === 0 ? (
            <div className="frame-empty-state">
              <div className="frame-empty-preview">{selectedBehavior.icon}</div>
              <div>
                <strong>아직 등록된 이미지가 없어요</strong>
                <p>첫 번째 프레임부터 순서대로 추가해 주세요.</p>
              </div>
            </div>
          ) : (
            <div className="frame-strip">
              {selectedBehavior.frames.map((frame, index) => (
                <div className="frame-item" key={frame.id}>
                  <span className="frame-index">{index + 1}</span>
                  <img src={frame.url} alt={`${selectedBehavior.label} ${index + 1}번 프레임`} />
                  <div className="frame-item-actions">
                    <button onClick={() => moveFrame(index, -1)} disabled={index === 0} aria-label="앞으로 이동">
                      ‹
                    </button>
                    <button
                      onClick={() => moveFrame(index, 1)}
                      disabled={index === selectedBehavior.frames.length - 1}
                      aria-label="뒤로 이동"
                    >
                      ›
                    </button>
                    <button onClick={() => removeFrame(frame.id)} aria-label="프레임 삭제">
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="behavior-settings-card">
            <div className="settings-field settings-field-wide">
              <label htmlFor="action-name">행동 이름</label>
              <input
                id="action-name"
                value={selectedBehavior.actionName}
                onChange={(event) => updateSelectedBehavior({ actionName: event.target.value })}
                placeholder="예: 뛰어오기"
              />
            </div>

            <div className="settings-field">
              <label htmlFor="frame-interval">프레임 간격</label>
              <div className="number-field">
                <input
                  id="frame-interval"
                  type="number"
                  min={40}
                  max={3000}
                  step={10}
                  value={selectedBehavior.frameInterval}
                  onChange={(event) =>
                    updateSelectedBehavior({ frameInterval: Number(event.target.value) })
                  }
                />
                <span>ms</span>
              </div>
            </div>

            <div className="settings-field toggle-field">
              <div>
                <label htmlFor="loop-toggle">반복</label>
                <span>끝나면 처음 프레임부터 다시 재생</span>
              </div>

              <button
                id="loop-toggle"
                className={`custom-toggle ${selectedBehavior.loop ? "active" : ""}`}
                onClick={() => updateSelectedBehavior({ loop: !selectedBehavior.loop })}
                aria-pressed={selectedBehavior.loop}
              >
                <span />
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="customize-footer">
        <div className="customize-save-state">
          {saved ? "설정이 임시 저장됐어요." : "행동별 이미지는 나중에 언제든 다시 수정할 수 있어요."}
        </div>

        <div className="customize-footer-actions">
          <button className="character-secondary-button" onClick={onBack}>
            취소
          </button>
          <button className="character-primary-button" onClick={handleSave}>
            저장하기
          </button>
        </div>
      </footer>
    </div>
  );
}
