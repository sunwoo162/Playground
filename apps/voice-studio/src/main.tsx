import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type VoicePreset = {
  id: string;
  name: string;
  tone: string;
  pitch: number;
  rate: number;
  gate: number;
  body: number;
  clarity: number;
  air: number;
  compression: number;
  warmth: number;
  texture: number;
  room: number;
  width: number;
  vibrato: number;
  wet: number;
};

type NoteInfo = {
  frequency: number;
  note: string;
  cents: number;
};

type FineControls = Omit<VoicePreset, 'id' | 'name' | 'tone' | 'pitch' | 'rate'>;

const PRESETS: VoicePreset[] = [
  { id: 'natural', name: '자연 보정', tone: '말투는 그대로 두고 밀도만 정리', pitch: 1, rate: 1, gate: 0.18, body: 0.54, clarity: 0.58, air: 0.36, compression: 0.46, warmth: 0.2, texture: 0.03, room: 0.05, width: 0.18, vibrato: 0, wet: 0.22 },
  { id: 'warm-host', name: '웜 진행자', tone: '낮은 울림과 부드러운 방송 톤', pitch: 0.98, rate: 0.99, gate: 0.2, body: 0.72, clarity: 0.5, air: 0.28, compression: 0.55, warmth: 0.36, texture: 0.04, room: 0.07, width: 0.22, vibrato: 0, wet: 0.28 },
  { id: 'clear-host', name: '선명 진행자', tone: '치찰음은 줄이고 자음은 또렷하게', pitch: 1.02, rate: 1.01, gate: 0.22, body: 0.44, clarity: 0.76, air: 0.48, compression: 0.5, warmth: 0.14, texture: 0.02, room: 0.04, width: 0.14, vibrato: 0, wet: 0.24 },
  { id: 'soft-radio', name: '라디오 내레이션', tone: '가까이 말하는 듯한 안정된 저자극 톤', pitch: 0.96, rate: 0.97, gate: 0.24, body: 0.66, clarity: 0.42, air: 0.22, compression: 0.64, warmth: 0.3, texture: 0.05, room: 0.11, width: 0.28, vibrato: 0, wet: 0.34 },
  { id: 'bright-live', name: '라이브 밝은톤', tone: '가볍지만 과장되지 않은 스트리밍 톤', pitch: 1.06, rate: 1.03, gate: 0.16, body: 0.34, clarity: 0.7, air: 0.62, compression: 0.38, warmth: 0.08, texture: 0.02, room: 0.06, width: 0.24, vibrato: 0.03, wet: 0.26 },
  { id: 'deep-clean', name: '저음 클린', tone: '낮지만 로봇처럼 들리지 않는 단단한 톤', pitch: 0.9, rate: 0.96, gate: 0.22, body: 0.84, clarity: 0.48, air: 0.2, compression: 0.58, warmth: 0.28, texture: 0.06, room: 0.05, width: 0.16, vibrato: 0, wet: 0.3 },
  { id: 'anonymous', name: '익명 자연변조', tone: '정체감은 줄이되 변조 티는 최소화', pitch: 0.94, rate: 0.98, gate: 0.28, body: 0.58, clarity: 0.54, air: 0.3, compression: 0.62, warmth: 0.18, texture: 0.08, room: 0.08, width: 0.2, vibrato: 0.01, wet: 0.38 },
];

const SCALES = {
  major: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  minor: ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  pentatonic: ['C', 'D', 'E', 'G', 'A'],
};

function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [fine, setFine] = useState<FineControls>(copyFineControls(PRESETS[0]));
  const [micOn, setMicOn] = useState(false);
  const [monitorOn, setMonitorOn] = useState(false);
  const [songMode, setSongMode] = useState(false);
  const [autoTune, setAutoTune] = useState(0.24);
  const [volume, setVolume] = useState(0.76);
  const [noteInfo, setNoteInfo] = useState<NoteInfo | null>(null);
  const [level, setLevel] = useState(0);
  const [noiseFloor, setNoiseFloor] = useState(0);
  const [scale, setScale] = useState<keyof typeof SCALES>('major');
  const [ttsText, setTtsText] = useState('안녕하세요. 보이스 스튜디오 테스트입니다.');
  const [ttsVoice, setTtsVoice] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState('마이크를 켜면 브라우저 안에서 실시간 모니터링됩니다.');

  const audioRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const fineRef = useRef(fine);
  const noiseFloorRef = useRef(0);
  const nodesRef = useRef<{
    gate: GainNode;
    body: BiquadFilterNode;
    clarity: BiquadFilterNode;
    air: BiquadFilterNode;
    compressor: DynamicsCompressorNode;
    warmth: WaveShaperNode;
    delay: DelayNode;
    feedback: GainNode;
    dry: GainNode;
    wet: GainNode;
    pan: StereoPannerNode;
    vibratoGain: GainNode;
    vibratoOsc: OscillatorNode;
    output: GainNode;
    monitor: GainNode;
  } | null>(null);
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
    setFine(copyFineControls(preset));
  }, [preset]);

  useEffect(() => {
    fineRef.current = fine;
    applyControls();
  }, [fine, volume, monitorOn]);

  async function toggleMic() {
    if (micOn) {
      stopMic();
      return;
    }

    try {
      const context = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: 48000,
        },
      });

      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      const gate = context.createGain();
      const body = context.createBiquadFilter();
      const clarity = context.createBiquadFilter();
      const air = context.createBiquadFilter();
      const compressor = context.createDynamicsCompressor();
      const warmth = context.createWaveShaper();
      const delay = context.createDelay(0.35);
      const feedback = context.createGain();
      const dry = context.createGain();
      const wet = context.createGain();
      const pan = context.createStereoPanner();
      const vibratoGain = context.createGain();
      const vibratoOsc = context.createOscillator();
      const output = context.createGain();
      const monitor = context.createGain();

      analyser.fftSize = 2048;
      body.type = 'lowshelf';
      clarity.type = 'peaking';
      air.type = 'highshelf';
      vibratoOsc.type = 'sine';
      vibratoOsc.frequency.value = 5.2;
      vibratoGain.gain.value = 0;
      vibratoOsc.connect(vibratoGain);
      vibratoGain.connect(delay.delayTime);

      source.connect(analyser);
      source.connect(gate);
      gate.connect(body);
      body.connect(clarity);
      clarity.connect(air);
      air.connect(compressor);
      compressor.connect(warmth);
      warmth.connect(dry);
      warmth.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      dry.connect(pan);
      wet.connect(pan);
      pan.connect(output);
      output.connect(monitor);
      monitor.connect(context.destination);
      vibratoOsc.start();

      audioRef.current = context;
      streamRef.current = stream;
      analyserRef.current = analyser;
      nodesRef.current = { gate, body, clarity, air, compressor, warmth, delay, feedback, dry, wet, pan, vibratoGain, vibratoOsc, output, monitor };
      setMicOn(true);
      setStatus('실시간 체인이 켜졌습니다. 자연스럽게 쓰려면 변조 믹스를 20-40% 안에서 조정하세요.');
      applyControls();
      analyse();
    } catch {
      setStatus('마이크 권한을 허용해야 사용할 수 있습니다.');
    }
  }

  function stopMic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    nodesRef.current?.vibratoOsc.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioRef.current?.close();
    audioRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    nodesRef.current = null;
    setMicOn(false);
    setLevel(0);
    noiseFloorRef.current = 0;
    setNoiseFloor(0);
    setNoteInfo(null);
    setStatus('마이크가 꺼졌습니다.');
  }

  function applyControls() {
    const context = audioRef.current;
    const nodes = nodesRef.current;
    if (!context || !nodes) return;
    const now = context.currentTime;
    nodes.body.frequency.setTargetAtTime(160, now, 0.04);
    nodes.body.gain.setTargetAtTime((fine.body - 0.5) * 12, now, 0.04);
    nodes.clarity.frequency.setTargetAtTime(2600, now, 0.04);
    nodes.clarity.Q.setTargetAtTime(0.75, now, 0.04);
    nodes.clarity.gain.setTargetAtTime((fine.clarity - 0.5) * 10, now, 0.04);
    nodes.air.frequency.setTargetAtTime(7200, now, 0.04);
    nodes.air.gain.setTargetAtTime((fine.air - 0.5) * 9, now, 0.04);
    nodes.compressor.threshold.setTargetAtTime(-34 + fine.compression * 18, now, 0.04);
    nodes.compressor.knee.setTargetAtTime(18 + fine.compression * 16, now, 0.04);
    nodes.compressor.ratio.setTargetAtTime(1.6 + fine.compression * 5.2, now, 0.04);
    nodes.compressor.attack.setTargetAtTime(0.006, now, 0.04);
    nodes.compressor.release.setTargetAtTime(0.12 + fine.compression * 0.18, now, 0.04);
    nodes.warmth.curve = makeSoftSaturationCurve(fine.warmth + fine.texture * 0.8);
    nodes.delay.delayTime.setTargetAtTime(0.012 + fine.room * 0.08 + fine.vibrato * 0.008, now, 0.05);
    nodes.feedback.gain.setTargetAtTime(Math.min(0.26, fine.room * 0.28), now, 0.05);
    nodes.dry.gain.setTargetAtTime(1 - fine.wet * 0.36, now, 0.04);
    nodes.wet.gain.setTargetAtTime(fine.wet * (0.16 + fine.room * 0.36), now, 0.04);
    nodes.pan.pan.setTargetAtTime((fine.width - 0.5) * 0.22, now, 0.04);
    nodes.vibratoGain.gain.setTargetAtTime(fine.vibrato * 0.006, now, 0.04);
    nodes.output.gain.setTargetAtTime(volume, now, 0.04);
    nodes.monitor.gain.setTargetAtTime(monitorOn ? 1 : 0, now, 0.04);
  }

  function analyse() {
    const analyser = analyserRef.current;
    const nodes = nodesRef.current;
    const context = audioRef.current;
    if (!analyser || !nodes || !context) return;
    const buffer = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buffer);
      const rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      const currentFine = fineRef.current;
      const floor = noiseFloorRef.current * 0.94 + rms * 0.06;
      const open = rms > Math.max(0.006, floor + currentFine.gate * 0.035);
      noiseFloorRef.current = floor;
      nodes.gate.gain.setTargetAtTime(open ? 1 : 0.08, context.currentTime, open ? 0.018 : 0.08);
      setNoiseFloor(floor);
      setLevel(Math.min(1, rms * 10));
      const pitch = autoCorrelate(buffer, context.sampleRate);
      if (pitch > 0) setNoteInfo(toNoteInfo(songMode ? quantizeFrequency(pitch, scale, autoTune) : pitch, scale));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function updateFine(key: keyof FineControls, value: number) {
    setFine((current) => ({ ...current, [key]: value }));
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
        <div className="toolbar">
          <div>
            <strong>Voice Studio Extension</strong>
            <span>{status}</span>
          </div>
          <button className={micOn ? 'stop' : 'start'} onClick={toggleMic}>{micOn ? '마이크 끄기' : '마이크 켜기'}</button>
        </div>

        <div className="scope">
          <div className="level-ring" style={{ '--level': level } as React.CSSProperties}>
            <span>{noteInfo?.note ?? '--'}</span>
          </div>
          <div className="meter-grid">
            <Meter label="입력" value={level} />
            <Meter label="노이즈" value={Math.min(1, noiseFloor * 18)} />
            <Meter label="믹스" value={fine.wet} />
          </div>
          <div className="tuner">
            <span>Pitch monitor</span>
            <strong>{noteInfo ? `${noteInfo.frequency.toFixed(1)} Hz` : '대기 중'}</strong>
            <div className="tune-bar"><i style={{ left: `${50 + (noteInfo?.cents ?? 0) / 2}%` }} /></div>
            <p>{songMode ? `${scaleLabel(scale)} 스케일 기준 표시` : '자연 보정 모드'}</p>
          </div>
        </div>
      </section>

      <aside className="panel">
        <header>
          <h1>Voice Studio</h1>
          <p>브라우저 확장 패널형 실시간 음성 보정</p>
        </header>

        <section className="card">
          <h2>프리셋</h2>
          <div className="preset-list">
            {PRESETS.map((item) => (
              <button key={item.id} className={item.id === preset.id ? 'active' : ''} onClick={() => setPresetId(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.tone}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card compact">
          <h2>실시간 출력</h2>
          <label className="toggle"><input type="checkbox" checked={monitorOn} onChange={(event) => setMonitorOn(event.target.checked)} /> 내 목소리 듣기</label>
          <label className="toggle"><input type="checkbox" checked={songMode} onChange={(event) => setSongMode(event.target.checked)} /> 음정 보정 표시</label>
          <label className="select-row">음계<select value={scale} onChange={(event) => setScale(event.target.value as keyof typeof SCALES)}>
            <option value="major">메이저</option>
            <option value="minor">마이너</option>
            <option value="pentatonic">펜타토닉</option>
          </select></label>
          <Slider label="음정 보정" value={autoTune} min={0} max={1} step={0.01} onChange={setAutoTune} />
          <Slider label="출력 볼륨" value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
        </section>

        <section className="card">
          <h2>세밀 보정</h2>
          <Slider label="노이즈 게이트" value={fine.gate} min={0} max={1} step={0.01} onChange={(value) => updateFine('gate', value)} />
          <Slider label="저역 몸통" value={fine.body} min={0} max={1} step={0.01} onChange={(value) => updateFine('body', value)} />
          <Slider label="자음 선명도" value={fine.clarity} min={0} max={1} step={0.01} onChange={(value) => updateFine('clarity', value)} />
          <Slider label="공기감" value={fine.air} min={0} max={1} step={0.01} onChange={(value) => updateFine('air', value)} />
          <Slider label="압축감" value={fine.compression} min={0} max={1} step={0.01} onChange={(value) => updateFine('compression', value)} />
          <Slider label="따뜻함" value={fine.warmth} min={0} max={1} step={0.01} onChange={(value) => updateFine('warmth', value)} />
          <Slider label="질감" value={fine.texture} min={0} max={1} step={0.01} onChange={(value) => updateFine('texture', value)} />
          <Slider label="공간감" value={fine.room} min={0} max={1} step={0.01} onChange={(value) => updateFine('room', value)} />
          <Slider label="스테레오 폭" value={fine.width} min={0} max={1} step={0.01} onChange={(value) => updateFine('width', value)} />
          <Slider label="떨림" value={fine.vibrato} min={0} max={1} step={0.01} onChange={(value) => updateFine('vibrato', value)} />
          <Slider label="변조 믹스" value={fine.wet} min={0} max={1} step={0.01} onChange={(value) => updateFine('wet', value)} />
        </section>

        <section className="card">
          <h2>채팅 TTS</h2>
          <textarea value={ttsText} onChange={(event) => setTtsText(event.target.value)} maxLength={500} />
          <label className="select-row">목소리<select value={ttsVoice} onChange={(event) => setTtsVoice(event.target.value)}>
            <option value="">브라우저 기본</option>
            {voices.map((voice) => <option key={voice.name} value={voice.name}>{voice.name}</option>)}
          </select></label>
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

function Meter({ label, value }: { label: string; value: number }) {
  return <div className="meter"><span>{label}</span><i style={{ transform: `scaleX(${Math.max(0.02, value)})` }} /></div>;
}

function copyFineControls(preset: VoicePreset): FineControls {
  return {
    gate: preset.gate,
    body: preset.body,
    clarity: preset.clarity,
    air: preset.air,
    compression: preset.compression,
    warmth: preset.warmth,
    texture: preset.texture,
    room: preset.room,
    width: preset.width,
    vibrato: preset.vibrato,
    wet: preset.wet,
  };
}

function makeSoftSaturationCurve(amount: number) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const drive = 1 + amount * 7;
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
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
    for (let i = 0; i < buffer.length - offset; i += 1) correlation += 1 - Math.abs(buffer[i] - buffer[i + offset]);
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }
  return bestCorrelation > 0.88 && bestOffset > 0 ? sampleRate / bestOffset : -1;
}

function quantizeFrequency(frequency: number, scale: keyof typeof SCALES, amount: number) {
  const target = toNoteInfo(frequency, scale).frequency;
  return frequency + (target - frequency) * amount;
}

function toNoteInfo(frequency: number, scale: keyof typeof SCALES): NoteInfo {
  const noteNames = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const rawMidi = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(rawMidi);
  const allowed = SCALES[scale];
  let bestMidi = midi;
  let bestDistance = Infinity;
  for (let candidate = midi - 12; candidate <= midi + 12; candidate += 1) {
    const name = noteNames[((candidate % 12) + 12) % 12];
    if (!allowed.includes(name)) continue;
    const distance = Math.abs(candidate - rawMidi);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMidi = candidate;
    }
  }
  const targetFrequency = 440 * 2 ** ((bestMidi - 69) / 12);
  const cents = Math.max(-100, Math.min(100, 1200 * Math.log2(frequency / targetFrequency)));
  const octave = Math.floor(bestMidi / 12) - 1;
  return { frequency: targetFrequency, note: `${noteNames[((bestMidi % 12) + 12) % 12]}${octave}`, cents };
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
