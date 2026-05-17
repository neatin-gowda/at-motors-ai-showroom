import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const REALTIME_SAMPLE_RATE = 24000;
const REALTIME_VOICE = 'alloy';
const VOICE_IDLE_TIMEOUT_MS = 30000;
const REALTIME_INSTRUCTIONS = 'You are AT MOTORS luxury automotive AI concierge for Ford, Lincoln, Jaguar, Land Rover, Maserati, Ferrari, VinFast, Deepal, and Ford Trucks. Use one consistent voice identity: crisp, calm, short, clear, and premium. Only answer automotive, car comparison, ownership, finance, test-drive, showroom, and AT MOTORS questions. If asked anything outside automotive, politely refuse and redirect to cars. For vehicle profiles and comparisons, do not invent long specifications from memory; speak a short showroom handoff while the visual dossier renders the exact table. Focus on performance, comfort, ownership fit, price tier, and next viewing step. Present regional prices in UAE dirhams by default, never USD. Do not mention setup, Bing, grounding, environment variables, Azure, or technical implementation. Default to English; if the customer switches language, respond in that language while staying concise and automotive-only.';

const showroomScenes = [
  {
    maker: 'Ferrari',
    label: 'Italian performance atelier',
    img: 'https://images.unsplash.com/photo-1556516731-779d3492975b?auto=format&fit=crop&q=88&w=2200',
  },
  {
    maker: 'Ford',
    label: 'Mustang performance studio',
    img: 'https://images.unsplash.com/photo-1561535743-c82c241502d5?auto=format&fit=crop&q=88&w=2200',
  },
  {
    maker: 'Maserati',
    label: 'Grand touring lounge',
    img: 'https://images.unsplash.com/photo-1756548843479-3783100b3447?auto=format&fit=crop&q=88&w=2200',
  },
];

const FALLBACK_CAR_IMAGE = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=90&w=1600';

const LOCAL_SHOWROOM_MODELS = [
  ['Ford', 'Mustang GT', 'Performance coupe', 'V8 theatre with daily usability and strong showroom appeal.', 'https://images.unsplash.com/photo-1561535743-c82c241502d5?auto=format&fit=crop&q=90&w=1600'],
  ['Jaguar', 'F-Pace', 'Luxury performance SUV', 'British performance SUV with a premium road presence.', 'https://images.unsplash.com/photo-1619767886558-efdc259cde1a?auto=format&fit=crop&q=90&w=1600'],
  ['Land Rover', 'Defender', 'Luxury 4x4', 'Iconic capability with premium all-terrain character.', 'https://images.unsplash.com/photo-1609521263047-f8f205293f24?auto=format&fit=crop&q=90&w=1600'],
  ['Maserati', 'MC20', 'Italian supercar', 'Low-slung Italian performance with exotic showroom theatre.', 'https://images.unsplash.com/photo-1756548843479-3783100b3447?auto=format&fit=crop&q=90&w=1600'],
  ['Ferrari', '296 GTB', 'Hybrid supercar', 'Compact Ferrari hybrid performance with intense emotional pull.', 'https://images.unsplash.com/photo-1556516731-779d3492975b?auto=format&fit=crop&q=90&w=1600'],
].map(([brand, model, type, detail, imageUrl]) => ({ brand, model, type, detail, imageUrl }));

const automotiveTerms = [
  'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
  'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
  'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
  'price', 'finance', 'booking', 'viewing', 'test drive', 'compare', 'range',
  'battery', 'hybrid', 'ev', 'electric', 'mustang', 'ferrari', 'ford', 'maserati',
  'sf90', 'roma', '296', 'mc20', 'granturismo', 'trofeo', 'deepal', 's07',
  'bronco', 'lincoln', 'jaguar', 'land rover', 'range rover', 'defender', 'vinfast',
  'aviator', 'navigator', 'f-pace', 'f pace', 'ford trucks', 'f-max', 'f max',
];

const farewellPatterns = [
  /\b(that'?s all|that is all|all i had|i am done|i'm done|we are done)\b/i,
  /\b(thank you|thanks|thank you very much|bye|goodbye|see you|see ya|take care|stop listening|end session)\b/i,
  /\b(no more questions|nothing else|disconnect|close the session|catch you later|talk later)\b/i,
];

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer);
}

function resampleTo24k(samples, inputSampleRate) {
  if (inputSampleRate === REALTIME_SAMPLE_RATE) return samples;
  const ratio = inputSampleRate / REALTIME_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio);
    const end = Math.min(samples.length, Math.floor((outputIndex + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += samples[inputIndex];
      count += 1;
    }
    output[outputIndex] = count ? sum / count : samples[start] || 0;
  }

  return output;
}

function floatToPcm16Base64(samples, inputSampleRate) {
  const resampled = resampleTo24k(samples, inputSampleRate);
  const pcm = new Int16Array(resampled.length);
  for (let index = 0; index < resampled.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, resampled[index]));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return bytesToBase64(new Uint8Array(pcm.buffer));
}

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio is not supported');
  return new AudioContextClass();
}

function toWebSocketUrl(value) {
  if (!value) return '';
  if (value.startsWith('wss://') || value.startsWith('ws://')) return value;
  const apiBaseUrl = API_BASE.startsWith('http')
    ? new URL(API_BASE)
    : new URL(API_BASE, window.location.origin);
  const absolute = new URL(value, apiBaseUrl.origin);
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:';
  return absolute.toString();
}

function Icon({ name }) {
  const paths = {
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 9h8" /><path d="M8 13h5" /></>,
    mic: <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />,
    micOff: <><path d="M12 2a3 3 0 0 0-3 3v3" /><path d="M15 9.3V5a3 3 0 0 0-5.1-2.1" /><path d="M19 10v2a7 7 0 0 1-11.9 5" /><path d="M5 10v2a7 7 0 0 0 7 7" /><path d="M12 19v3" /><path d="M8 22h8" /><path d="m3 3 18 18" /></>,
    end: <path d="M21 15.4c-2.2-1.2-5.1-1.9-9-1.9s-6.8.7-9 1.9l2.6 4.2 3.3-1.7v-2.2c.9-.1 1.9-.2 3.1-.2s2.2.1 3.1.2v2.2l3.3 1.7 2.6-4.2Z" />,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m23 9-6 6" /><path d="m17 9 6 6" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>,
    live: <><path d="M4 12a8 8 0 0 1 16 0" /><path d="M8 12a4 4 0 0 1 8 0" /><path d="M12 12h.01" /></>,
    download: <><path d="M12 3v11" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function isComparisonRequest(message) {
  const text = message.toLowerCase();
  return /\b(compare|comparison|versus|vs\.?|against|between|table|tabular|specs|specification|difference|better|recommend|choose|which one)\b/i.test(text);
}

function isVehicleProfileRequest(message) {
  const text = message.toLowerCase();
  return /\b(show|check|open|view|display|details|profile|price|specs|specification|tell me about|what about|look|looks|looking|see|overview|features|interior|exterior)\b/i.test(text);
}

function isAutomotiveTopic(message) {
  const text = message.toLowerCase();
  return automotiveTerms.some((term) => text.includes(term));
}

function isFarewell(message) {
  return farewellPatterns.some((pattern) => pattern.test(message));
}

function cleanDisplayText(value, options = {}) {
  const { trim = true } = options;
  const text = String(value || '')
    .replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g, '')
    .replace(/\s{2,}/g, ' ');
  return trim ? text.trim() : text;
}

function HologramRail({ vehicles, onInspect }) {
  const handleImageError = (event) => {
    event.currentTarget.onerror = null;
    event.currentTarget.src = FALLBACK_CAR_IMAGE;
  };

  return (
    <div className="holoRail" aria-label="Featured vehicles">
      {!vehicles.length && <div className="holoLoading">Loading live showroom models</div>}
      {vehicles.slice(0, 10).map((vehicle, index) => (
        <button
          className="holoCar"
          style={{ '--delay': `${index * .42}s` }}
          key={`${vehicle.brand}-${vehicle.model}`}
          type="button"
          onClick={() => onInspect(vehicle)}
        >
          <img src={vehicle.imageUrl} alt={`${vehicle.brand} ${vehicle.model}`} onError={handleImageError} />
          <span>{vehicle.brand}</span>
          <small>{vehicle.model}</small>
          <em>{vehicle.type}</em>
        </button>
      ))}
    </div>
  );
}

function ComparisonStage({ comparison, loading, onDownload }) {
  if (!comparison) return null;
  const vehicles = comparison.vehicles || [];
  const rows = comparison.rows || [];
  const left = vehicles[0];
  const right = vehicles[1];
  if (!left) return null;
  const visibleVehicles = right ? [left, right] : [left];
  const isSingle = !right;

  return (
    <section className={`compareStage ${isSingle ? 'isSingle' : ''} ${loading ? 'isUpdating' : ''}`}>
      <div className="compareIntro">
        <span>{isSingle ? 'AI vehicle profile' : 'AI comparison dossier'}</span>
        <h2>{comparison.title}</h2>
        {comparison.summary && <p>{comparison.summary}</p>}
      </div>
      {visibleVehicles.map((car, index) => (
        <article className={`comparePanel ${index === 0 ? 'fromLeft' : 'fromRight'}`} key={`${car.name}-${index}`}>
          {car.imageUrl ? (
            <img
              src={car.imageUrl}
              alt={car.name}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = FALLBACK_CAR_IMAGE;
              }}
            />
          ) : <div className="imageFallback">{car.brand}</div>}
          <div className="motionLine" />
          <div className="compareTitle">
            <span>{car.type}</span>
            <h3>{car.brand}</h3>
            <p>{car.model}</p>
            {car.highlight && <small>{car.highlight}</small>}
          </div>
        </article>
      ))}
      <div className="specGrid">
        <div className={`specHeader ${isSingle ? 'isSingle' : ''}`}>
          <span>Specification</span>
          <b>{left.brand}</b>
          {right && <em>{right.brand}</em>}
        </div>
        {rows.map((row) => (
          <div className={isSingle ? 'isSingle' : ''} key={row.label}>
            <span>{row.label}</span>
            <b>{row.values?.[0] || 'Not verified'}</b>
            {right && <em>{row.values?.[1] || 'Not verified'}</em>}
          </div>
        ))}
      </div>
      {comparison.recommendation && <p className="recommendation">{comparison.recommendation}</p>}
      <div className="sourceStrip">
        <strong>{right ? `${left.brand} vs ${right.brand}` : `${left.brand} profile`}</strong>
        {loading ? <span>Updating dossier</span> : (comparison.sources || []).length ? (comparison.sources || []).slice(0, 3).map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.name}</a>) : <span>AI generated comparison</span>}
        <button type="button" onClick={onDownload}><Icon name="download" /> Report</button>
      </div>
    </section>
  );
}

function App() {
  const [mode, setMode] = useState('background');
  const [activeCar, setActiveCar] = useState(0);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [streamText, setStreamText] = useState('');
  const [recognized, setRecognized] = useState('');
  const [conversation, setConversation] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [input, setInput] = useState('');
  const [railVehicles, setRailVehicles] = useState(LOCAL_SHOWROOM_MODELS);

  const realtimeRef = useRef(null);
  const realtimeSessionRef = useRef(null);
  const closeRealtimeOnDoneRef = useRef(false);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const inputContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const zeroGainRef = useRef(null);
  const playbackContextRef = useRef(null);
  const playbackTimeRef = useRef(0);
  const playbackSourcesRef = useRef([]);
  const mutedRef = useRef(false);
  const comparisonRef = useRef(null);
  const compareAnchorRef = useRef(null);
  const responseTextRef = useRef('');
  const responseHasAudioTranscriptRef = useRef(false);
  const modelRespondingRef = useRef(false);
  const lastUserTranscriptRef = useRef('');
  const lastComparisonRequestRef = useRef('');
  const comparisonDebounceRef = useRef(null);
  const comparisonRequestSeqRef = useRef(0);
  const userDraftTranscriptRef = useRef('');
  const chatGlowRef = useRef(null);
  const stageRef = useRef(null);
  const sessionIdRef = useRef(`at-motors-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const idleTimerRef = useRef(null);
  const backgroundImage = comparison?.vehicles?.[0]?.imageUrl || showroomScenes[activeCar].img;
  const hasTranscript = Boolean(recognized || streamText);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveCar((index) => (index + 1) % showroomScenes.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/at-motors/showroom-models`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Array.isArray(data?.vehicles) && data.vehicles.length) setRailVehicles(data.vehicles);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--voice-level', String(level));
  }, [level]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    comparisonRef.current = comparison;
  }, [comparison]);

  useEffect(() => {
    const panel = chatGlowRef.current;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
  }, [conversation, recognized, streamText]);

  const applyAgentTurn = (data) => {
    if (!data) return false;
    if (data.session?.shouldEnd || data.uiEvents?.some((event) => event.type === 'session_end')) {
      setStreamText(data.reply || 'Session closed. Tap Talk to AI when you want the concierge again.');
      window.setTimeout(() => endSession(), 1200);
      return true;
    }

    const visualEvent = (data.uiEvents || []).find((event) => (
      ['show_comparison', 'show_vehicle_profile'].includes(event.type) && event.comparison
    ));
    const nextComparison = visualEvent?.comparison || data.comparison;
    if (nextComparison) {
      setComparison(nextComparison);
      setMode('comparison');
      window.setTimeout(() => {
        compareAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 180);
      return true;
    }
    return false;
  };

  const runAgentTurn = async (message) => {
    const response = await fetch(`${API_BASE}/at-motors/agent-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId: sessionIdRef.current,
        history: conversation.slice(-6),
        currentComparison: comparisonRef.current,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Agent turn failed');
    return data;
  };

  const clearVoiceIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  };

  const scheduleVoiceIdleTimer = (reason = 'silence') => {
    clearVoiceIdleTimer();
    if (!realtimeRef.current) return;
    idleTimerRef.current = window.setTimeout(() => {
      setStreamText(reason === 'muted'
        ? 'Session closed after microphone mute timeout.'
        : 'Session closed after a quiet moment.');
      window.setTimeout(() => endSession(), 900);
    }, VOICE_IDLE_TIMEOUT_MS);
  };

  const stopPlayback = () => {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    });
    playbackSourcesRef.current = [];
    playbackTimeRef.current = 0;
  };

  const getPlaybackContext = async () => {
    let context = playbackContextRef.current;
    if (!context || context.state === 'closed') {
      context = createAudioContext();
      playbackContextRef.current = context;
    }
    if (context.state === 'suspended') await context.resume();
    return context;
  };

  const playRealtimeAudio = async (base64Audio) => {
    if (mutedRef.current || !base64Audio) return;
    const context = await getPlaybackContext();
    const pcm = base64ToInt16(base64Audio);
    const buffer = context.createBuffer(1, pcm.length, REALTIME_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = pcm[index] / 0x8000;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.02, playbackTimeRef.current || 0);
    playbackTimeRef.current = startAt + buffer.duration;
    playbackSourcesRef.current.push(source);
    source.onended = () => {
      playbackSourcesRef.current = playbackSourcesRef.current.filter((item) => item !== source);
    };
    source.start(startAt);
  };

  const stopMicStreaming = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    processorRef.current?.disconnect();
    zeroGainRef.current?.disconnect();
    analyserRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    inputContextRef.current?.close().catch(() => {});
    rafRef.current = null;
    processorRef.current = null;
    zeroGainRef.current = null;
    analyserRef.current = null;
    mediaStreamRef.current = null;
    inputContextRef.current = null;
    setLevel(0);
  };

  const startMicStreaming = async (socket) => {
    stopMicStreaming();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const audioContext = createAudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0;
    analyser.fftSize = 256;
    source.connect(analyser);
    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(audioContext.destination);
    analyserRef.current = analyser;
    inputContextRef.current = audioContext;
    mediaStreamRef.current = stream;
    processorRef.current = processor;
    zeroGainRef.current = zeroGain;
    const data = new Uint8Array(analyser.frequencyBinCount);

    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (mutedRef.current) return;
      const channel = event.inputBuffer.getChannelData(0);
      const audio = floatToPcm16Base64(channel, audioContext.sampleRate);
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    };

    const tick = () => {
      if (mutedRef.current) {
        setLevel(0);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(1, average / 90));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleUserTranscript = (transcript) => {
    const value = cleanDisplayText(transcript);
    if (!value || value === lastUserTranscriptRef.current) return;
    scheduleVoiceIdleTimer('silence');
    lastUserTranscriptRef.current = value;
    setRecognized(value);
    setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
    if (isFarewell(value)) {
      setStreamText('Session closed. Tap Talk to AI when you want the concierge again.');
      if (realtimeRef.current?.readyState === WebSocket.OPEN && modelRespondingRef.current) {
        try {
          realtimeRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        } catch {
          // The server may have no active response to cancel.
        }
      }
      window.setTimeout(() => endSession(), 1200);
      return;
    }
    requestComparisonFromText(value, { immediate: true });
  };

  const handleRealtimeEvent = (event) => {
    const data = JSON.parse(event.data);
    const type = data.type || '';

    if (type === 'response.created') {
      clearVoiceIdleTimer();
      modelRespondingRef.current = true;
      responseTextRef.current = '';
      responseHasAudioTranscriptRef.current = false;
      setStreamText('');
      setMode('responding');
    }

    if (type === 'input_audio_buffer.speech_started') {
      clearVoiceIdleTimer();
      if (mutedRef.current) {
        if (realtimeRef.current?.readyState === WebSocket.OPEN) {
          try {
            realtimeRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
          } catch {
            // The realtime session may already be idle.
          }
        }
        return;
      }
      stopPlayback();
      responseTextRef.current = '';
      responseHasAudioTranscriptRef.current = false;
      userDraftTranscriptRef.current = '';
      setStreamText('');
      setRecognized('');
      setMode('listening');
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (modelRespondingRef.current && realtimeRef.current?.readyState === WebSocket.OPEN) {
        try {
          realtimeRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        } catch {
          // The server may have no active response to cancel.
        }
      }
    }

    if (type === 'input_audio_buffer.speech_stopped' || type === 'input_audio_buffer.committed') {
      if (mutedRef.current) return;
      setMode('responding');
      scheduleVoiceIdleTimer('silence');
    }

    if (
      type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'conversation.item.audio_transcription.completed'
    ) {
      if (mutedRef.current) return;
      handleUserTranscript(data.transcript || '');
    }

    if (
      type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'conversation.item.audio_transcription.delta'
    ) {
      if (mutedRef.current) return;
      userDraftTranscriptRef.current = cleanDisplayText(`${userDraftTranscriptRef.current}${data.delta || ''}`, { trim: false });
      setRecognized(userDraftTranscriptRef.current);
      scheduleVoiceIdleTimer('silence');
      requestComparisonFromText(userDraftTranscriptRef.current);
    }

    if (type === 'response.audio.delta' || type === 'response.output_audio.delta') {
      clearVoiceIdleTimer();
      void playRealtimeAudio(data.delta);
      setMode('responding');
    }

    if (type === 'response.audio_transcript.delta' || type === 'response.output_audio_transcript.delta') {
      responseHasAudioTranscriptRef.current = true;
      responseTextRef.current = cleanDisplayText(`${responseTextRef.current}${data.delta || ''}`, { trim: false });
      setStreamText(responseTextRef.current);
      setMode('responding');
    }

    if ((type === 'response.text.delta' || type === 'response.output_text.delta') && !responseHasAudioTranscriptRef.current) {
      responseTextRef.current = cleanDisplayText(`${responseTextRef.current}${data.delta || ''}`, { trim: false });
      setStreamText(responseTextRef.current);
      setMode('responding');
    }

    if (type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done') {
      if (data.transcript) {
        responseTextRef.current = cleanDisplayText(data.transcript);
        setStreamText(responseTextRef.current);
      }
    }

    if (type === 'response.done' || type === 'response.completed') {
      modelRespondingRef.current = false;
      const text = responseTextRef.current.trim();
      if (text) {
        setConversation((items) => [...items, { role: 'assistant', text }].slice(-4));
      }
      if (closeRealtimeOnDoneRef.current) {
        window.setTimeout(() => {
          realtimeRef.current?.close();
          realtimeRef.current = null;
          closeRealtimeOnDoneRef.current = false;
          setMode(comparisonRef.current ? 'comparison' : 'background');
        }, 600);
      } else {
        setMode('listening');
        scheduleVoiceIdleTimer('silence');
      }
    }

    if (type === 'error') {
      setStreamText('Realtime voice is unavailable right now. Open chat for text concierge support.');
      setMode(comparisonRef.current ? 'comparison' : 'background');
    }
  };

  const configureRealtimeSession = (socket) => {
    socket.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: REALTIME_INSTRUCTIONS,
        modalities: ['audio', 'text'],
        voice: REALTIME_VOICE,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 550,
          create_response: true,
          interrupt_response: true,
        },
      },
    }));
  };

  const openRealtimeSocket = async ({ closeOnDone = false } = {}) => {
    const existing = realtimeRef.current;
    if (existing?.readyState === WebSocket.OPEN) {
      closeRealtimeOnDoneRef.current = closeOnDone;
      return existing;
    }

    let session = realtimeSessionRef.current;
    if (!session?.url) {
      let sessionResponse = await fetch(`${API_BASE}/at-motors/voice-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      session = await sessionResponse.json().catch(() => ({}));

      if (!sessionResponse.ok || !session.url) {
        sessionResponse = await fetch(`${API_BASE}/at-motors/realtime-session`);
        session = await sessionResponse.json().catch(() => ({}));
      }

      if (!sessionResponse.ok || !session.url) throw new Error(session.error || 'Realtime session is not configured');
      realtimeSessionRef.current = session;
    }

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(toWebSocketUrl(session.url));
      realtimeRef.current = socket;
      closeRealtimeOnDoneRef.current = closeOnDone;

      socket.onopen = () => {
        configureRealtimeSession(socket);
        resolve(socket);
      };
      socket.onmessage = handleRealtimeEvent;
      socket.onerror = () => reject(new Error('Realtime WebSocket failed'));
      socket.onclose = () => {
        if (realtimeRef.current === socket) realtimeRef.current = null;
      };
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch(`${API_BASE}/at-motors/voice-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })
        .then((response) => response.ok ? response.json() : null)
        .then((session) => {
          if (session?.url) realtimeSessionRef.current = session;
        })
        .catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const loadComparison = async (message) => {
    const requestSeq = comparisonRequestSeqRef.current + 1;
    comparisonRequestSeqRef.current = requestSeq;
    setComparisonLoading(true);
    setMode('comparison');
    setStreamText((text) => text || 'Preparing the showroom view...');
    try {
      try {
        const agentData = await runAgentTurn(message);
        if (requestSeq !== comparisonRequestSeqRef.current) return;
        if (applyAgentTurn(agentData)) return;
      } catch {
        // Keep the legacy comparison endpoint as a safe fallback during the agent rollout.
      }

      const response = await fetch(`${API_BASE}/at-motors/comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.comparison) throw new Error(data.error || 'Comparison failed');
      if (requestSeq !== comparisonRequestSeqRef.current) return;
      setComparison(data.comparison);
      setMode('comparison');
      window.setTimeout(() => {
        compareAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 180);
    } catch {
      if (requestSeq === comparisonRequestSeqRef.current) {
        setStreamText('I can keep the current comparison visible. Ask again with two specific models when you want a fresh dossier.');
      }
    } finally {
      if (requestSeq === comparisonRequestSeqRef.current) setComparisonLoading(false);
    }
  };

  const requestComparisonFromText = (message, options = {}) => {
    const { immediate = false } = options;
    const value = cleanDisplayText(message);
    const lowerValue = value.toLowerCase();
    const mentionsShowroomVehicle = railVehicles.some((vehicle) => (
      lowerValue.includes(String(vehicle.brand || '').toLowerCase()) ||
      lowerValue.includes(String(vehicle.model || '').toLowerCase()) ||
      lowerValue.includes(`${String(vehicle.brand || '').toLowerCase()} ${String(vehicle.model || '').toLowerCase()}`)
    ));
    const shouldShowProfile = isVehicleProfileRequest(value) || (!isComparisonRequest(value) && mentionsShowroomVehicle);
    if (!value || (!isComparisonRequest(value) && !shouldShowProfile) || (!isAutomotiveTopic(value) && !comparisonRef.current)) return false;
    const key = value.toLowerCase();
    const run = () => {
      if (key === lastComparisonRequestRef.current) return;
      lastComparisonRequestRef.current = key;
      void loadComparison(value);
    };
    window.clearTimeout(comparisonDebounceRef.current);
    if (immediate) run();
    else comparisonDebounceRef.current = window.setTimeout(run, 850);
    return true;
  };

  const toggleMute = async () => {
    const nextMuted = !mutedRef.current;
    setMuted(nextMuted);
    mutedRef.current = nextMuted;

    if (nextMuted) {
      stopMicStreaming();
      stopPlayback();
      setLevel(0);
      if (realtimeRef.current?.readyState === WebSocket.OPEN) {
        try {
          realtimeRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
          if (modelRespondingRef.current) realtimeRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        } catch {
          // The realtime session may already be idle.
        }
      }
      setStreamText((text) => text || 'Microphone muted. Tap Unmute to resume listening.');
      scheduleVoiceIdleTimer('muted');
      return;
    }

    setStreamText('');
    setRecognized('');
    clearVoiceIdleTimer();
    if (realtimeRef.current?.readyState === WebSocket.OPEN) {
      try {
        await startMicStreaming(realtimeRef.current);
        setMode('listening');
        scheduleVoiceIdleTimer('silence');
      } catch {
        setStreamText('Could not resume microphone access. Check browser microphone permission.');
      }
    } else {
      setMode(comparisonRef.current ? 'comparison' : 'background');
    }
  };

  const inspectRailVehicle = (vehicle) => {
    const text = `${vehicle.brand} ${vehicle.model}`;
    setRecognized(text);
    setStreamText(vehicle.detail || `Live source model from ${vehicle.brand}.`);
    setConversation((items) => [...items, { role: 'user', text: `Show ${text}` }].slice(-4));
    setMode('responding');
    requestComparisonFromText(`Show ${text}`, { immediate: true });
  };

  const downloadComparisonReport = () => {
    if (!comparison) return;
    const vehicles = comparison.vehicles || [];
    const rows = comparison.rows || [];
    const lines = [
      'AT MOTORS AI COMPARISON REPORT',
      comparison.title || '',
      '',
      comparison.summary || '',
      comparison.recommendation || '',
      '',
      ...rows.map((row) => `${row.label}: ${vehicles[0]?.brand || 'Vehicle A'} - ${row.values?.[0] || 'Not verified'} | ${vehicles[1]?.brand || 'Vehicle B'} - ${row.values?.[1] || 'Not verified'}`),
      '',
      'Sources:',
      ...(comparison.sources || []).map((source) => `${source.name}: ${source.url}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(comparison.title || 'at-motors-comparison').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const speak = (text) => {
    if (muted || !window.speechSynthesis) {
      setMode(comparison ? 'comparison' : 'background');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 0.82;
    utterance.onstart = () => setMode('responding');
    utterance.onend = () => setMode(comparison ? 'comparison' : 'background');
    utterance.onerror = () => setMode(comparison ? 'comparison' : 'background');
    window.speechSynthesis.speak(utterance);
  };

  const streamAnswer = (text, options = {}) => {
    const { speakOutput = true } = options;
    setStreamText('');
    setMode('responding');
    let index = 0;
    const step = () => {
      index += Math.max(2, Math.round(text.length / 110));
      setStreamText(text.slice(0, index));
      if (index < text.length) window.setTimeout(step, 18);
      else {
        setConversation((items) => [...items, { role: 'assistant', text }].slice(-4));
        if (speakOutput) speak(text);
        else setMode(comparisonRef.current ? 'comparison' : 'background');
      }
    };
    step();
  };

  const sendRealtimeTextMessage = async (message) => {
    stopPlayback();
    responseTextRef.current = '';
    responseHasAudioTranscriptRef.current = false;
    setStreamText('');
    setMode('responding');
    const socket = await openRealtimeSocket({ closeOnDone: !mediaStreamRef.current });
    socket.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: message }],
      },
    }));
    socket.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: ['audio', 'text'],
        instructions: REALTIME_INSTRUCTIONS,
        voice: REALTIME_VOICE,
      },
    }));
  };

  const askChat = async (message) => {
    const value = message.trim();
    if (!value) return;
    if (!isAutomotiveTopic(value)) {
      setRecognized(value);
      setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
      streamAnswer('I can only assist with AT MOTORS, cars, automotive comparisons, ownership, finance, test drives, and showroom bookings.', { speakOutput: false });
      return;
    }
    const shouldCompare = isComparisonRequest(value) || isVehicleProfileRequest(value);
    setRecognized(value);
    setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
    setMode(comparison || shouldCompare ? 'comparison' : 'responding');
    setInput('');

    try {
      const agentData = await runAgentTurn(value);
      applyAgentTurn(agentData);
      streamAnswer(agentData.reply, { speakOutput: false });
    } catch {
      if (shouldCompare) requestComparisonFromText(value, { immediate: true });
      try {
        const response = await fetch(`${API_BASE}/at-motors/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: value, history: [] }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Chat failed');
        streamAnswer(data.reply, { speakOutput: false });
      } catch {
        streamAnswer('I can compare these models on performance, comfort, ownership fit, price tier, and viewing next steps. For AT MOTORS, I would start with driving style, budget tier, and preferred test-drive timing.', { speakOutput: false });
      }
    }
  };

  const startLiveSession = async () => {
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    setMode('connecting');
    setStreamText('');
    setRecognized('');
    lastUserTranscriptRef.current = '';
    userDraftTranscriptRef.current = '';
    try {
      const socket = await openRealtimeSocket({ closeOnDone: false });
      setMuted(false);
      mutedRef.current = false;
      await startMicStreaming(socket);
      setMode('listening');
      setStreamText('');
      scheduleVoiceIdleTimer('silence');
    } catch {
      stopMicStreaming();
      setStreamText('Realtime voice is unavailable right now. Open chat for text concierge support.');
      setMode('background');
    }
  };

  const endSession = ({ preserveTranscript = false } = {}) => {
    realtimeRef.current?.close();
    clearVoiceIdleTimer();
    window.clearTimeout(comparisonDebounceRef.current);
    window.speechSynthesis?.cancel();
    stopMicStreaming();
    stopPlayback();
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
    setMode('background');
    if (!preserveTranscript) {
      setComparison(null);
      setStreamText('');
      setRecognized('');
      setConversation([]);
    }
  };

  return (
    <main className={`cockpit mode-${mode} ${comparison ? 'has-comparison' : ''}`}>
      <div className="kenBurns" style={{ backgroundImage: `url(${backgroundImage})` }} />
      <div className="shade" />
      <header className="brand">
        <div className="brandLogo">
          <span className="brandMark">AT</span>
          <strong>MOTORS</strong>
        </div>
        <div className="headerSupport">
          <span>24/7 AI voice + chat support</span>
        </div>
      </header>

      <section className="stage" ref={stageRef}>
        <div className="orbDock">
          <HologramRail vehicles={railVehicles} onInspect={inspectRailVehicle} />
          <button className="orb" onClick={startLiveSession} aria-label="Talk to AI">
            <i />
            <b />
            <span>{mode === 'connecting' ? 'Connecting' : mode === 'listening' ? 'Listening' : mode === 'responding' ? 'Streaming' : 'Talk to AI'}</span>
          </button>
          <div className={`transcript ${hasTranscript ? 'isVisible' : ''}`}>
            <div className="chatGlow" ref={chatGlowRef}>
              {recognized && <p className="recognized">{recognized}</p>}
              {streamText && <p className="stream">{streamText}</p>}
            </div>
          </div>
        </div>

        <div className="compareAnchor" ref={compareAnchorRef}>
          <ComparisonStage comparison={comparison} loading={comparisonLoading} onDownload={downloadComparisonReport} />
        </div>

        {mode === 'background' && !comparison && (
          <div className="heroCopy">
            <p>Luxury automotive intelligence</p>
            <h1>Adventure, refined.</h1>
          </div>
        )}
      </section>

      <button className={`chatLauncher ${chatOpen ? 'isOpen' : ''}`} type="button" onClick={() => setChatOpen((value) => !value)} aria-label="Open chat">
        <Icon name="chat" />
      </button>

      <form className={`askBar ${chatOpen ? 'isOpen' : ''}`} onSubmit={(event) => { event.preventDefault(); askChat(input); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Chat: compare Ferrari SF90 and Deepal S07..." />
        <button type="submit">Ask</button>
      </form>
      <div className={`chatHistoryPanel ${chatOpen ? 'isOpen' : ''}`} aria-live="polite">
        {conversation.slice(-6).map((item, index) => (
          <p className={`chatLine ${item.role}`} key={`${item.role}-${index}-${item.text.slice(0, 12)}`}>{item.text}</p>
        ))}
        {!conversation.length && <p className="chatLine assistant">Ask for a model profile, a side-by-side comparison, or a private viewing.</p>}
      </div>

      <footer className="liveFooter">
        <div className="liveDot"><Icon name="live" /> Live</div>
        <button className={muted ? 'isMuted' : ''} onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}>
          <Icon name={muted ? 'micOff' : 'mic'} /> {muted ? 'Unmute Mic' : 'Mute Mic'}
        </button>
        <button className="endButton" onClick={() => endSession()}><Icon name="end" /> End</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
