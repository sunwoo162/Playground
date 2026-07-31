import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import vtuberCharacter from './assets/vtuber-character.png';
import './styles.css';

type Expression = {
  key: number;
  name: string;
  eyes: 'open' | 'happy' | 'angry' | 'sad' | 'wink' | 'sparkle' | 'sleepy';
  mouth: 'soft' | 'smile' | 'open' | 'flat' | 'shout' | 'cat';
  brow: 'calm' | 'up' | 'down' | 'sad';
  blush: boolean;
};

type Background = {
  id: string;
  name: string;
  className: string;
};

type Motion = {
  headX: number;
  headY: number;
  body: number;
  leftArm: number;
  rightArm: number;
  energy: number;
};

const EXPRESSIONS: Expression[] = [
  { key: 1, name: '기본', eyes: 'open', mouth: 'soft', brow: 'calm', blush: false },
  { key: 2, name: '웃음', eyes: 'happy', mouth: 'smile', brow: 'up', blush: true },
  { key: 3, name: '놀람', eyes: 'sparkle', mouth: 'open', brow: 'up', blush: false },
  { key: 4, name: '화남', eyes: 'angry', mouth: 'flat', brow: 'down', blush: false },
  { key: 5, name: '슬픔', eyes: 'sad', mouth: 'soft', brow: 'sad', blush: false },
  { key: 6, name: '윙크', eyes: 'wink', mouth: 'cat', brow: 'up', blush: true },
  { key: 7, name: '졸림', eyes: 'sleepy', mouth: 'soft', brow: 'sad', blush: false },
  { key: 8, name: '집중', eyes: 'open', mouth: 'flat', brow: 'down', blush: false },
  { key: 9, name: '외침', eyes: 'sparkle', mouth: 'shout', brow: 'up', blush: true },
];

const BACKGROUNDS: Background[] = [
  { id: 'green', name: '크로마키', className: 'bg-green' },
  { id: 'studio', name: '네온 스튜디오', className: 'bg-studio' },
  { id: 'night', name: '밤하늘 방', className: 'bg-night' },
  { id: 'classroom', name: '방과후 교실', className: 'bg-classroom' },
  { id: 'transparent', name: 'OBS 투명', className: 'bg-transparent' },
];

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const previousFrame = useRef<ImageData | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [showRig, setShowRig] = useState(true);
  const [expression, setExpression] = useState(EXPRESSIONS[0]);
  const [background, setBackground] = useState(BACKGROUNDS[1]);
  const [modelName, setModelName] = useState('일본 방송 스타일 기본 캐릭터');
  const [motion, setMotion] = useState<Motion>({ headX: 0, headY: 0, body: 0, leftArm: 0, rightArm: 0, energy: 0 });
  const [sensitivity, setSensitivity] = useState(0.85);
  const [smooth, setSmooth] = useState(0.72);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const next = EXPRESSIONS.find((item) => String(item.key) === event.key);
      if (next) setExpression(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const status = useMemo(() => {
    if (!cameraOn) return '카메라 대기';
    return `트래킹 중 ${Math.round(motion.energy * 100)}%`;
  }, [cameraOn, motion.energy]);

  async function toggleCamera() {
    if (cameraOn) {
      stopCamera();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setCameraOn(true);
    trackMotion();
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    previousFrame.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setMotion({ headX: 0, headY: 0, body: 0, leftArm: 0, rightArm: 0, energy: 0 });
  }

  function trackMotion() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!video || !canvas || !context) return;

    const width = 96;
    const height = 54;
    canvas.width = width;
    canvas.height = height;

    const step = () => {
      if (!video.videoWidth) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const last = previousFrame.current;
      let left = 0;
      let right = 0;
      let top = 0;
      let bottom = 0;
      let total = 0;

      if (last) {
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            const index = (y * width + x) * 4;
            const diff = Math.abs(frame.data[index] - last.data[index])
              + Math.abs(frame.data[index + 1] - last.data[index + 1])
              + Math.abs(frame.data[index + 2] - last.data[index + 2]);
            const amount = diff / 765;
            total += amount;
            if (x < width / 2) left += amount;
            else right += amount;
            if (y < height / 2) top += amount;
            else bottom += amount;
          }
        }
      }

      previousFrame.current = frame;
      const balanceX = clamp((right - left) * sensitivity * 1.8, -1, 1);
      const balanceY = clamp((top - bottom) * sensitivity * 1.8, -1, 1);
      const leftArm = clamp(left * sensitivity * 0.08, 0, 1);
      const rightArm = clamp(right * sensitivity * 0.08, 0, 1);
      const energy = clamp(total * sensitivity * 0.018, 0, 1);

      setMotion((current) => ({
        headX: mix(balanceX, current.headX, smooth),
        headY: mix(balanceY, current.headY, smooth),
        body: mix((right - left) * sensitivity * 0.4, current.body, smooth),
        leftArm: mix(leftArm, current.leftArm, smooth),
        rightArm: mix(rightArm, current.rightArm, smooth),
        energy: mix(energy, current.energy, smooth),
      }));
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }

  function uploadModel(file: File | undefined) {
    if (!file) return;
    setModelName(file.name);
  }

  return (
    <main className="avatar-app">
      <section className={`stage ${background.className}`}>
        <div className="status-pill"><span />{status}</div>
        {showCamera && <video ref={videoRef} className="camera-preview" muted playsInline />}
        <canvas ref={canvasRef} hidden />
        <BroadcastAvatar expression={expression} motion={motion} showRig={showRig} />
      </section>

      <aside className="control-panel">
        <div className="brand">
          <h1>Levenant</h1>
          <p>Virtual Avatar Studio</p>
        </div>

        <section className="panel-card">
          <h2>1. 카메라</h2>
          <button className={cameraOn ? 'danger' : 'primary'} onClick={toggleCamera}>
            {cameraOn ? '카메라 중지' : '카메라 시작'}
          </button>
          <label><input type="checkbox" checked={showCamera} onChange={(e) => setShowCamera(e.target.checked)} /> 셀프뷰 표시</label>
          <label><input type="checkbox" checked={showRig} onChange={(e) => setShowRig(e.target.checked)} /> 리깅 포인트 표시</label>
        </section>

        <section className="panel-card">
          <h2>2. 가상 모델</h2>
          <label className="file-button">
            .model3.json / .vrm 업로드
            <input type="file" accept=".json,.model3.json,.vrm" onChange={(event) => uploadModel(event.target.files?.[0])} />
          </label>
          <p className="model-name">{modelName}</p>
        </section>

        <section className="panel-card">
          <h2>3. 리깅 조절</h2>
          <Slider label="민감도" value={sensitivity} min={0.3} max={1.6} step={0.05} onChange={setSensitivity} />
          <Slider label="부드러움" value={smooth} min={0.2} max={0.92} step={0.02} onChange={setSmooth} />
        </section>

        <section className="panel-card">
          <h2>4. 배경</h2>
          <div className="background-grid">
            {BACKGROUNDS.map((item) => (
              <button
                key={item.id}
                className={item.id === background.id ? 'selected' : ''}
                onClick={() => setBackground(item)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>

        <section className="panel-card">
          <h2>5. 표정 단축키</h2>
          <div className="expression-grid">
            {EXPRESSIONS.map((item) => (
              <button
                key={item.key}
                className={item.key === expression.key ? 'selected' : ''}
                onClick={() => setExpression(item)}
              >
                <strong>{item.key}</strong>
                <span>{item.name}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </main>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-row">
      <span>{label}<strong>{value.toFixed(2)}</strong></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function BroadcastAvatar({ expression, motion, showRig }: { expression: Expression; motion: Motion; showRig: boolean }) {
  const lean = motion.headX * 10;
  const lift = -motion.energy * 16 + motion.headY * 8;
  const scale = 1 + motion.energy * 0.025;
  const hairShift = motion.headX * -8;
  const handGlow = Math.max(motion.leftArm, motion.rightArm);
  const eyeY = expression.eyes === 'happy' ? 4 : expression.eyes === 'sad' ? 8 : expression.eyes === 'sleepy' ? 7 : 0;
  const mouthOpen = expression.mouth === 'open' || expression.mouth === 'shout' ? 1 : expression.mouth === 'smile' || expression.mouth === 'cat' ? 0.55 : 0.18;

  return (
    <div
      className={`broadcast-avatar expression-${expression.key}`}
      style={{
        '--avatar-lean': `${lean}deg`,
        '--avatar-lift': `${lift}px`,
        '--avatar-scale': scale,
        '--hair-shift': `${hairShift}px`,
        '--hand-glow': handGlow,
        '--eye-y': `${eyeY}px`,
        '--mouth-open': mouthOpen,
      } as React.CSSProperties}
    >
      <div className="character-shadow" />
      <div className="character-layer hair-echo" />
      <img src={vtuberCharacter} alt="일본 방송 스타일 VTuber 캐릭터" className="character-img" />
      <div className="face-rig">
        <span className="rig-eye rig-eye-left" />
        <span className="rig-eye rig-eye-right" />
        <span className="rig-mouth" />
      </div>
      <div className="hand-energy left" />
      <div className="hand-energy right" />
      {showRig && (
        <div className="image-rig-points">
          <span className="head" />
          <span className="body" />
          <span className="hand-left" />
          <span className="hand-right" />
        </div>
      )}
    </div>
  );
}

function Avatar({ expression, motion, showRig }: { expression: Expression; motion: Motion; showRig: boolean }) {
  const headTransform = `translate(${motion.headX * 12}px, ${motion.headY * 9}px) rotate(${motion.headX * 7}deg)`;
  const bodyTransform = `rotate(${motion.body * 8}deg)`;
  const leftArmTransform = `rotate(${-18 - motion.leftArm * 42}deg)`;
  const rightArmTransform = `rotate(${18 + motion.rightArm * 42}deg)`;

  return (
    <div className="avatar-wrap" style={{ '--head-transform': headTransform, '--body-transform': bodyTransform, '--left-arm': leftArmTransform, '--right-arm': rightArmTransform } as React.CSSProperties}>
      <svg className="avatar-svg" viewBox="0 0 520 760" role="img" aria-label="기본 버츄얼 아바타">
        <defs>
          <linearGradient id="hair" x1="0" x2="1">
            <stop offset="0" stopColor="#ff5f93" />
            <stop offset="0.55" stopColor="#b76cff" />
            <stop offset="1" stopColor="#5ee7ff" />
          </linearGradient>
          <linearGradient id="jacket" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#242739" />
            <stop offset="1" stopColor="#11131d" />
          </linearGradient>
        </defs>
        <g className="avatar-body">
          <path className="arm left-arm" d="M176 400 C102 452 80 558 114 642 C138 666 178 650 174 612 C166 548 192 500 232 458 Z" />
          <path className="arm right-arm" d="M344 400 C418 452 440 558 406 642 C382 666 342 650 346 612 C354 548 328 500 288 458 Z" />
          <path className="torso" d="M168 380 C204 348 318 348 352 380 L394 718 L126 718 Z" />
          <path className="shirt" d="M216 390 L260 458 L304 390 L332 718 L188 718 Z" />
          <path className="tie" d="M246 462 L274 462 L288 640 L260 690 L232 640 Z" />
          <path className="collar left" d="M206 388 L260 458 L222 496 L178 402 Z" />
          <path className="collar right" d="M314 388 L260 458 L298 496 L342 402 Z" />
        </g>
        <g className="avatar-head">
          <path className="twin-tail left" d="M186 178 C58 176 20 300 86 420 C36 512 98 574 178 500 C236 426 234 244 186 178 Z" />
          <path className="twin-tail right" d="M334 178 C462 176 500 300 434 420 C484 512 422 574 342 500 C284 426 286 244 334 178 Z" />
          <path className="hair-back" d="M154 230 C156 110 244 54 340 110 C404 150 420 264 380 348 L140 348 C108 294 110 248 154 230 Z" />
          <ellipse className="face" cx="260" cy="262" rx="118" ry="132" />
          <path className="bangs" d="M148 220 C184 94 320 76 376 174 C340 150 318 154 292 206 C280 166 244 142 212 142 C234 170 214 210 180 246 Z" />
          <g className={`brows brows-${expression.brow}`}>
            <path d="M202 238 L240 232" />
            <path d="M280 232 L318 238" />
          </g>
          <g className={`eyes eyes-${expression.eyes}`}>
            <path className="eye left-eye" d="M194 274 C206 258 230 258 242 274" />
            <path className="eye right-eye" d="M278 274 C290 258 314 258 326 274" />
          </g>
          <Mouth type={expression.mouth} />
          {expression.blush && (
            <g className="blush">
              <ellipse cx="186" cy="306" rx="28" ry="12" />
              <ellipse cx="334" cy="306" rx="28" ry="12" />
            </g>
          )}
          <path className="neck" d="M226 366 C238 392 282 392 294 366 L300 422 C278 448 242 448 220 422 Z" />
        </g>
        {showRig && (
          <g className="rig-points">
            <circle cx="260" cy="262" r="7" />
            <circle cx="160" cy="500" r="6" />
            <circle cx="360" cy="500" r="6" />
            <circle cx="260" cy="478" r="6" />
          </g>
        )}
      </svg>
    </div>
  );
}

function Mouth({ type }: { type: Expression['mouth'] }) {
  if (type === 'open') return <ellipse className="mouth mouth-fill" cx="260" cy="330" rx="22" ry="34" />;
  if (type === 'shout') return <ellipse className="mouth mouth-fill" cx="260" cy="326" rx="34" ry="42" />;
  if (type === 'smile') return <path className="mouth" d="M222 324 C242 354 280 354 300 324" />;
  if (type === 'flat') return <path className="mouth" d="M230 334 L290 334" />;
  if (type === 'cat') return <path className="mouth" d="M236 326 C248 344 260 326 260 326 C260 326 272 344 284 326" />;
  return <path className="mouth" d="M238 330 C252 340 268 340 282 330" />;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mix(next: number, current: number, smooth: number) {
  return current * smooth + next * (1 - smooth);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
