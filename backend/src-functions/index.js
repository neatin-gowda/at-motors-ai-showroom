const { app } = require('@azure/functions');
const {
  getContainers,
  ok,
  created,
  badRequest,
  serverError,
  uuid,
  trimText,
  log,
} = require('./shared');

const SYSTEM_PROMPT = `You are the AT MOTORS luxury automotive AI concierge.
Represent a premium showroom with Ferrari, Ford performance, and Maserati vehicles.
Use the supplied showroom context first. If context is missing, say so briefly and give a helpful next step.
Keep answers polished, concise, and sales-useful.
When comparison is requested, compare performance, comfort, ownership fit, budget tier, and appointment next step.
Never invent exact inventory availability.
Strictly refuse non-automotive topics and redirect the user back to cars, automotive ownership, finance, test drives, showroom bookings, or AT MOTORS.`;

function isAutomotiveTopic(message) {
  const text = String(message || '').toLowerCase();
  return [
    'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
    'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
    'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
    'price', 'finance', 'booking', 'viewing', 'test drive', 'compare',
    'ferrari', 'ford', 'mustang', 'maserati', 'porsche', 'lucid', 'mercedes',
    'bmw', 'audi', 'tesla', 'lamborghini', 'bentley', 'rolls',
  ].some((term) => text.includes(term));
}

function getRealtimeWebSocketUrl() {
  const endpoint = (process.env.AZURE_REALTIME_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const key = process.env.AZURE_REALTIME_API_KEY || process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_REALTIME_DEPLOYMENT;
  const apiVersion = process.env.AZURE_REALTIME_API_VERSION || '2025-04-01-preview';
  if (!endpoint || !key || !deployment) return null;

  const host = endpoint.replace(/^https?:\/\//, '');
  const queryKey = encodeURIComponent(key);
  if (apiVersion.includes('preview')) {
    return `wss://${host}/openai/realtime?api-version=${encodeURIComponent(apiVersion)}&deployment=${encodeURIComponent(deployment)}&api-key=${queryKey}`;
  }
  return `wss://${host}/openai/v1/realtime?model=${encodeURIComponent(deployment)}&api-key=${queryKey}`;
}

async function callAzureOpenAI(messages, options = {}) {
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
      temperature: options.temperature ?? 0.45,
      max_tokens: options.maxTokens ?? 650,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || `Azure OpenAI failed with ${response.status}`;
    throw new Error(detail);
  }
  return data?.choices?.[0]?.message?.content || null;
}

async function searchCarSources(query) {
  const key = process.env.BING_SEARCH_KEY;
  const endpoint = (process.env.BING_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/search').replace(/\/+$/, '');
  if (!key) return [];

  const url = `${endpoint}?q=${encodeURIComponent(query)}&count=5&mkt=en-US&responseFilter=Webpages`;
  const response = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Bing Search failed with ${response.status}`);

  return (data.webPages?.value || []).slice(0, 5).map((item) => ({
    name: item.name,
    url: item.url,
    snippet: item.snippet,
    thumbnailUrl: item.thumbnailUrl || item.image?.thumbnailUrl || item.primaryImageOfPage?.thumbnailUrl || '',
  }));
}

function extractJsonObject(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function inferComparedVehicles(message) {
  const text = trimText(message, 300)
    .replace(/\b(compare|comparison|between|please|can you|show me|cars?|vehicles?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = text
    .split(/\s+(?:vs\.?|versus|and|with|against)\s+/i)
    .map((part) => part.replace(/[?.!,]/g, '').trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : ['Vehicle A', 'Vehicle B'];
}

function imageForVehicle(vehicle, sources) {
  const name = `${vehicle.brand || ''} ${vehicle.model || vehicle.name || ''}`.toLowerCase();
  const matched = sources.find((source) => {
    const haystack = `${source.name || ''} ${source.snippet || ''}`.toLowerCase();
    return source.thumbnailUrl && name.split(/\s+/).filter((word) => word.length > 2).some((word) => haystack.includes(word));
  });
  if (matched?.thumbnailUrl) return matched.thumbnailUrl;

  const query = encodeURIComponent(`${vehicle.name || `${vehicle.brand || ''} ${vehicle.model || ''}`} luxury car exterior`);
  return `https://source.unsplash.com/1600x900/?${query}`;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVehicle(vehicle, fallbackName, sources) {
  const rawName = trimText(vehicle?.name || fallbackName, 80) || fallbackName;
  const brand = trimText(vehicle?.brand || rawName.split(' ')[0], 50);
  const model = trimText(vehicle?.model || rawName.replace(new RegExp(`^${escapeRegExp(brand)}\\s*`, 'i'), ''), 80) || rawName;
  const type = trimText(vehicle?.type || vehicle?.segment || 'Luxury vehicle', 60);
  const specs = vehicle?.specs && typeof vehicle.specs === 'object' ? vehicle.specs : {};
  const normalized = { name: rawName, brand, model, type, specs };
  return {
    ...normalized,
    imageUrl: trimText(vehicle?.imageUrl || vehicle?.image || '', 600) || imageForVehicle(normalized, sources),
    highlight: trimText(vehicle?.highlight || vehicle?.bestFor || 'Private showroom fit', 100),
  };
}

function fallbackComparison(message, sources = []) {
  const names = inferComparedVehicles(message);
  const vehicles = names.map((name) => normalizeVehicle({ name }, name, sources));
  return {
    title: `${vehicles[0].name} vs ${vehicles[1].name}`,
    summary: 'Live specification data is not available yet. I can still stage the comparison and use verified sources once Azure OpenAI and Bing data are reachable.',
    vehicles,
    rows: ['Engine', 'Top speed', '0-100 km/h', 'Estimated price', 'Best fit'].map((label) => ({
      label,
      values: ['Awaiting verified data', 'Awaiting verified data'],
    })),
    sources,
  };
}

function normalizeComparison(raw, message, sources) {
  const fallback = fallbackComparison(message, sources);
  const vehicles = Array.isArray(raw?.vehicles) ? raw.vehicles.slice(0, 2) : [];
  const normalizedVehicles = [
    normalizeVehicle(vehicles[0], fallback.vehicles[0].name, sources),
    normalizeVehicle(vehicles[1], fallback.vehicles[1].name, sources),
  ];

  const rowLabels = ['Engine', 'Top speed', '0-100 km/h', 'Estimated price', 'Best fit'];
  const rows = Array.isArray(raw?.rows) && raw.rows.length
    ? raw.rows.slice(0, 8).map((row) => ({
      label: trimText(row.label, 40),
      values: Array.isArray(row.values)
        ? row.values.slice(0, 2).map((value) => trimText(value, 80) || 'Not verified')
        : [
          trimText(row.left || row.a || '', 80) || 'Not verified',
          trimText(row.right || row.b || '', 80) || 'Not verified',
        ],
    })).filter((row) => row.label)
    : rowLabels.map((label) => ({
      label,
      values: [
        trimText(normalizedVehicles[0].specs?.[label] || normalizedVehicles[0].specs?.[label.toLowerCase()] || '', 80) || 'Not verified',
        trimText(normalizedVehicles[1].specs?.[label] || normalizedVehicles[1].specs?.[label.toLowerCase()] || '', 80) || 'Not verified',
      ],
    }));

  return {
    title: trimText(raw?.title, 120) || `${normalizedVehicles[0].name} vs ${normalizedVehicles[1].name}`,
    summary: trimText(raw?.summary, 360) || fallback.summary,
    recommendation: trimText(raw?.recommendation, 220) || '',
    vehicles: normalizedVehicles,
    rows,
    sources,
  };
}

async function buildStructuredComparison(message, context, sources) {
  const sourceText = sources.length
    ? sources.map((source, index) => `[${index + 1}] ${source.name}\n${source.url}\n${source.snippet}`).join('\n\n')
    : 'No live search sources were available. If exact specs are not available, write "Not verified" instead of inventing numbers.';
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nReturn only valid JSON for the UI. Do not wrap in markdown. Do not invent specs. Use "Not verified" for unknown exact values.` },
    { role: 'system', content: context.text ? `Showroom context:\n${context.text}` : 'No uploaded showroom context is available yet.' },
    { role: 'system', content: `Live source context:\n${sourceText}` },
    {
      role: 'user',
      content: `Create a luxury automotive comparison from this request: "${message}".
Return JSON with this exact shape:
{
  "title": "Vehicle A vs Vehicle B",
  "summary": "one polished sentence for the showroom UI",
  "recommendation": "one concise buying guidance sentence",
  "vehicles": [
    {"name":"", "brand":"", "model":"", "type":"", "highlight":"", "specs":{"Engine":"","Top speed":"","0-100 km/h":"","Estimated price":"","Best fit":""}},
    {"name":"", "brand":"", "model":"", "type":"", "highlight":"", "specs":{"Engine":"","Top speed":"","0-100 km/h":"","Estimated price":"","Best fit":""}}
  ],
  "rows": [
    {"label":"Engine","values":["",""]},
    {"label":"Top speed","values":["",""]},
    {"label":"0-100 km/h","values":["",""]},
    {"label":"Estimated price","values":["",""]},
    {"label":"Best fit","values":["",""]}
  ]
}`,
    },
  ];

  const reply = await callAzureOpenAI(messages, {
    temperature: 0.25,
    maxTokens: 900,
    responseFormat: { type: 'json_object' },
  });
  return extractJsonObject(reply);
}

function needsLiveCarSearch(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('compare') || text.includes(' vs ') || text.includes('versus') || text.includes('top speed') || text.includes('price');
}

function fallbackReply(message, contextText) {
  const text = String(message || '').toLowerCase();
  if (text.includes('book') || text.includes('viewing') || text.includes('test')) {
    return 'I can help arrange a private viewing. Share your preferred date, model shortlist, and contact details, and AT MOTORS can prepare the right Ferrari, Ford, or Maserati experience.';
  }
  if (text.includes('finance') || text.includes('payment')) {
    return 'For finance, Ford performance models are usually the most accessible, Maserati sits in the premium grand touring tier, and Ferrari is best handled through bespoke ownership consultation.';
  }
  if (text.includes('compare') || text.includes('ferrari') || text.includes('maserati') || text.includes('ford')) {
    return 'Ferrari is the emotional performance choice, Maserati is the refined luxury grand tourer, and Ford gives strong performance value. The best recommendation depends on whether the buyer prioritizes theatre, comfort, or daily usability.';
  }
  if (contextText) {
    return 'I found showroom context for this question. I can use it to compare model fit, ownership considerations, and the most suitable next step for the visitor.';
  }
  return 'I can compare models, explain ownership fit, qualify budget, and help book a private viewing with AT MOTORS.';
}

async function getDocumentContext() {
  const { documents } = await getContainers();
  const { resources } = await documents.items.query({
    query: 'SELECT TOP 6 c.name, c.content FROM c WHERE c.brand = "at-motors" ORDER BY c.created_at DESC',
  }).fetchAll();

  return {
    names: resources.map((doc) => doc.name),
    text: resources.map((doc, index) => `[Document ${index + 1}: ${doc.name}]\n${trimText(doc.content, 4500)}`).join('\n\n'),
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => ok({ status: 'ok', app: 'at-motors-ai-showroom', time: new Date().toISOString() }),
});

app.http('realtime-session', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'at-motors/realtime-session',
  handler: async () => {
    const url = getRealtimeWebSocketUrl();
    if (!url) return serverError('Realtime environment variables are not configured.');
    return ok({
      url,
      deployment: process.env.AZURE_REALTIME_DEPLOYMENT,
      apiVersion: process.env.AZURE_REALTIME_API_VERSION || '2025-04-01-preview',
    });
  },
});

app.http('documents-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'at-motors/documents',
  handler: async () => {
    try {
      const { documents } = await getContainers();
      const { resources } = await documents.items.query({
        query: 'SELECT TOP 30 c.id, c.name, c.created_at, c.char_count FROM c WHERE c.brand = "at-motors" ORDER BY c.created_at DESC',
      }).fetchAll();
      return ok({ documents: resources });
    } catch {
      return serverError('Could not load AT MOTORS documents.');
    }
  },
});

app.http('documents-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'at-motors/documents',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const name = trimText(body.name, 120);
      const content = trimText(body.content, 24000);
      if (!name || content.length < 20) return badRequest('Document name and at least 20 characters of text are required.');

      const { documents } = await getContainers();
      const doc = {
        id: uuid(),
        brand: 'at-motors',
        name,
        content,
        char_count: content.length,
        created_at: new Date().toISOString(),
      };
      await documents.items.create(doc);
      log(context, 'info', 'Document saved', { documentId: doc.id, name });
      return created({ document: { id: doc.id, name: doc.name, created_at: doc.created_at, char_count: doc.char_count } });
    } catch (error) {
      log(context, 'error', 'Document save failed', { error: error.message });
      return serverError('Could not save AT MOTORS document.');
    }
  },
});

app.http('chat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'at-motors/chat',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const message = trimText(body.message, 2000);
      const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
      if (!message) return badRequest('Message is required.');
      if (!isAutomotiveTopic(message)) {
        return ok({
          reply: 'I can only assist with AT MOTORS, cars, automotive comparisons, ownership, finance, test drives, and showroom bookings.',
          source: 'guardrail',
          documentsUsed: [],
          sources: [],
        });
      }

      const docContext = await getDocumentContext();
      let sources = [];
      if (needsLiveCarSearch(message)) {
        sources = await searchCarSources(`${message} official specs engine top speed 0-100 price`).catch((error) => {
          log(context, 'warn', 'Bing grounding failed', { error: error.message });
          return [];
        });
      }

      const searchContext = sources.length
        ? `Live search sources:\n${sources.map((source, index) => `[${index + 1}] ${source.name}\n${source.url}\n${source.snippet}`).join('\n\n')}`
        : 'No live search sources were available. Do not present unverified specs as live verified data.';

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: docContext.text ? `Showroom context:\n${docContext.text}` : 'No uploaded showroom context is available yet.' },
        { role: 'system', content: searchContext },
        ...history.map((item) => ({
          role: item.from === 'user' ? 'user' : 'assistant',
          content: trimText(item.text, 1200),
        })).filter((item) => item.content),
        { role: 'user', content: message },
      ];

      let reply = await callAzureOpenAI(messages);
      const source = reply ? 'azure-openai' : 'fallback';
      if (!reply) reply = fallbackReply(message, docContext.text);

      log(context, 'info', 'Chat answered', { source, documentsUsed: docContext.names.length });
      return ok({ reply, source, documentsUsed: docContext.names, sources });
    } catch (error) {
      log(context, 'error', 'Chat failed', { error: error.message });
      return serverError('Could not answer with the AT MOTORS concierge.');
    }
  },
});

app.http('comparison', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'at-motors/comparison',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const message = trimText(body.message, 2000);
      if (!message) return badRequest('Message is required.');
      if (!isAutomotiveTopic(message)) return badRequest('Comparison requests must stay automotive.');

      const docContext = await getDocumentContext().catch(() => ({ names: [], text: '' }));
      const sources = await searchCarSources(`${message} official specifications engine range price performance UAE`).catch((error) => {
        log(context, 'warn', 'Comparison search failed', { error: error.message });
        return [];
      });

      let raw = null;
      try {
        raw = await buildStructuredComparison(message, docContext, sources);
      } catch (error) {
        log(context, 'warn', 'Structured comparison failed', { error: error.message });
      }

      return ok({
        comparison: normalizeComparison(raw, message, sources),
        documentsUsed: docContext.names,
      });
    } catch (error) {
      log(context, 'error', 'Comparison failed', { error: error.message });
      return serverError('Could not build the AT MOTORS comparison.');
    }
  },
});

app.http('lead-create', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'at-motors/leads',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const name = trimText(body.name, 120);
      const phone = trimText(body.phone, 60);
      const interest = trimText(body.interest, 500);
      if (!name || !phone) return badRequest('Name and phone are required.');

      const { leads } = await getContainers();
      const doc = {
        id: uuid(),
        brand: 'at-motors',
        name,
        phone,
        interest,
        created_at: new Date().toISOString(),
      };
      await leads.items.create(doc);
      log(context, 'info', 'Lead captured', { leadId: doc.id });
      return created({ lead: { id: doc.id, created_at: doc.created_at } });
    } catch (error) {
      log(context, 'error', 'Lead save failed', { error: error.message });
      return serverError('Could not save lead.');
    }
  },
});
