import { useEffect, useState } from "react";

import type { CharacterDraft } from "./CharacterCreatePage";

type CharacterPageProps = {
  draft: CharacterDraft | null;
  onAddCharacter: () => void;
};

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

export function CharacterPage({ draft, onAddCharacter }: CharacterPageProps) {
  const draftPreview = useObjectUrl(draft?.baseImage ?? null);

  return (
    <div className="character-page">
      <header className="character-page-header">
        <div>
          <span className="home-eyebrow">CHARACTER</span>
          <h1>캐릭터</h1>
          <p>데스크톱에서 함께할 캐릭터를 관리해 보세요.</p>
        </div>

        <button
          type="button"
          className="character-add-button"
          onClick={onAddCharacter}
        >
          <span aria-hidden="true">＋</span>
          캐릭터 추가하기
        </button>
      </header>

      <section className="character-library-card">
        <div className="character-library-preview">
          {draftPreview ? (
            <img src={draftPreview} alt="추가 중인 캐릭터 미리보기" />
          ) : (
            <div className="character-library-mascot" aria-hidden="true">
              <span className="character-library-mascot-glow" />
              <span className="character-library-mascot-face">⌣</span>
            </div>
          )}
        </div>

        <div className="character-library-copy">
          <span className="character-library-status">
            {draft ? "등록 준비됨" : "사용 중"}
          </span>
          <h2>{draft ? "새 캐릭터" : "Luna"}</h2>
          <p>
            {draft
              ? "필수 이미지 2장이 준비되었습니다. 다음 설정 단계에서 이름과 행동을 이어서 구성할 수 있어요."
              : "현재 데스크톱에 표시되는 기본 Luna 캐릭터입니다."}
          </p>

          {draft && (
            <button
              type="button"
              className="character-draft-edit"
              onClick={onAddCharacter}
            >
              이미지 다시 확인하기
            </button>
          )}
        </div>
      </section>

      <div className="character-library-note">
        <strong>캐릭터를 더 추가하고 싶나요?</strong>
        <span>
          상단의 ‘캐릭터 추가하기’ 버튼에서 기본 상태와 움직이는 상태 이미지를 등록할 수 있어요.
        </span>
      </div>
    </div>
  );
}
