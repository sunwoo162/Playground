import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type VoicePreset = {
  id: string;
  name: string;
  tone: string;
  pitch: number;
  rate: number;
  filter: BiquadFilterType;
  frequency: number;
  distortion: number;
  delay: number;
  tremolo: number;
};

type NoteInfo = {
  frequency: number;
  note: string;
  cents: number;
};

const PRESETS: VoicePreset[] = [
  { id: 'clean', name: '클린', tone: '원본에 가까운 방송 목소리', pitch: 1, rate: 1, filter: 'highpass', frequency: 90, distortion: 0, delay: 0, tremolo: 0 },
  { id: 'streamer-warm', name: '방송인 웜톤', tone: '변조 티가 적은 따뜻한 진행자 톤', pitch: 0.97, rate: 0.98, filter: 'lowshelf', frequency: 180, distortion: 1, delay: 0.008, tremolo: 0 },
  { id: 'streamer-clear', name: '방송인 선명톤', tone: '말이 또렷하게 들리는 자연스러운 톤', pitch: 1.02, rate: 1.02, filter: 'highshelf', frequency: 2800, distortion: 0.5, delay: 0.006, tremolo: 0 },
  { id: 'streamer-soft', name: '편안한 라디오', tone: '오래 들어도 피곤하지 않은 부드러운 톤', pitch: 0.94, rate: 0.96, filter: 'lowpass', frequency: 3400, distortion: 0.8, delay: 0.035, tremolo: 0 },
  { id: 'streamer-bright', name: '상큼한 진행자', tone: '밝지만 과하지 않은 라이브 진행 톤', pitch: 1.08, rate: 1.04, filter: 'highshelf', frequency: 3600, distortion: 0.6, delay: 0.004, tremolo: 0.02 },
  { id: 'deep', name: '저음 아나운서', tone: '낮고 단단한 톤', pitch: 0.68, rate: 0.92, filter: 'lowshelf', frequency: 260, distortion: 6, delay: 0.02, tremolo: 0 },
  { id: 'bright', name: '밝은 아이돌', tone: '가볍고 선명한 톤', pitch: 1.34, rate: 1.08, filter: 'highshelf', frequency: 2400, distortion: 2, delay: 0.01, tremolo: 0.08 },
  { id: 'robot', name: '로봇', tone: '금속성 기계음', pitch: 0.9, rate: 0.95, filter: 'bandpass', frequency: 860, distortion: 36, delay: 0.035, tremolo: 0.78 },
  { id: 'radio', name: '무전기', tone: '좁은 대역 라디오', pitch: 0.86, rate: 1, filter: 'bandpass', frequency: 1200, distortion: 18, delay: 0.012, tremolo: 0.2 },
  { id: 'dream', name: '몽환 에코', tone: '공간감 있는 부드러운 목소리', pitch: 1.06, rate: 0.96, filter: 'lowpass', frequency: 2100, distortion: 1, delay: 0.18, tremolo: 0.12 },
  { id: 'villain', name: '빌런', tone: '거칠고 어두운 변조', pitch: 0.56, rate: 0.86, filter: 'lowshelf', frequency: 180, distortion: 42, delay: 0.045, tremolo: 0.28 },
  { id: 'chipmunk', name: '요정', tone: '높고 빠른 캐릭터 톤', pitch: 1.68, rate: 1.18, filter: 'highshelf', frequency: 3200, distortion: 4, delay: 0, tremolo: 0.1 },
];

const SCALES = {
  major: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  minor: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  pentatonic: ['C', 'D', 'E', 'G', 'A'],
};

function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [micOn, setMicOn] = useState(false);
  const [monitorOn, setMonitorOn] = useState(false);
  const [songMode, setSongMode] = useState(true);
  const [autoTune, setAutoTune] = useState(0.65);
  const [volume, setVolume] = useState(0.72);
  const [noteInfo, setNoteInfo] = useState<NoteInfo | null>(null);
  const [level, setLevel] = useState(0);
  const [scale, setScale] = useState<keyof typeof SCALES>('major');
  const [ttsText, setTtsText] = useState('안녕하세요. 보이스 스튜디오 테스트입니다.');
  const [ttsVoice, setTtsVoice] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const audioRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const shaperRef = useRef<WaveShaperNode | null>(null);
  const delayRef = useRef<DelayNode | null>(null);
  const feedbackRef = useRef<GainNode | null>(null);
  const tremoloGainRef = useRef<GainNode | null>(null);
  const tremoloOscRef = useRef<OscillatorNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const preset = useMemo(() => PRESETS.find((item) => item.id === presetId) ?? PRESETS[0], [presetId]);

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      stopMic();
    };
  }, []);

  useEffect(() => {
    applyPreset();
  }, [preset, volume, monitorOn]);

  async function toggleMic() {
    if (micOn) {
      stopMic();
      return;
    }

    const context = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    const filter = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const delay = context.createDelay(0.4);
    const feedback = context.createGain();
    const tremoloGain = context.createGain();
    const tremoloOsc = context.createOscillator();
    const monitorGain = context.createGain();
    const master = context.createGain();

    analyser.fftSize = 2048;
    tremoloOsc.type = 'sine';
    tremoloOsc.frequency.value = 6;
    tremoloGain.gain.value = 0;
    tremoloOsc.connect(tremoloGain);
    tremoloGain.connect(master.gain);

    source.connect(analyser);
    source.connect(filter);
    filter.connect(shaper);
    shaper.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(master);
    shaper.connect(master);
    master.connect(monitorGain);
    monitorGain.connect(context.destination);
    tremoloOsc.start();

    audioRef.current = context;
    streamRef.current = stream;
    sourceRef.current = source;
    analyserRef.current = analyser;
    gainRef.current = master;
    filterRef.current = filter;
    shaperRef.current = shaper;
    delayRef.current = delay;
    feedbackRef.current = feedback;
    tremoloGainRef.current = tremoloGain;
    tremoloOscRef.current = tremoloOsc;
    monitorGainRef.current = monitorGain;
    setMicOn(true);
    applyPreset();
    analyse();
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    tremoloOscRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.close();
    audioRef.current = null;
    streamRef.current = null;
    sourceRef.current = null;
    analyserRef.current = null;
    gainRef.current = null;
    filterRef.current = null;
    shaperRef.current = null;
    delayRef.current = null;
    feedbackRef.current = null;
    tremoloGainRef.current = null;
    tremoloOscRef.current = null;
    monitorGainRef.current = null;
    setMicOn(false);
    setLevel(0);
    setNoteInfo(null);
  }

  function applyPreset() {
    if (!audioRef.current) return;
    if (filterRef.current) {
      filterRef.current.type = preset.filter;
      filterRef.current.frequency.setTargetAtTime(preset.frequency, audioRef.current.currentTime, 0.04);
      filterRef.current.gain.setTargetAtTime(preset.filter.includes('shelf') ? 8 : 0, audioRef.current.currentTime, 0.04);
      filterRef.current.Q.setTargetAtTime(preset.filter === 'bandpass' ? 6 : 0.8, audioRef.current.currentTime, 0.04);
    }
    if (shaperRef.current) shaperRef.current.curve = makeDistortionCurve(preset.distortion + autoTune * 8);
    if (delayRef.current) delayRef.current.delayTime.setTargetAtTime(preset.delay + (songMode ? autoTune * 0.018 : 0), audioRef.current.currentTime, 0.05);
    if (feedbackRef.current) feedbackRef.current.gain.setTargetAtTime(Math.min(0.42, preset.delay * 1.8), audioRef.current.currentTime, 0.05);
    if (gainRef.current) gainRef.current.gain.setTargetAtTime(volume, audioRef.current.currentTime, 0.04);
    if (monitorGainRef.current) monitorGainRef.current.gain.setTargetAtTime(monitorOn ? 1 : 0, audioRef.current.currentTime, 0.04);
    if (tremoloGainRef.current) tremoloGainRef.current.gain.setTargetAtTime(preset.tremolo * 0.18, audioRef.current.currentTime, 0.04);
  }

  function analyse() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      setLevel(Math.min(1, rms * 9));
      const pitch = autoCorrelate(buffer, audioRef.current?.sampleRate || 44100);
      if (pitch > 0) setNoteInfo(toNoteInfo(pitch, scale));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function speak() {
    const text = ttsText.trim();
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find((item) => item.name === ttsVoice);
    if (voice) utterance.voice = voice;
    utterance.pitch = preset.pitch;
    utterance.rate = preset.rate;
    utterance.volume = volume;
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="voice-app">
      <section className="stage">
        <div className="scope">
          <div className="level-ring" style={{ '--level': level } as React.CSSProperties}>
            <span>{noteInfo?.note ?? '--'}</span>
          </div>
          <div className="tuner">
            <span>음정</span>
            <strong>{noteInfo ? `${noteInfo.frequency.toFixed(1)} Hz` : '대기 중'}</strong>
            <div className="tune-bar">
              <i style={{ left: `${50 + (noteInfo?.cents ?? 0) / 2}%` }} />
            </div>
            <p>{songMode ? `가까운 ${scaleLabel(scale)} 음계로 맞추는 중` : '노래모드 꺼짐'}</p>
          </div>
        </div>

        <div className="transport">
          <button className={micOn ? 'stop' : 'start'} onClick={toggleMic}>
            {micOn ? '마이크 끄기' : '마이크 켜기'}
          </button>
          <label><input type="checkbox" checked={monitorOn} onChange={(event) => setMonitorOn(event.target.checked)} /> 내 목소리 듣기</label>
          <label><input type="checkbox" checked={songMode} onChange={(event) => setSongMode(event.target.checked)} /> 노래모드</label>
        </div>
      </section>

      <aside className="panel">
        <header>
          <h1>Voice Studio</h1>
          <p>목소리 변조, 음정 맞춤, TTS</p>
        </header>

        <section className="card">
          <h2>목소리 종류</h2>
          <div className="preset-list">
            {PRESETS.map((item) => (
              <button key={item.id} className={item.id === preset.id ? 'active' : ''} onClick={() => setPresetId(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.tone}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>노래모드</h2>
          <label className="select-row">
            음계
            <select value={scale} onChange={(event) => setScale(event.target.value as keyof typeof SCALES)}>
              <option value="major">메이저</option>
              <option value="minor">마이너</option>
              <option value="pentatonic">펜타토닉</option>
            </select>
          </label>
          <Slider label="맞춤 강도" value={autoTune} min={0} max={1} step={0.01} onChange={setAutoTune} />
          <Slider label="출력 볼륨" value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
        </section>

        <section className="card">
          <h2>채팅 TTS</h2>
          <textarea value={ttsText} onChange={(event) => setTtsText(event.target.value)} maxLength={500} />
          <label className="select-row">
            목소리
            <select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}>
              <option value="">브라우저 기본</option>
              {voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name}</option>)}
            </select>
          </label>
          <div className="tts-actions">
            <button onClick={speak}>읽기</button>
            <button onClick={() => window.speechSynthesis.cancel()}>정지</button>
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
    <label className="slider">
      <span>{label}<strong>{Math.round(value * 100)}%</strong></span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function makeDistortionCurve(amount: number) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (const sample of buffer) rms += sample * sample;
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 900);
  const maxOffset = Math.floor(sampleRate / 70);
  for (let offset = minOffset; offset < maxOffset; offset += 1) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) {
      correlation += 1 - Math.abs(buffer[i] - buffer[i + offset]);
    }
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  return bestCorrelation > 0.88 && bestOffset > 0 ? sampleRate / bestOffset : -1;
}

function toNoteInfo(frequency: number, scale: keyof typeof SCALES): NoteInfo {
  const noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  const allowed = SCALES[scale];
  let bestMidi = midi;
  let bestDistance = Infinity;
  for (let candidate = midi - 12; candidate <= midi + 12; candidate += 1) {
    const name = noteNames[((candidate % 12) + 12) % 12];
    if (!allowed.includes(name)) continue;
    const distance = Math.abs(candidate - (69 + 12 * Math.log2(frequency / 440)));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMidi = candidate;
    }
  }
  const targetFrequency = 440 * 2 ** ((bestMidi - 69) / 12);
  const cents = Math.max(-100, Math.min(100, 1200 * Math.log2(frequency / targetFrequency)));
  const octave = Math.floor(bestMidi / 12) - 1;
  return { frequency, note: `${noteNames[((bestMidi % 12) + 12) % 12]}${octave}`, cents };
}

function scaleLabel(scale: keyof typeof SCALES) {
  if (scale === 'minor') return '마이너';
  if (scale === 'pentatonic') return '펜타토닉';
  return '메이저';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
