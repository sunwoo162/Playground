import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

export type CharacterDraft = {
  baseImage: File;
  motionImage: File;
  name?: string;
  motionName?: string;
  frameDurationMs?: number;
  loop?: boolean;
};

type CharacterCreatePageProps = {
  initialDraft: CharacterDraft | null;
  onCancel: () => void;
  onNext: (draft: CharacterDraft) => void;
};

type ImageUploadCardProps = {
  id: string;
  title: string;
  description: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);

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

function validateImage(file: File) {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return "PNG, JPG, JPEG 파일만 사용할 수 있어요.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "이미지는 10MB 이하로 등록해 주세요.";
  }

  return null;
}

function ImagePlaceholder() {
  return (
    <div className="character-preview-placeholder" aria-hidden="true">
      <span className="character-preview-hair" />
      <span className="character-preview-eye left" />
      <span className="character-preview-eye right" />
      <span className="character-preview-mouth">⌣</span>
    </div>
  );
}

function ImageUploadCard({
  id,
  title,
  description,
  file,
  onFileChange,
}: ImageUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useObjectUrl(file);

  const setImage = (nextFile: File | null) => {
    if (!nextFile) {
      return;
    }

    const validationError = validateImage(nextFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    onFileChange(nextFile);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    setImage(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    setImage(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <section className="character-upload-card">
      <div className="character-upload-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="required-badge">필수</span>
      </div>

      <div className="character-upload-layout">
        <div>
          <div
            className={`character-drop-zone ${isDragging ? "dragging" : ""} ${
              file ? "has-file" : ""
            }`}
            onDragEnter={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event: DragEvent<HTMLDivElement>) => event.preventDefault()}
            onDragLeave={(event: DragEvent<HTMLDivElement>) => {
              if (event.currentTarget === event.target) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <input
              ref={inputRef}
              id={id}
              className="character-file-input"
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              onChange={handleInput}
            />

            <span className="character-upload-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <rect x="5" y="6" width="22" height="20" rx="3" />
                <circle cx="12" cy="13" r="2.2" />
                <path d="m8 23 6-6 4 4 3-3 4 5" />
              </svg>
            </span>

            <strong>
              {file ? file.name : "이미지 선택 또는 드래그 앤 드롭"}
            </strong>
            <span>PNG 권장, 정사각형(1:1) 권장 · 최대 10MB</span>

            {file && (
              <button
                type="button"
                className="character-file-change"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                다른 이미지 선택
              </button>
            )}
          </div>

          {error && <p className="character-upload-error">{error}</p>}
        </div>

        <div className="character-preview-column">
          <span className="character-preview-label">미리보기</span>
          <div className="character-preview-box">
            {previewUrl ? (
              <img src={previewUrl} alt={`${title} 미리보기`} />
            ) : (
              <ImagePlaceholder />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CharacterCreatePage({
  initialDraft,
  onCancel,
  onNext,
}: CharacterCreatePageProps) {
  const [baseImage, setBaseImage] = useState<File | null>(
    initialDraft?.baseImage ?? null,
  );
  const [motionImage, setMotionImage] = useState<File | null>(
    initialDraft?.motionImage ?? null,
  );

  const canContinue = Boolean(baseImage && motionImage);

  const handleNext = () => {
    if (!baseImage || !motionImage) {
      return;
    }

    onNext({
      ...initialDraft,
      baseImage,
      motionImage,
    });
  };

  return (
    <div className="character-create-page">
      <header className="character-create-header">
        <button
          className="character-back-button"
          type="button"
          onClick={onCancel}
          aria-label="캐릭터 페이지로 돌아가기"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>

        <div>
          <h1>캐릭터 추가하기</h1>
          <p>새로운 캐릭터의 필수 사진을 등록해 주세요.</p>
        </div>
      </header>

      <div className="character-create-content">
        <ImageUploadCard
          id="base-character-image"
          title="필요 사진 1 : 기본 상태"
          description="캐릭터의 기본 자세가 보이는 이미지를 업로드해 주세요."
          file={baseImage}
          onFileChange={setBaseImage}
        />

        <ImageUploadCard
          id="motion-character-image"
          title="필요 사진 2 : 움직이는 상태 (예: 걷기, 뛰기 등)"
          description="캐릭터가 움직이는 모습이 보이는 이미지를 업로드해 주세요."
          file={motionImage}
          onFileChange={setMotionImage}
        />
      </div>

      <footer className="character-create-footer">
        <button
          type="button"
          className="character-footer-button secondary"
          onClick={onCancel}
        >
          취소
        </button>
        <button
          type="button"
          className="character-footer-button primary"
          disabled={!canContinue}
          onClick={handleNext}
        >
          다음
        </button>
      </footer>
    </div>
  );
}
