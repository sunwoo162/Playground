import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
  headRoll: number;
  body: number;
  leftArm: number;
  rightArm: number;
  leftHandX: number;
  rightHandX: number;
  mouth: number;
  blink: number;
  breathe: number;
  energy: number;
};

const EMPTY_MOTION: Motion = {
  headX: 0,
  headY: 0,
  headRoll: 0,
  body: 0,
  leftArm: 0,
  rightArm: 0,
  leftHandX: 0,
  rightHandX: 0,
  mouth: 0,
  blink: 0,
  breathe: 0,
  energy: 0,
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const blinkRef = useRef({ next: performance.now() + 1400, until: 0 });
  const [cameraOn, setCameraOn] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [showRig, setShowRig] = useState(true);
  const [expression, setExpression] = useState(EXPRESSIONS[0]);
  const [background, setBackground] = useState(BACKGROUNDS[1]);
  const [modelName, setModelName] = useState('일본 방송 스타일 기본 캐릭터');
  const [motion, setMotion] = useState<Motion>(EMPTY_MOTION);
  const [sensitivity, setSensitivity] = useState(1.05);
  const [smooth, setSmooth] = useState(0.66);

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
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 960, height: 540, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setupAudio(stream);
    setCameraOn(true);
    trackMotion();
  }

  function stopCamera() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    previousFrame.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    audioDataRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setMotion(EMPTY_MOTION);
  }

  function setupAudio(stream: MediaStream) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.48;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    audioDataRef.current = new Uint8Array(analyser.frequencyBinCount);
  }

  function trackMotion() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!video || !canvas || !context) return;

    const width = 144;
    const height = 81;
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
      let faceLeft = 0;
      let faceRight = 0;
      let faceTop = 0;
      let faceBottom = 0;
      let torsoLeft = 0;
      let torsoRight = 0;
      let armLeft = 0;
      let armRight = 0;
      let leftHandX = 0;
      let rightHandX = 0;
      let total = 0;

      if (last) {
        for (let y = 0; y < height; y += 3) {
          for (let x = 0; x < width; x += 3) {
            const index = (y * width + x) * 4;
            const diff = Math.abs(frame.data[index] - last.data[index])
              + Math.abs(frame.data[index + 1] - last.data[index + 1])
              + Math.abs(frame.data[index + 2] - last.data[index + 2]);
            const amount = diff / 765;
            total += amount;
            const nx = x / width;
            const ny = y / height;
            if (ny < 0.52 && nx > 0.26 && nx < 0.74) {
              if (nx < 0.5) faceLeft += amount;
              else faceRight += amount;
              if (ny < 0.28) faceTop += amount;
              else faceBottom += amount;
            } else if (ny >= 0.38 && nx > 0.3 && nx < 0.7) {
              if (nx < 0.5) torsoLeft += amount;
              else torsoRight += amount;
            } else if (ny > 0.25 && nx <= 0.34) {
              armLeft += amount;
              leftHandX += amount * (1 - nx);
            } else if (ny > 0.25 && nx >= 0.66) {
              armRight += amount;
              rightHandX += amount * nx;
            }
          }
        }
      }

      previousFrame.current = frame;
      const now = performance.now();
      if (now > blinkRef.current.next) {
        blinkRef.current.until = now + 130;
        blinkRef.current.next = now + 1800 + Math.random() * 2600;
      }
      const analyser = analyserRef.current;
      const audioData = audioDataRef.current;
      let voice = 0;
      if (analyser && audioData) {
        analyser.getByteFrequencyData(audioData);
        const speechBand = audioData.slice(2, 40).reduce((sum, value) => sum + value, 0) / 38;
        voice = clamp((speechBand - 18) / 90, 0, 1);
      }

      const faceBalanceX = clamp((faceRight - faceLeft) * sensitivity * 2.8, -1, 1);
      const faceBalanceY = clamp((faceTop - faceBottom) * sensitivity * 2.2, -1, 1);
      const armLeftValue = clamp(armLeft * sensitivity * 0.1, 0, 1);
      const armRightValue = clamp(armRight * sensitivity * 0.1, 0, 1);
      const energy = clamp(total * sensitivity * 0.028, 0, 1);
      const blink = now < blinkRef.current.until ? 1 : 0;
      const breathe = (Math.sin(now / 820) + 1) / 2;

      setMotion((current) => ({
        headX: mix(faceBalanceX, current.headX, smooth * 0.82),
        headY: mix(faceBalanceY, current.headY, smooth * 0.82),
        headRoll: mix((faceRight - faceLeft) * sensitivity * 0.62, current.headRoll, smooth * 0.78),
        body: mix((torsoRight - torsoLeft) * sensitivity * 0.86, current.body, smooth),
        leftArm: mix(armLeftValue, current.leftArm, smooth * 0.58),
        rightArm: mix(armRightValue, current.rightArm, smooth * 0.58),
        leftHandX: mix(clamp(leftHandX * sensitivity * 0.095, 0, 1), current.leftHandX, smooth * 0.48),
        rightHandX: mix(clamp(rightHandX * sensitivity * 0.095, 0, 1), current.rightHandX, smooth * 0.48),
        mouth: mix(Math.max(voice, energy * 0.42), current.mouth, 0.34),
        blink: mix(blink, current.blink, 0.22),
        breathe: mix(breathe, current.breathe, 0.86),
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
  const mouthBase = expression.mouth === 'open' || expression.mouth === 'shout' ? 0.55 : expression.mouth === 'smile' || expression.mouth === 'cat' ? 0.28 : 0.12;
  const eyeOpen = expression.eyes === 'happy' || expression.eyes === 'sleepy' ? 0.28 : expression.eyes === 'wink' ? 0.56 : 1;
  const blink = expression.eyes === 'wink' ? 0.8 : motion.blink;

  return (
    <div
      className={`rigged-avatar expression-${expression.key} eyes-${expression.eyes} mouth-${expression.mouth} brow-${expression.brow}`}
      style={{
        '--head-x': `${motion.headX * 26}px`,
        '--head-y': `${motion.headY * 18 - motion.energy * 10}px`,
        '--head-roll': `${motion.headRoll * 26}deg`,
        '--body-roll': `${motion.body * 14}deg`,
        '--left-arm': `${-20 - motion.leftArm * 118}deg`,
        '--right-arm': `${20 + motion.rightArm * 118}deg`,
        '--left-forearm': `${-26 - motion.leftHandX * 104}deg`,
        '--right-forearm': `${26 + motion.rightHandX * 104}deg`,
        '--left-hand-y': `${motion.leftArm * -82}px`,
        '--right-hand-y': `${motion.rightArm * -82}px`,
        '--left-hand-x': `${motion.leftHandX * -34}px`,
        '--right-hand-x': `${motion.rightHandX * 34}px`,
        '--mouth-open': mouthBase + motion.mouth * 0.92,
        '--eye-open': Math.max(0.04, eyeOpen * (1 - blink)),
        '--blink': blink,
        '--breathe': motion.breathe,
        '--hair-sway': `${motion.headX * -24}px`,
        '--energy': motion.energy,
      } as React.CSSProperties}
    >
      <div className="avatar-ground" />
      <div className="torso-rig">
        <div className="arm-rig left">
          <span className="upper-arm" />
          <span className="forearm" />
          <span className="hand" />
        </div>
        <div className="arm-rig right">
          <span className="upper-arm" />
          <span className="forearm" />
          <span className="hand" />
        </div>
        <div className="body-core">
          <span className="jacket left" />
          <span className="jacket right" />
          <span className="shirt" />
          <span className="tie" />
          <span className="collar left" />
          <span className="collar right" />
        </div>
      </div>
      <div className="head-rig">
        <div className="hair-back-rig">
          <span className="tail left" />
          <span className="tail right" />
        </div>
        <div className="neck-rig" />
        <div className="face-rigged">
          <span className="ear left" />
          <span className="ear right" />
          <span className="face-base" />
          <span className="bang bang-1" />
          <span className="bang bang-2" />
          <span className="bang bang-3" />
          <span className="brow-line left" />
          <span className="brow-line right" />
          <span className="eye-socket left">
            <i className="iris" />
            <i className="lid" />
          </span>
          <span className="eye-socket right">
            <i className="iris" />
            <i className="lid" />
          </span>
          <span className="nose" />
          <span className="mouth-rigged" />
          {expression.blush && (
            <>
              <span className="cheek left" />
              <span className="cheek right" />
            </>
          )}
        </div>
      </div>
      {showRig && (
        <div className="image-rig-points live">
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
