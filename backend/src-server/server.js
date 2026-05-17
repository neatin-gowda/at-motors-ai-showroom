const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const WebSocket = require('ws');
const { runAgentTurn } = require('../src-functions/agent/graph');
const { SHOWROOM_MODELS, SOURCE_REGISTRY } = require('../src-functions/agent/catalog');

const logger = pino({ name: 'at-motors-api', level: process.env.LOG_LEVEL || 'info' });
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true, maxPayload: 1024 * 1024 });

const PORT = Number(process.env.PORT || 8080);
const WSS_SECRET = process.env.WSS_SESSION_SECRET || '';
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS;

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 90),
  standardHeaders: true,
  legacyHeaders: false,
}));

function signVoiceSession(sessionId, expiresAt) {
  if (!WSS_SECRET) throw new Error('WSS_SESSION_SECRET is required for voice sessions.');
  return crypto
    .createHmac('sha256', WSS_SECRET)
    .update(`${sessionId}.${expiresAt}`)
    .digest('hex');
}

function verifyVoiceSession(sessionId, expiresAt, signature) {
  if (!sessionId || !expiresAt || !signature) return false;
  if (Number(expiresAt) < Date.now()) return false;
  const expected = signVoiceSession(sessionId, expiresAt);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function realtimeUrl() {
  const endpoint = (process.env.AZURE_REALTIME_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = process.env.AZURE_REALTIME_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_REALTIME_DEPLOYMENT;
  const apiVersion = process.env.AZURE_REALTIME_API_VERSION || '2025-04-01-preview';
  if (!endpoint || !key || !deployment) return null;
  const host = endpoint.replace(/^https?:\/\//, '');
  if (apiVersion.includes('preview')) {
    return `wss://${host}/openai/realtime?api-version=${encodeURIComponent(apiVersion)}&deployment=${encodeURIComponent(deployment)}&api-key=${encodeURIComponent(key)}`;
  }
  return `wss://${host}/openai/v1/realtime?model=${encodeURIComponent(deployment)}&api-key=${encodeURIComponent(key)}`;
}

async function generateReply(messages, options = {}) {
  const endpoint = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  if (!endpoint || !key || !deployment) return null;

  const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': key,
    },
    body: JSON.stringify({
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 360,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Azure OpenAI failed with ${response.status}`);
  return data?.choices?.[0]?.message?.content || null;
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'at-motors-api', time: new Date().toISOString() });
});

app.get('/readyz', (_req, res) => {
  res.status(200).json({
    status: 'ready',
    realtimeConfigured: Boolean(realtimeUrl()),
    chatConfigured: Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_DEPLOYMENT),
  });
});

app.get('/api/at-motors/showroom-models', (_req, res) => {
  res.json({ vehicles: SHOWROOM_MODELS, sources: SOURCE_REGISTRY.map((source) => ({ name: source.brand, url: source.url })) });
});

app.post('/api/at-motors/agent-turn', async (req, res) => {
  const traceId = crypto.randomUUID();
  res.setHeader('x-atm-trace-id', traceId);
  try {
    const result = await runAgentTurn(req.body, { generateReply });
    logger.info({ traceId, intent: result.intent, toolsUsed: result.toolsUsed, latencyMs: result.latencyMs }, 'agent turn');
    res.json(result);
  } catch (error) {
    logger.error({ traceId, error: error.message }, 'agent turn failed');
    res.status(500).json({ error: 'Could not complete the AT MOTORS agent turn.', traceId });
  }
});

app.post('/api/at-motors/chat/stream', async (req, res) => {
  const traceId = crypto.randomUUID();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('x-atm-trace-id', traceId);

  try {
    const result = await runAgentTurn(req.body, { generateReply });
    sendSse(res, 'agent', {
      intent: result.intent,
      uiEvents: result.uiEvents,
      toolsUsed: result.toolsUsed,
      traceId,
    });
    const tokens = result.reply.match(/\S+\s*/g) || [result.reply];
    for (const token of tokens) {
      sendSse(res, 'delta', { text: token });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    sendSse(res, 'done', { traceId });
    res.end();
  } catch (error) {
    logger.error({ traceId, error: error.message }, 'stream failed');
    sendSse(res, 'error', { error: 'Streaming failed.', traceId });
    res.end();
  }
});

app.post('/api/at-motors/voice-session', (req, res) => {
  try {
    const sessionId = req.body?.sessionId || crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60_000;
    const signature = signVoiceSession(sessionId, expiresAt);
    res.json({
      sessionId,
      expiresAt,
      url: `/voice?sessionId=${encodeURIComponent(sessionId)}&expiresAt=${expiresAt}&sig=${signature}`,
    });
  } catch {
    res.status(503).json({ error: 'Voice sessions are not configured.' });
  }
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const origin = request.headers.origin;
  if (url.pathname !== '/voice') {
    socket.destroy();
    return;
  }
  if (origin && !allowedOrigins.includes(origin)) {
    socket.destroy();
    return;
  }
  if (!verifyVoiceSession(url.searchParams.get('sessionId'), url.searchParams.get('expiresAt'), url.searchParams.get('sig'))) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => {
    wss.emit('connection', client, request);
  });
});

wss.on('connection', (client) => {
  const upstreamUrl = realtimeUrl();
  if (!upstreamUrl) {
    client.close(1011, 'Realtime is not configured');
    return;
  }
  const upstream = new WebSocket(upstreamUrl);

  upstream.on('open', () => {
    client.on('message', (message) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
    });
    upstream.on('message', (message) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  });
  upstream.on('close', () => client.close());
  upstream.on('error', () => client.close(1011, 'Realtime upstream failed'));
  client.on('close', () => upstream.close());
});

server.listen(PORT, () => {
  logger.info({ port: PORT }, 'AT MOTORS production API listening');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
