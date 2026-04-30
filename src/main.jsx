import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const cars = [
  {
    maker: 'Ferrari',
    model: 'Rosso Atelier',
    type: 'Italian Supercar',
    price: 'AED 1.18M',
    sprint: '2.9s',
    power: '720 hp',
    aura: 'Carbon cockpit, racing telemetry, concierge allocation',
    img: 'https://images.unsplash.com/photo-1556516731-779d3492975b?auto=format&fit=crop&q=82&w=1800',
  },
  {
    maker: 'Ford',
    model: 'Mustang GT Blackline',
    type: 'American Performance',
    price: 'AED 299K',
    sprint: '4.3s',
    power: '486 hp',
    aura: 'Active exhaust, custom trim, daily performance comfort',
    img: 'https://images.unsplash.com/photo-1561535743-c82c241502d5?auto=format&fit=crop&q=82&w=1800',
  },
  {
    maker: 'Maserati',
    model: 'Nero GranTurismo',
    type: 'Luxury Grand Tourer',
    price: 'AED 690K',
    sprint: '3.5s',
    power: '621 hp',
    aura: 'Italian leather, sonus audio, long-distance refinement',
    img: 'https://images.unsplash.com/photo-1756548843479-3783100b3447?auto=format&fit=crop&q=82&w=1800',
  },
];

const quickQuestions = [
  'Compare Ferrari and Maserati for weekend drives',
  'Which car is best for Dubai daily use?',
  'Book a private viewing this Friday',
  'Explain finance options for the Mustang',
];

const voiceLines = [
  'For pure drama, I would shortlist the Ferrari. For refined long distance comfort, Maserati wins.',
  'The Mustang gives the strongest value-per-performance story, especially for daily driving.',
  'I can compare price, power, ownership style, service expectations, and availability in one conversation.',
];

function Icon({ name }) {
  const icons = {
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.8.4 1.7.7 2.4a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.6.6 2.4.7a2 2 0 0 1 2.1 2z" />,
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    send: <><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7z" /></>,
    bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2z" />,
    check: <path d="m20 6-11 11-5-5" />,
    arrow: <path d="m9 18 6-6-6-6" />,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function localReply(message) {
  const text = message.toLowerCase();
  if (text.includes('book') || text.includes('viewing') || text.includes('test')) {
    return 'I can help arrange a private viewing. Share the date, model shortlist, and contact details, and AT MOTORS can prepare the right Ferrari, Ford, or Maserati experience.';
  }
  if (text.includes('finance') || text.includes('payment')) {
    return 'For finance, Ford performance models are typically the most accessible, Maserati sits in the premium grand touring tier, and Ferrari is best handled through bespoke ownership consultation.';
  }
  if (text.includes('compare') || text.includes('ferrari') || text.includes('maserati') || text.includes('ford')) {
    return 'Ferrari is the emotional performance choice, Maserati is the refined luxury grand tourer, and Ford gives strong performance value. The best recommendation depends on whether you prioritize theatre, comfort, or daily usability.';
  }
  return 'I can compare models, explain ownership fit, qualify budget, and help book a private viewing with AT MOTORS.';
}

function parseAsk(message) {
  const text = message.toLowerCase();
  const mentioned = cars.filter((car) => text.includes(car.maker.toLowerCase()));
  const primary = mentioned[0] || cars[0];
  const secondary = mentioned.find((car) => car.maker !== primary.maker) || cars.find((car) => car.maker !== primary.maker) || cars[1];
  const isComparison = text.includes('compare') || mentioned.length > 1 || text.includes('versus') || text.includes(' vs ');
  const isBooking = text.includes('book') || text.includes('viewing') || text.includes('appointment') || text.includes('test');
  const isFinance = text.includes('finance') || text.includes('payment') || text.includes('emi') || text.includes('loan');
  const isDaily = text.includes('daily') || text.includes('comfort') || text.includes('dubai');

  if (isComparison) {
    return {
      title: `${primary.maker} vs ${secondary.maker}`,
      label: 'Two-vehicle comparison',
      summary: `${primary.maker} is positioned for ${primary.type.toLowerCase()} emotion. ${secondary.maker} gives a different ownership profile for comfort, value, or daily use.`,
      cars: [primary, secondary],
      rows: [
        ['Performance', primary.sprint, secondary.sprint],
        ['Power', primary.power, secondary.power],
        ['Budget tier', primary.price, secondary.price],
        ['Best use', primary.type, secondary.type],
      ],
      next: 'Ask the concierge to convert this comparison into a private viewing shortlist.',
    };
  }

  if (isBooking) {
    return {
      title: 'Private Viewing Request',
      label: 'Showroom action',
      summary: 'The agent can qualify preferred date, model shortlist, contact details, and hand the lead to the showroom team.',
      cars: [primary, secondary],
      rows: [
        ['Intent', 'Viewing', 'High-touch concierge'],
        ['Suggested model', primary.maker, primary.model],
        ['Backup model', secondary.maker, secondary.model],
      ],
      next: 'Collect name, phone, preferred time, and model preference.',
    };
  }

  if (isFinance) {
    return {
      title: 'Finance Guidance',
      label: 'Ownership fit',
      summary: 'The agent can explain budget tier, deposit assumptions, ownership expectations, and which model fits the buyer profile.',
      cars: [primary, secondary],
      rows: [
        ['Entry point', 'Ford', 'Strongest value'],
        ['Premium tier', 'Maserati', 'Grand touring luxury'],
        ['Bespoke tier', 'Ferrari', 'Collector consultation'],
      ],
      next: 'Ask for budget range and preferred monthly payment.',
    };
  }

  if (isDaily) {
    return {
      title: 'Daily-Use Recommendation',
      label: 'Driving profile',
      summary: 'For daily comfort and presence, Maserati usually leads. Ford gives value and usability. Ferrari is the emotional weekend choice.',
      cars: [cars[2], cars[1]],
      rows: [
        ['Comfort', 'Maserati', 'Luxury touring'],
        ['Value', 'Ford', 'Daily performance'],
        ['Emotion', 'Ferrari', 'Weekend theatre'],
      ],
      next: 'Ask whether the buyer prioritizes comfort, sound, image, or resale.',
    };
  }

  return {
    title: 'Concierge Answer Panel',
    label: 'AI showroom insight',
    summary: 'The agent can turn this request into a model recommendation, ownership explanation, or lead-capture workflow.',
    cars: [primary, secondary],
    rows: [
      ['Primary model', primary.maker, primary.model],
      ['Alternative', secondary.maker, secondary.model],
      ['Next step', 'Clarify intent', 'Recommend shortlist'],
    ],
    next: 'Ask for driving style, budget, timeline, and preferred contact method.',
  };
}

function InsightPanel({ insight, onClose, onSpeak }) {
  if (!insight) return null;
  const [first, second] = insight.cars;

  return (
    <div className="insightOverlay" role="dialog" aria-modal="true" aria-label="AT MOTORS insight panel">
      <div className="insightPanel">
        <div className="insightTop">
          <div>
            <span>{insight.label}</span>
            <h3>{insight.title}</h3>
          </div>
          <button onClick={onClose} aria-label="Close insight panel">Close</button>
        </div>
        <p className="insightAsk">Recognized ask: {insight.ask}</p>
        <div className="insightCars">
          {[first, second].map((car) => (
            <div key={car.model}>
              <img src={car.img} alt={`${car.maker} ${car.model}`} />
              <strong>{car.maker}</strong>
              <small>{car.model}</small>
            </div>
          ))}
        </div>
        <div className="insightRows">
          {insight.rows.map((row) => (
            <div key={row.join('-')}>
              <span>{row[0]}</span>
              <b>{row[1]}</b>
              <em>{row[2]}</em>
            </div>
          ))}
        </div>
        <div className="insightAnswer">
          <strong>AI answer</strong>
          <p>{insight.answer || insight.summary}</p>
        </div>
        <div className="insightActions">
          <button onClick={() => onSpeak(insight.answer || insight.summary)}>Speak Panel</button>
          <a href="#voice-agent" onClick={onClose}>Continue Chat</a>
        </div>
        <p className="insightNext">{insight.next}</p>
      </div>
    </div>
  );
}

function App() {
  const [activeCar, setActiveCar] = useState(0);
  const [messages, setMessages] = useState([
    { from: 'agent', text: 'Welcome to AT MOTORS. Ask me to compare Ferrari, Ford, and Maserati, or say what kind of drive you want.' },
  ]);
  const [prompt, setPrompt] = useState('');
  const [docName, setDocName] = useState('AT MOTORS showroom notes');
  const [docText, setDocText] = useState('');
  const [docStatus, setDocStatus] = useState('');
  const [phase, setPhase] = useState('idle');
  const [listening, setListening] = useState(false);
  const [insight, setInsight] = useState(null);
  const chatRef = useRef(null);
  const recognitionRef = useRef(null);
  const heardVoiceRef = useRef(false);

  const active = cars[activeCar];
  const SpeechRecognition = useMemo(() => {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setActiveCar((index) => (index + 1) % cars.length), 5600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const items = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.15 });

    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const speak = (text) => {
    if (!window.speechSynthesis) {
      setPhase('idle');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.94;
    utterance.pitch = 0.82;
    utterance.volume = 1;
    utterance.onstart = () => setPhase('speaking');
    utterance.onend = () => setPhase('idle');
    utterance.onerror = () => setPhase('idle');
    window.speechSynthesis.speak(utterance);
  };

  const streamReply = (reply, source, documentsUsed = []) => {
    const suffix = source === 'fallback' ? '\n\nBackend note: configure Azure OpenAI app settings to enable live LLM answers.' : '';
    const fullReply = `${reply}${documentsUsed.length ? `\n\nContext used: ${documentsUsed.join(', ')}` : ''}${suffix}`;
    const agentMessage = { from: 'agent', text: '' };
    setMessages((current) => [...current, agentMessage]);
    setPhase('streaming');

    let index = 0;
    const step = () => {
      index += Math.max(2, Math.round(fullReply.length / 95));
      const nextText = fullReply.slice(0, index);
      setMessages((current) => {
        const clone = current.slice();
        clone[clone.length - 1] = { ...agentMessage, text: nextText };
        return clone;
      });
      if (index < fullReply.length) window.setTimeout(step, 24);
      else speak(fullReply);
    };
    step();
  };

  const send = async (text = prompt) => {
    const value = text.trim();
    if (!value) return;

    setInsight({ ...parseAsk(value), ask: value, answer: 'Preparing a showroom insight while the AI concierge responds...' });
    const history = messages.slice(-8);
    setMessages((current) => [...current, { from: 'user', text: value }]);
    setPrompt('');
    setPhase('thinking');

    try {
      const response = await fetch(`${API_BASE}/at-motors/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value, history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Chat failed');
      setInsight((current) => current ? { ...current, answer: data.reply } : current);
      streamReply(data.reply, data.source, data.documentsUsed);
    } catch {
      const reply = localReply(value);
      setInsight((current) => current ? { ...current, answer: reply } : current);
      streamReply(reply, 'local');
    }
  };

  const startVoice = () => {
    if (!SpeechRecognition) {
      const reply = 'Voice listening is not available in this browser, but I can still speak answers out loud.';
      setMessages((current) => [...current, { from: 'agent', text: reply }]);
      speak(reply);
      return;
    }

    if (recognitionRef.current) recognitionRef.current.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onstart = () => {
      heardVoiceRef.current = false;
      setListening(true);
      setPhase('listening');
    };
    recognition.onend = () => {
      setListening(false);
      if (!heardVoiceRef.current) setPhase('idle');
    };
    recognition.onerror = () => {
      setListening(false);
      setPhase('idle');
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      heardVoiceRef.current = !!transcript;
      if (transcript) setInsight({ ...parseAsk(transcript), ask: transcript, answer: 'Voice recognized. Opening the showroom insight panel now...' });
      send(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const saveDocument = async () => {
    const content = docText.trim();
    if (content.length < 20) {
      setDocStatus('Paste at least 20 characters of showroom context.');
      return;
    }
    setDocStatus('Saving context...');
    try {
      const response = await fetch(`${API_BASE}/at-motors/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: docName, content }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Save failed');
      setDocStatus(`Saved ${data.document.name} as LLM context.`);
      setDocText('');
    } catch {
      setDocStatus('Could not save context. Check Azure Functions and Cosmos settings.');
    }
  };

  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocName(file.name);
    const text = await file.text();
    setDocText(text.slice(0, 24000));
    setDocStatus('File loaded. Review the text, then save context.');
  };

  return (
    <main className="page">
      <nav className="nav">
        <a className="wordmark" href="#top"><span>AT</span><strong>MOTORS</strong></a>
        <div className="navLinks">
          <a href="#collection">Collection</a>
          <a href="#compare">Compare</a>
          <a href="#voice-agent">AI Agent</a>
        </div>
        <a className="navCta" href="#voice-agent"><Icon name="phone" /><span>Ask AI</span></a>
      </nav>

      <section className="hero" id="top">
        <div className="heroBg" style={{ backgroundImage: `url(${active.img})` }} />
        <div className="heroSheen" />
        <div className="heroInner">
          <div className="kicker">Private luxury automotive concierge</div>
          <h1>AT MOTORS</h1>
          <p>A cinematic AI showroom for collectors, executives, and performance drivers who want the right car, not just the loudest one.</p>
          <div className="heroActions">
            <a className="btn primary" href="#collection">Explore Collection <Icon name="arrow" /></a>
            <a className="btn ghost" href="#voice-agent">Talk To AI <Icon name="chat" /></a>
          </div>
        </div>
        <div className="heroSpec">
          <span>{active.maker}</span>
          <strong>{active.model}</strong>
          <div><b>{active.sprint}</b><small>0-100 km/h</small></div>
          <div><b>{active.power}</b><small>Power</small></div>
        </div>
      </section>

      <section className="marquee"><div>Ferrari curated collection | Ford performance studio | Maserati grand touring lounge | AI concierge showroom |</div></section>

      <section className="section reveal" id="collection">
        <div className="sectionHead"><span>01 / Collection</span><h2>Three personalities, one showroom standard.</h2></div>
        <div className="carGrid">
          {cars.map((car, index) => (
            <button className={`carCard ${activeCar === index ? 'active' : ''}`} key={car.model} onClick={() => setActiveCar(index)}>
              <img src={car.img} alt={`${car.maker} ${car.model}`} />
              <div className="carBody">
                <span>{car.type}</span>
                <h3>{car.maker}</h3>
                <p>{car.aura}</p>
                <div><b>{car.price}</b><small>{car.sprint}</small></div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="featureStrip reveal">
        <div><Icon name="bolt" /><strong>Performance Matchmaking</strong><span>Rank cars by emotion, comfort, budget, road use, and resale intent.</span></div>
        <div><Icon name="shield" /><strong>Ownership Intelligence</strong><span>Surface warranty, servicing, insurance, and concierge delivery next steps.</span></div>
        <div><Icon name="star" /><strong>Luxury Lead Capture</strong><span>Qualify buyer intent while keeping the experience premium and conversational.</span></div>
      </section>

      <section className="section compare reveal" id="compare">
        <div className="sectionHead"><span>02 / Comparison Screens</span><h2>Designed for fast decisions inside the showroom.</h2></div>
        <div className="screenRow">
          <div className="screen screenDark">
            <div className="screenTop"><span>Live Comparison</span><i>AI ranked</i></div>
            <div className="bars">
              {cars.map((car, index) => (
                <div className="barRow" key={car.model}>
                  <span>{car.maker}</span><div><b style={{ width: `${92 - index * 13}%` }} /></div><em>{92 - index * 8}</em>
                </div>
              ))}
            </div>
            <p>Best emotional fit: Ferrari. Best daily luxury fit: Maserati. Best value fit: Ford.</p>
          </div>
          <div className="screen screenLight">
            <div className="screenTop"><span>Buyer View</span><i>Voice summary</i></div>
            <div className="miniCars">
              {cars.map((car) => <div key={car.model}><img src={car.img} alt="" /><strong>{car.maker}</strong><small>{car.price}</small></div>)}
            </div>
            <ul>
              <li><Icon name="check" /> Compare acceleration, comfort, image, and ownership.</li>
              <li><Icon name="check" /> Create a qualified enquiry from the conversation.</li>
              <li><Icon name="check" /> Speak recommendations back to the visitor.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="agent reveal" id="voice-agent">
        <div className="agentCopy">
          <span>03 / AI Voice Agent</span>
          <h2>Ask the showroom. Hear the answer.</h2>
          <p>A concierge-grade conversation layer for model comparisons, buyer qualification, finance guidance, private viewing requests, and follow-up handoff.</p>
          <div className="stack"><span>Realtime voice</span><span>LLM reasoning</span><span>Inventory search</span><span>CRM booking</span></div>
        </div>

        <div className="agentConsole">
          <div className="agentOrb" aria-hidden="true">
            <span className={phase !== 'idle' ? 'active' : ''} />
            <div className={`wave wave-${phase}`}><i /><i /><i /><i /><i /></div>
          </div>
          <div className="agentStatus">
            <strong>AT Motors Concierge</strong>
            <small>
              {phase === 'listening' && 'Listening now'}
              {phase === 'thinking' && 'LLM thinking'}
              {phase === 'streaming' && 'Streaming answer'}
              {phase === 'speaking' && 'Speaking response'}
              {phase === 'idle' && 'Voice ready'}
            </small>
          </div>
          <div className="chatLog" ref={chatRef}>
            {messages.map((message, index) => <div className={`message ${message.from}`} key={`${message.from}-${index}`}>{message.text}</div>)}
          </div>
          <div className="questionRow">{quickQuestions.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}</div>
          <div className="agentInput">
            <button className={`mic ${listening ? 'on' : ''}`} onClick={startVoice} aria-label="Start voice input"><Icon name="phone" /></button>
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Ask about Ferrari, Ford, Maserati, finance, or booking..." />
            <button className="send" onClick={() => send()} aria-label="Send message"><Icon name="send" /></button>
          </div>
          <button className="voiceLine" onClick={() => speak(voiceLines[activeCar])}>Play AI voice recommendation</button>
        </div>

        <div className="contextPanel">
          <div className="contextHead"><span>Document Context</span><label>Upload text<input type="file" accept=".txt,.md,.csv,.json" onChange={loadFile} /></label></div>
          <input value={docName} onChange={(event) => setDocName(event.target.value)} />
          <textarea value={docText} onChange={(event) => setDocText(event.target.value)} placeholder="Paste vehicle inventory, pricing notes, finance policy, lead qualification rules, FAQs, or showroom process here. This text is saved to Cosmos DB and injected into the LLM prompt." />
          <button onClick={saveDocument}>Save As LLM Context</button>
          {docStatus && <p>{docStatus}</p>}
        </div>
      </section>
      <InsightPanel insight={insight} onClose={() => setInsight(null)} onSpeak={speak} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
