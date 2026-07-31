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

type VisionBundle = {
  FaceLandmarker: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<VisionLandmarker>;
  };
  PoseLandmarker: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<VisionLandmarker>;
  };
  FilesetResolver: {
    forVisionTasks: (root: string) => Promise<unknown>;
  };
};

type VisionLandmarker = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
    faceLandmarks?: Landmark[][];
    landmarks?: Landmark[][];
  };
};

type Landmark = {
  x: number;
  y: number;
  z?: number;
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

const DEFAULT_VRM_URL = 'https://raw.githubusercontent.com/madjin/vrm-samples/master/Avatar_Orion.vrm';

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const previousFrame = useRef<ImageData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Uint8Array | null>(null);
  const blinkRef = useRef({ next: performance.now() + 1400, until: 0 });
  const faceLandmarkerRef = useRef<VisionLandmarker | null>(null);
  const poseLandmarkerRef = useRef<VisionLandmarker | null>(null);
  const visionLoadingRef = useRef(false);
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
    void setupVisionTracking();
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
    faceLandmarkerRef.current = null;
    poseLandmarkerRef.current = null;
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

  async function setupVisionTracking() {
    if (visionLoadingRef.current || faceLandmarkerRef.current || poseLandmarkerRef.current) return;
    visionLoadingRef.current = true;
    try {
      const visionModuleUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs';
      const vision = await import(
        /* @vite-ignore */
        visionModuleUrl
      ) as VisionBundle;
      const fileset = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm'
      );
      const [faceLandmarker, poseLandmarker] = await Promise.all([
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        }),
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ]);
      faceLandmarkerRef.current = faceLandmarker;
      poseLandmarkerRef.current = poseLandmarker;
    } catch (error) {
      console.warn('MediaPipe tracking failed, using motion fallback.', error);
    } finally {
      visionLoadingRef.current = false;
    }
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
      const visionMotion = readVisionMotion(video);
      if (visionMotion) {
        setMotion((current) => ({
          headX: mix(visionMotion.headX, current.headX, 0.62),
          headY: mix(visionMotion.headY, current.headY, 0.62),
          headRoll: mix(visionMotion.headRoll, current.headRoll, 0.58),
          body: mix(visionMotion.body, current.body, 0.7),
          leftArm: mix(visionMotion.leftArm, current.leftArm, 0.48),
          rightArm: mix(visionMotion.rightArm, current.rightArm, 0.48),
          leftHandX: mix(visionMotion.leftHandX, current.leftHandX, 0.44),
          rightHandX: mix(visionMotion.rightHandX, current.rightHandX, 0.44),
          mouth: mix(Math.max(visionMotion.mouth, readVoiceLevel()), current.mouth, 0.28),
          blink: mix(visionMotion.blink, current.blink, 0.18),
          breathe: mix(visionMotion.breathe, current.breathe, 0.86),
          energy: mix(visionMotion.energy, current.energy, 0.68),
        }));
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
      const voice = readVoiceLevel();

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

  function readVisionMotion(video: HTMLVideoElement): Motion | null {
    const faceLandmarker = faceLandmarkerRef.current;
    const poseLandmarker = poseLandmarkerRef.current;
    if (!faceLandmarker || !poseLandmarker) return null;

    const now = performance.now();
    const face = faceLandmarker.detectForVideo(video, now).faceLandmarks?.[0];
    const pose = poseLandmarker.detectForVideo(video, now).landmarks?.[0];
    if (!face && !pose) return null;

    const nose = face?.[1];
    const chin = face?.[152];
    const forehead = face?.[10];
    const leftEyeTop = face?.[159];
    const leftEyeBottom = face?.[145];
    const rightEyeTop = face?.[386];
    const rightEyeBottom = face?.[374];
    const mouthTop = face?.[13];
    const mouthBottom = face?.[14];
    const mouthLeft = face?.[61];
    const mouthRight = face?.[291];

    const leftShoulder = pose?.[11];
    const rightShoulder = pose?.[12];
    const leftElbow = pose?.[13];
    const rightElbow = pose?.[14];
    const leftWrist = pose?.[15];
    const rightWrist = pose?.[16];

    const eyeGap = averageDistance(leftEyeTop, leftEyeBottom, rightEyeTop, rightEyeBottom);
    const mouthHeight = distance(mouthTop, mouthBottom);
    const mouthWidth = distance(mouthLeft, mouthRight);
    const shoulderTilt = leftShoulder && rightShoulder ? rightShoulder.y - leftShoulder.y : 0;
    const faceHeight = distance(forehead, chin) || 0.28;

    const leftArmRaise = leftShoulder && leftWrist ? clamp((leftShoulder.y - leftWrist.y + 0.18) * 2.4, 0, 1) : 0;
    const rightArmRaise = rightShoulder && rightWrist ? clamp((rightShoulder.y - rightWrist.y + 0.18) * 2.4, 0, 1) : 0;
    const leftHandSide = leftShoulder && leftWrist ? clamp((leftShoulder.x - leftWrist.x + 0.28) * 1.8, 0, 1) : 0;
    const rightHandSide = rightShoulder && rightWrist ? clamp((rightWrist.x - rightShoulder.x + 0.28) * 1.8, 0, 1) : 0;
    const elbowEnergy = (distance(leftElbow, leftWrist) + distance(rightElbow, rightWrist)) * 0.7;

    return {
      headX: nose ? clamp((0.5 - nose.x) * 3.1, -1, 1) : 0,
      headY: nose ? clamp((0.42 - nose.y) * 2.7, -1, 1) : 0,
      headRoll: clamp(shoulderTilt * 3.8, -1, 1),
      body: clamp(shoulderTilt * 2.6, -1, 1),
      leftArm: leftArmRaise,
      rightArm: rightArmRaise,
      leftHandX: leftHandSide,
      rightHandX: rightHandSide,
      mouth: clamp((mouthHeight / Math.max(mouthWidth, 0.01)) * 2.2, 0, 1),
      blink: clamp(1 - (eyeGap / faceHeight) * 18, 0, 1),
      breathe: (Math.sin(now / 820) + 1) / 2,
      energy: clamp(Math.max(leftArmRaise, rightArmRaise, elbowEnergy), 0, 1),
    };
  }

  function readVoiceLevel() {
    const analyser = analyserRef.current;
    const audioData = audioDataRef.current;
    if (!analyser || !audioData) return 0;
    analyser.getByteFrequencyData(audioData);
    const speechBand = audioData.slice(2, 40).reduce((sum, value) => sum + value, 0) / 38;
    return clamp((speechBand - 18) / 90, 0, 1);
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
        <VrmAvatar expression={expression} motion={motion} showRig={showRig} />
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

function VrmAvatar({ expression, motion, showRig }: { expression: Expression; motion: Motion; showRig: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionRef = useRef(motion);
  const expressionRef = useRef(expression);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    let renderer: any;

    async function boot() {
      try {
        const threeUrl = 'https://esm.sh/three@0.180.0';
        const gltfLoaderUrl = 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';
        const threeVrmUrl = 'https://esm.sh/@pixiv/three-vrm@3.5.3?deps=three@0.180.0';
        const [THREE, gltfModule, vrmModule] = await Promise.all([
          import(/* @vite-ignore */ threeUrl),
          import(/* @vite-ignore */ gltfLoaderUrl),
          import(/* @vite-ignore */ threeVrmUrl),
        ]);
        if (disposed || !canvasRef.current) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
        camera.position.set(0, 1.34, 2.75);
        renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(1.4, 2.5, 2.8);
        scene.add(keyLight);
        scene.add(new THREE.AmbientLight(0xffffff, 1.9));

        const loader = new gltfModule.GLTFLoader();
        loader.register((parser: unknown) => new vrmModule.VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(DEFAULT_VRM_URL);
        if (disposed) return;

        const vrm = gltf.userData.vrm;
        vrmModule.VRMUtils?.removeUnnecessaryVertices?.(vrm.scene);
        vrmModule.VRMUtils?.removeUnnecessaryJoints?.(vrm.scene);
        vrm.scene.rotation.y = Math.PI;
        vrm.scene.position.set(0, -0.95, 0);
        scene.add(vrm.scene);

        const clock = new THREE.Clock();
        const resize = () => {
          if (!canvasRef.current || !renderer) return;
          const rect = canvasRef.current.getBoundingClientRect();
          renderer.setSize(rect.width, rect.height, false);
          camera.aspect = rect.width / Math.max(rect.height, 1);
          camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener('resize', resize);

        const animate = () => {
          if (disposed) return;
          const delta = clock.getDelta();
          const currentMotion = motionRef.current;
          const currentExpression = expressionRef.current;
          applyVrmMotion(vrm, currentMotion, currentExpression);
          vrm.update?.(delta);
          renderer.render(scene, camera);
          animationFrame = requestAnimationFrame(animate);
        };
        animate();

        return () => {
          window.removeEventListener('resize', resize);
        };
      } catch (error) {
        console.error('Failed to load VRM avatar.', error);
        setFailed(true);
      }
    }

    let cleanup: (() => void) | undefined;
    void boot().then((nextCleanup) => {
      cleanup = nextCleanup;
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      cleanup?.();
      renderer?.dispose?.();
    };
  }, []);

  return (
    <div className="vrm-avatar-wrap">
      <canvas ref={canvasRef} className="vrm-canvas" />
      {failed && <BroadcastAvatar expression={expression} motion={motion} showRig={showRig} />}
      {showRig && <div className="vrm-source-label">VRoid sample VRM</div>}
    </div>
  );
}

function applyVrmMotion(vrm: any, motion: Motion, expression: Expression) {
  const humanoid = vrm.humanoid;
  rotateBone(humanoid, 'head', motion.headY * -0.42, motion.headX * 0.52, motion.headRoll * -0.38);
  rotateBone(humanoid, 'neck', motion.headY * -0.18, motion.headX * 0.22, motion.headRoll * -0.16);
  rotateBone(humanoid, 'spine', motion.breathe * 0.018, motion.body * 0.1, motion.body * -0.12);
  rotateBone(humanoid, 'chest', motion.breathe * 0.024, motion.body * 0.16, motion.body * -0.18);
  rotateBone(humanoid, 'leftUpperArm', -0.25 - motion.leftArm * 1.18, 0.18 + motion.leftHandX * 0.52, 0.38);
  rotateBone(humanoid, 'leftLowerArm', -0.25 - motion.leftHandX * 1.26, 0.1, 0.16);
  rotateBone(humanoid, 'rightUpperArm', -0.25 - motion.rightArm * 1.18, -0.18 - motion.rightHandX * 0.52, -0.38);
  rotateBone(humanoid, 'rightLowerArm', -0.25 - motion.rightHandX * 1.26, -0.1, -0.16);

  const expressions = vrm.expressionManager;
  if (!expressions) return;
  setExpressionValue(expressions, 'aa', Math.max(motion.mouth, expression.mouth === 'open' || expression.mouth === 'shout' ? 0.65 : 0));
  setExpressionValue(expressions, 'blink', motion.blink);
  setExpressionValue(expressions, 'happy', expression.eyes === 'happy' || expression.mouth === 'smile' ? 0.8 : 0);
  setExpressionValue(expressions, 'angry', expression.eyes === 'angry' ? 0.85 : 0);
  setExpressionValue(expressions, 'sad', expression.eyes === 'sad' ? 0.8 : 0);
  setExpressionValue(expressions, 'surprised', expression.eyes === 'sparkle' ? 0.75 : 0);
}

function rotateBone(humanoid: any, boneName: string, x: number, y: number, z: number) {
  const bone = humanoid?.getNormalizedBoneNode?.(boneName);
  if (!bone) return;
  bone.rotation.x = mix(x, bone.rotation.x, 0.58);
  bone.rotation.y = mix(y, bone.rotation.y, 0.58);
  bone.rotation.z = mix(z, bone.rotation.z, 0.58);
}

function setExpressionValue(manager: any, name: string, value: number) {
  try {
    manager.setValue(name, clamp(value, 0, 1));
  } catch {
    // Some VRM files do not include every preset expression.
  }
}

function BroadcastAvatar({ expression, motion, showRig }: { expression: Expression; motion: Motion; showRig: boolean }) {
  const mouthBase = expression.mouth === 'open' || expression.mouth === 'shout' ? 0.55 : expression.mouth === 'smile' || expression.mouth === 'cat' ? 0.28 : 0.12;
  const eyeOpen = expression.eyes === 'happy' || expression.eyes === 'sleepy' ? 0.28 : expression.eyes === 'wink' ? 0.56 : 1;
  const blink = expression.eyes === 'wink' ? 0.8 : motion.blink;
  const mouthOpen = mouthBase + motion.mouth * 0.92;

  return (
    <div
      className={`hybrid-avatar expression-${expression.key} eyes-${expression.eyes} mouth-${expression.mouth} brow-${expression.brow}`}
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
        '--mouth-open': mouthOpen,
        '--eye-open': Math.max(0.04, eyeOpen * (1 - blink)),
        '--blink': blink,
        '--breathe': motion.breathe,
        '--hair-sway': `${motion.headX * -24}px`,
        '--energy': motion.energy,
      } as React.CSSProperties}
    >
      <div className="character-shadow" />
      <img src={vtuberCharacter} alt="일본 방송 스타일 VTuber 캐릭터" className="avatar-source base" />
      <img src={vtuberCharacter} alt="" aria-hidden="true" className="avatar-source head-layer" />
      <img src={vtuberCharacter} alt="" aria-hidden="true" className="avatar-source hair-layer" />
      <img src={vtuberCharacter} alt="" aria-hidden="true" className="avatar-source arm-layer left" />
      <img src={vtuberCharacter} alt="" aria-hidden="true" className="avatar-source arm-layer right" />
      <div className="live-face-rig">
        <span className="live-eye left"><i /></span>
        <span className="live-eye right"><i /></span>
        <span className="live-mouth" />
        {expression.blush && (
          <>
            <span className="live-cheek left" />
            <span className="live-cheek right" />
          </>
        )}
      </div>
      <div className="hand-energy left" />
      <div className="hand-energy right" />
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

function distance(a: Landmark | undefined, b: Landmark | undefined) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averageDistance(
  firstA: Landmark | undefined,
  firstB: Landmark | undefined,
  secondA: Landmark | undefined,
  secondB: Landmark | undefined,
) {
  const first = distance(firstA, firstB);
  const second = distance(secondA, secondB);
  if (!first && !second) return 0;
  if (!first) return second;
  if (!second) return first;
  return (first + second) / 2;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
