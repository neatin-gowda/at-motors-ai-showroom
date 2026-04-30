import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

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

  const recognitionRef = useRef(null);
  const realtimeRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const SpeechRecognition = useMemo(() => window.SpeechRecognition || window.webkitSpeechRecognition || null, []);
  const background = comparison?.left || cars[activeCar];

  useEffect(() => {
    const timer = window.setInterval(() => setActiveCar((index) => (index + 1) % cars.length), 7000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--voice-level', String(level));
  }, [level]);

  const stopAnalyser = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close().catch(() => {});
    rafRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    setLevel(0);
  };

  const startAnalyser = async () => {
    stopAnalyser();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;
    mediaStreamRef.current = stream;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setLevel(Math.min(1, average / 90));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
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

  const askRealtime = async (message) => {
    const sessionResponse = await fetch(`${API_BASE}/at-motors/realtime-session`);
    const session = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !session.url) throw new Error(session.error || 'Realtime session is not configured');

    return new Promise((resolve, reject) => {
      let finalText = '';
      let settled = false;
      const socket = new WebSocket(session.url);
      realtimeRef.current = socket;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          reject(new Error('Realtime response timed out'));
        }
      }, 30000);

      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        socket.close();
        resolve(finalText.trim());
      };

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'session.update',
          session: {
            instructions: 'You are AT MOTORS luxury automotive AI concierge. Only answer automotive, car comparison, ownership, finance, test-drive, showroom, and AT MOTORS questions. If asked anything outside automotive, politely refuse and redirect to cars. Be concise, premium, and helpful. If comparing cars, focus on performance, comfort, ownership fit, price tier, and next viewing step.',
            modalities: ['text'],
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              silence_duration_ms: 500,
              prefix_padding_ms: 300,
            },
          },
        }));
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
            modalities: ['text'],
            instructions: 'Answer as a premium automotive concierge. Stay strictly on automotive topics. Do not mention setup, Bing, grounding, or Azure.',
          },
        }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const delta = data.delta || data.text || data.transcript || '';
        if (
          data.type === 'response.text.delta' ||
          data.type === 'response.output_text.delta' ||
          data.type === 'response.audio_transcript.delta'
        ) {
          finalText += delta;
          setStreamText(finalText);
          setMode('responding');
        }
        if (data.type === 'response.done' || data.type === 'response.completed') finish();
        if (data.type === 'error') {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            socket.close();
            reject(new Error(data.error?.message || 'Realtime API error'));
          }
        }
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error('Realtime WebSocket failed'));
        }
      };
    });
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
      const realtimeReply = await askRealtime(value);
      streamAnswer(realtimeReply || 'I am ready to continue the AT MOTORS concierge session.');
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
    setMode('listening');
    setStreamText('');
    setRecognized('');
    await startAnalyser().catch(() => {});

    if (!SpeechRecognition) {
      setStreamText('Speech recognition is not available in this browser. Type your request below.');
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join('');
      setRecognized(transcript);
      if (event.results[event.results.length - 1].isFinal) {
        stopAnalyser();
        ask(transcript);
      }
    };
    recognition.onend = () => stopAnalyser();
    recognition.onerror = () => {
      stopAnalyser();
      setMode('background');
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const endSession = () => {
    recognitionRef.current?.stop();
    realtimeRef.current?.close();
    window.speechSynthesis?.cancel();
    stopAnalyser();
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
            <span>{mode === 'listening' ? 'Listening' : mode === 'responding' ? 'Streaming' : 'Talk to AI'}</span>
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
