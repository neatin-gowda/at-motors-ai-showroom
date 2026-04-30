import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const REALTIME_SAMPLE_RATE = 24000;
const REALTIME_INSTRUCTIONS = 'You are AT MOTORS luxury automotive AI concierge. Only answer automotive, car comparison, ownership, finance, test-drive, showroom, and AT MOTORS questions. If asked anything outside automotive, politely refuse and redirect to cars. Be concise, premium, and helpful. If comparing cars, focus on performance, comfort, ownership fit, price tier, and next viewing step. Do not mention setup, Bing, grounding, environment variables, or Azure.';

const cars = [
  {
    maker: 'Ferrari',
    model: 'Rosso Atelier',
    type: 'Supercar',
    price: 'AED 1.18M',
    sprint: '2.9s',
    speed: '340 km/h',
    engine: 'V8 Hybrid',
    img: 'https://images.unsplash.com/photo-1556516731-779d3492975b?auto=format&fit=crop&q=88&w=2200',
  },
  {
    maker: 'Ford',
    model: 'Mustang GT Blackline',
    type: 'Performance Coupe',
    price: 'AED 299K',
    sprint: '4.3s',
    speed: '250 km/h',
    engine: '5.0L V8',
    img: 'https://images.unsplash.com/photo-1561535743-c82c241502d5?auto=format&fit=crop&q=88&w=2200',
  },
  {
    maker: 'Maserati',
    model: 'Nero GranTurismo',
    type: 'Grand Tourer',
    price: 'AED 690K',
    sprint: '3.5s',
    speed: '320 km/h',
    engine: 'Twin-Turbo V6',
    img: 'https://images.unsplash.com/photo-1756548843479-3783100b3447?auto=format&fit=crop&q=88&w=2200',
  },
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

function Icon({ name }) {
  const paths = {
    mic: <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />,
    end: <path d="M21 15.4c-2.2-1.2-5.1-1.9-9-1.9s-6.8.7-9 1.9l2.6 4.2 3.3-1.7v-2.2c.9-.1 1.9-.2 3.1-.2s2.2.1 3.1.2v2.2l3.3 1.7 2.6-4.2Z" />,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="m23 9-6 6" /><path d="m17 9 6 6" /></>,
    live: <path d="M12 6v6l4 2" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function parseComparison(message) {
  const text = message.toLowerCase();
  const found = cars.filter((car) => text.includes(car.maker.toLowerCase()) || text.includes(car.model.toLowerCase().split(' ')[0]));
  const asksCompare = text.includes('compare') || text.includes(' vs ') || text.includes('versus') || found.length > 1;
  if (!asksCompare) return null;
  const left = found[0] || cars[0];
  const right = found.find((car) => car.maker !== left.maker) || cars.find((car) => car.maker !== left.maker) || cars[1];
  return { left, right };
}

function isAutomotiveTopic(message) {
  const text = message.toLowerCase();
  return [
    'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
    'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
    'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
    'price', 'finance', 'booking', 'viewing', 'test drive', 'compare',
    ...cars.flatMap((car) => [car.maker.toLowerCase(), car.model.toLowerCase().split(' ')[0]]),
  ].some((term) => text.includes(term));
}

function ComparisonStage({ comparison, sources }) {
  if (!comparison) return null;
  const { left, right } = comparison;
  const rows = [
    ['Engine', left.engine, right.engine],
    ['Top Speed', left.speed, right.speed],
    ['0-100 km/h', left.sprint, right.sprint],
    ['Price', left.price, right.price],
  ];

  return (
    <section className="compareStage">
      {[left, right].map((car, index) => (
        <article className={`comparePanel ${index === 0 ? 'fromLeft' : 'fromRight'}`} key={car.model}>
          <img src={car.img} alt={`${car.maker} ${car.model}`} />
          <div className="compareTitle">
            <span>{car.type}</span>
            <h2>{car.maker}</h2>
            <p>{car.model}</p>
          </div>
        </article>
      ))}
      <div className="specGrid">
        <div className="specHeader">
          <span>Specification</span>
          <b>{left.maker}</b>
          <em>{right.maker}</em>
        </div>
        {rows.map(([label, a, b]) => (
          <div key={label}>
            <span>{label}</span>
            <b>{a}</b>
            <em>{b}</em>
          </div>
        ))}
      </div>
      <div className="sourceStrip">
        <strong>{left.maker} vs {right.maker}</strong>
        {sources.length ? sources.slice(0, 3).map((source) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer">{source.name}</a>) : <span>Realtime model active</span>}
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
  const [sources, setSources] = useState([]);
  const [input, setInput] = useState('');

  const realtimeRef = useRef(null);
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
  const responseTextRef = useRef('');
  const responseHasAudioTranscriptRef = useRef(false);
  const modelRespondingRef = useRef(false);
  const lastUserTranscriptRef = useRef('');
  const background = comparison?.left || cars[activeCar];

  useEffect(() => {
    const timer = window.setInterval(() => setActiveCar((index) => (index + 1) % cars.length), 7000);
    return () => window.clearInterval(timer);
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
      const channel = event.inputBuffer.getChannelData(0);
      const audio = floatToPcm16Base64(channel, audioContext.sampleRate);
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    };

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(1, average / 90));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const handleUserTranscript = (transcript) => {
    const value = transcript.trim();
    if (!value || value === lastUserTranscriptRef.current) return;
    lastUserTranscriptRef.current = value;
    setRecognized(value);
    setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
    if (isAutomotiveTopic(value)) {
      setComparison(parseComparison(value));
      setSources([]);
    } else {
      setComparison(null);
    }
  };

  const handleRealtimeEvent = (event) => {
    const data = JSON.parse(event.data);
    const type = data.type || '';

    if (type === 'response.created') {
      modelRespondingRef.current = true;
      responseTextRef.current = '';
      responseHasAudioTranscriptRef.current = false;
      setStreamText('');
      setMode('responding');
    }

    if (type === 'input_audio_buffer.speech_started') {
      stopPlayback();
      responseTextRef.current = '';
      responseHasAudioTranscriptRef.current = false;
      setStreamText('');
      setRecognized('');
      setMode('listening');
      if (modelRespondingRef.current && realtimeRef.current?.readyState === WebSocket.OPEN) {
        try {
          realtimeRef.current.send(JSON.stringify({ type: 'response.cancel' }));
        } catch {
          // The server may have no active response to cancel.
        }
      }
    }

    if (type === 'input_audio_buffer.speech_stopped' || type === 'input_audio_buffer.committed') {
      setMode('responding');
    }

    if (
      type === 'conversation.item.input_audio_transcription.completed' ||
      type === 'conversation.item.audio_transcription.completed'
    ) {
      handleUserTranscript(data.transcript || '');
    }

    if (
      type === 'conversation.item.input_audio_transcription.delta' ||
      type === 'conversation.item.audio_transcription.delta'
    ) {
      setRecognized((text) => `${text}${data.delta || ''}`);
    }

    if (type === 'response.audio.delta' || type === 'response.output_audio.delta') {
      void playRealtimeAudio(data.delta);
      setMode('responding');
    }

    if (type === 'response.audio_transcript.delta' || type === 'response.output_audio_transcript.delta') {
      responseHasAudioTranscriptRef.current = true;
      responseTextRef.current += data.delta || '';
      setStreamText(responseTextRef.current);
      setMode('responding');
    }

    if ((type === 'response.text.delta' || type === 'response.output_text.delta') && !responseHasAudioTranscriptRef.current) {
      responseTextRef.current += data.delta || '';
      setStreamText(responseTextRef.current);
      setMode('responding');
    }

    if (type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done') {
      if (data.transcript) {
        responseTextRef.current = data.transcript;
        setStreamText(data.transcript);
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
      }
    }

    if (type === 'error') {
      setStreamText('Realtime voice is unavailable right now. You can still type your automotive request below.');
      setMode(comparisonRef.current ? 'comparison' : 'background');
    }
  };

  const configureRealtimeSession = (socket) => {
    socket.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: REALTIME_INSTRUCTIONS,
        modalities: ['audio', 'text'],
        voice: 'alloy',
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

    const sessionResponse = await fetch(`${API_BASE}/at-motors/realtime-session`);
    const session = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !session.url) throw new Error(session.error || 'Realtime session is not configured');

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(session.url);
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

  const streamAnswer = (text) => {
    setStreamText('');
    setMode('responding');
    let index = 0;
    const step = () => {
      index += Math.max(2, Math.round(text.length / 110));
      setStreamText(text.slice(0, index));
      if (index < text.length) window.setTimeout(step, 18);
      else {
        setConversation((items) => [...items, { role: 'assistant', text }].slice(-4));
        speak(text);
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
      },
    }));
  };

  const ask = async (message) => {
    const value = message.trim();
    if (!value) return;
    if (!isAutomotiveTopic(value)) {
      setComparison(null);
      setSources([]);
      setRecognized(value);
      setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
      streamAnswer('I can only assist with AT MOTORS, cars, automotive comparisons, ownership, finance, test drives, and showroom bookings.');
      return;
    }
    const parsed = parseComparison(value);
    setRecognized(value);
    setComparison(parsed);
    setSources([]);
    setConversation((items) => [...items, { role: 'user', text: value }].slice(-4));
    setMode(parsed ? 'comparison' : 'responding');
    setInput('');

    try {
      await sendRealtimeTextMessage(value);
    } catch {
      try {
        const response = await fetch(`${API_BASE}/at-motors/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, history: [] }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Chat failed');
        setSources(data.sources || []);
        streamAnswer(data.reply);
      } catch {
        streamAnswer('I can compare these models on performance, comfort, ownership fit, price tier, and viewing next steps. For AT MOTORS, I would start with driving style, budget tier, and preferred test-drive timing.');
      }
    }
  };

  const startLiveSession = async () => {
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
    setMode('connecting');
    setStreamText('');
    setRecognized('');
    lastUserTranscriptRef.current = '';
    try {
      const socket = await openRealtimeSocket({ closeOnDone: false });
      await startMicStreaming(socket);
      setMode('listening');
      setStreamText('Listening. Ask about AT MOTORS vehicles, pricing, test drives, or comparisons.');
    } catch {
      stopMicStreaming();
      setStreamText('Realtime voice is unavailable right now. You can still type your automotive request below.');
      setMode('background');
    }
  };

  const endSession = () => {
    realtimeRef.current?.close();
    window.speechSynthesis?.cancel();
    stopMicStreaming();
    stopPlayback();
    playbackContextRef.current?.close().catch(() => {});
    playbackContextRef.current = null;
    setMode('background');
    setComparison(null);
    setStreamText('');
    setRecognized('');
    setConversation([]);
  };

  return (
    <main className={`cockpit mode-${mode} ${comparison ? 'has-comparison' : ''}`}>
      <div className="kenBurns" style={{ backgroundImage: `url(${background.img})` }} />
      <div className="shade" />
      <header className="brand">
        <span>AT</span>
        <strong>MOTORS</strong>
      </header>

      <section className="stage">
        <div className="orbDock">
          <button className="orb" onClick={startLiveSession} aria-label="Talk to AI">
            <i />
            <b />
            <span>{mode === 'connecting' ? 'Connecting' : mode === 'listening' ? 'Listening' : mode === 'responding' ? 'Streaming' : 'Talk to AI'}</span>
          </button>
          <div className="transcript">
            <div className="chatGlow">
              {conversation.slice(-2).map((item, index) => (
                <p className={`chatLine ${item.role}`} key={`${item.role}-${index}-${item.text.slice(0, 12)}`}>{item.text}</p>
              ))}
              {recognized && <p className="recognized">{recognized}</p>}
              {streamText && <p className="stream">{streamText}</p>}
            </div>
          </div>
        </div>

        <ComparisonStage comparison={comparison} sources={sources} />

        {mode === 'background' && (
          <div className="heroCopy">
            <p>Luxury automotive intelligence</p>
            <h1>Ask. Compare. Decide.</h1>
          </div>
        )}
      </section>

      <form className="askBar" onSubmit={(event) => { event.preventDefault(); ask(input); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask: Compare Ferrari and Maserati..." />
        <button type="submit">Ask</button>
      </form>

      <footer className="liveFooter">
        <div className="liveDot"><Icon name="live" /> Live</div>
        <button onClick={() => setMuted((value) => !value)}><Icon name="mute" /> {muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={endSession}><Icon name="end" /> End</button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
