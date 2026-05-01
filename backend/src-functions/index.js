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
Represent a premium showroom with Ferrari, Ford Mustang performance, Maserati, Deepal EV, and other luxury or performance vehicles when requested.
Use the supplied showroom context first. If context is missing, say so briefly and give a helpful next step.
Keep answers polished, concise, and sales-useful.
When comparison is requested, compare performance, comfort, ownership fit, budget tier, and appointment next step.
Always present pricing in UAE dirhams/AED only, never USD.
Use English only.
Never invent exact inventory availability.
Strictly refuse non-automotive topics and redirect the user back to cars, automotive ownership, finance, test drives, showroom bookings, or AT MOTORS.`;

const IMAGE_CATALOG = [
  {
    aliases: ['ferrari', 'sf90', 'roma', '296', 'purosangue'],
    imageUrl: 'https://images.unsplash.com/photo-1556516731-779d3492975b?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['ford', 'mustang', 'shelby', 'dark horse'],
    imageUrl: 'https://images.unsplash.com/photo-1561535743-c82c241502d5?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['maserati', 'mc20', 'granturismo', 'grecale', 'levante'],
    imageUrl: 'https://images.unsplash.com/photo-1756548843479-3783100b3447?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['deepal', 's07', 'sl03', 'changan'],
    imageUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['porsche', '911', 'taycan', 'cayenne', 'panamera'],
    imageUrl: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['tesla', 'model s', 'model 3', 'model x', 'model y'],
    imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['mercedes', 'benz', 'amg', 's-class', 'g-class', 'eqs'],
    imageUrl: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['bmw', 'm3', 'm4', 'm5', '7 series', 'i7'],
    imageUrl: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['audi', 'rs', 'r8', 'e-tron', 'q8'],
    imageUrl: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['lamborghini', 'huracan', 'urus', 'revuelto', 'aventador'],
    imageUrl: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['bentley', 'continental', 'bentayga', 'flying spur'],
    imageUrl: 'https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?auto=format&fit=crop&q=90&w=2200',
  },
  {
    aliases: ['rolls', 'royce', 'ghost', 'phantom', 'cullinan'],
    imageUrl: 'https://images.unsplash.com/photo-1563720360172-67b8f3dce741?auto=format&fit=crop&q=90&w=2200',
  },
];

const VEHICLE_CATALOG = [
  {
    aliases: ['ferrari', 'sf90', 'sf90 stradale'],
    name: 'Ferrari SF90 Stradale',
    brand: 'Ferrari',
    model: 'SF90 Stradale',
    type: 'Hybrid supercar',
    highlight: 'Maximum theatre, hybrid power, collector-grade showroom drama',
    specs: {
      Engine: '4.0L twin-turbo V8 plug-in hybrid, 986 hp',
      'Top speed': '340 km/h',
      '0-100 km/h': '2.5s approx.',
      'Estimated price': 'AED 2,000,500 new; AED 1.24M+ used approx.',
      'Best fit': 'Clients prioritising emotion, rarity, speed, and prestige',
    },
  },
  {
    aliases: ['ford', 'mustang', 'mustang gt', 'gt premium', 'dark horse'],
    name: 'Ford Mustang GT',
    brand: 'Ford',
    model: 'Mustang GT',
    type: 'Performance coupe',
    highlight: 'V8 character, accessible ownership, strong AED value',
    specs: {
      Engine: '5.0L V8, 486 hp approx.',
      'Top speed': '250-290 km/h approx.',
      '0-100 km/h': '4.3s approx.',
      'Estimated price': 'AED 255,000-279,195 approx.',
      'Best fit': 'Drivers wanting theatre and daily usability without supercar pricing',
    },
  },
  {
    aliases: ['maserati', 'granturismo', 'trofeo', 'mc20'],
    name: 'Maserati GranTurismo Trofeo',
    brand: 'Maserati',
    model: 'GranTurismo Trofeo',
    type: 'Luxury grand tourer',
    highlight: 'Italian elegance, long-distance comfort, refined pace',
    specs: {
      Engine: '3.0L twin-turbo V6, 542 hp approx.',
      'Top speed': '320 km/h approx.',
      '0-100 km/h': '3.5s approx.',
      'Estimated price': 'AED 820,000-979,000 approx.',
      'Best fit': 'Buyers who want luxury presence and touring comfort with speed',
    },
  },
  {
    aliases: ['deepal', 's07', 'deepal s07', 'changan'],
    name: 'Deepal S07',
    brand: 'Deepal',
    model: 'S07',
    type: 'Smart EV SUV',
    highlight: 'Technology-led cabin, quiet commuting, accessible premium EV feel',
    specs: {
      Engine: 'REEV or BEV powertrain, 214-234 hp approx.',
      'Top speed': '200 km/h approx.',
      '0-100 km/h': '6.7-7.9s approx.',
      'Estimated price': 'AED 119,900-149,900 approx.',
      'Best fit': 'Tech-first families wanting premium screens and efficient AED ownership',
    },
  },
  {
    aliases: ['porsche', '911', 'carrera gts', '911 gts'],
    name: 'Porsche 911 Carrera GTS',
    brand: 'Porsche',
    model: '911 Carrera GTS',
    type: 'T-Hybrid sports car',
    highlight: 'Precision handling, daily usability, benchmark sports-car engineering',
    specs: {
      Engine: '3.6L T-Hybrid flat-six, 541 PS',
      'Top speed': '312 km/h',
      '0-100 km/h': '3.0s',
      'Estimated price': 'AED 689,800 approx.',
      'Best fit': 'Drivers wanting the sharpest balance of comfort, speed, and control',
    },
  },
  {
    aliases: ['tesla', 'model s', 'model s plaid', 'plaid'],
    name: 'Tesla Model S Plaid',
    brand: 'Tesla',
    model: 'Model S Plaid',
    type: 'Electric performance sedan',
    highlight: 'Extreme EV acceleration, quiet cabin, digital-first ownership',
    specs: {
      Engine: 'Tri-motor electric AWD, 1,020 hp approx.',
      'Top speed': '322 km/h approx.',
      '0-100 km/h': '2.1s approx.',
      'Estimated price': 'AED 374,990 approx.',
      'Best fit': 'Clients wanting silent acceleration and everyday EV practicality',
    },
  },
];

function isAutomotiveTopic(message) {
  const text = String(message || '').toLowerCase();
  return [
    'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
    'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
    'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
    'price', 'finance', 'booking', 'viewing', 'test drive', 'compare',
    'ferrari', 'sf90', 'roma', '296', 'ford', 'mustang', 'maserati', 'mc20',
    'granturismo', 'trofeo', 'porsche', '911', 'taycan', 'lucid', 'mercedes',
    'bmw', 'audi', 'tesla', 'model s', 'lamborghini', 'bentley', 'rolls', 'deepal', 's07',
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
    .replace(/\b(compare|comparison|between|please|can you|show me|cars?|vehicles?|which|one|is|better|recommend|choose)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = text
    .split(/\s+(?:vs\.?|versus|and|or|with|against)\s+/i)
    .map((part) => part.replace(/[?.!,]/g, '').trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 2) : ['Vehicle A', 'Vehicle B'];
}

function imageForVehicle(vehicle, sources) {
  const name = `${vehicle.brand || ''} ${vehicle.model || vehicle.name || ''}`.toLowerCase();
  const catalogMatch = IMAGE_CATALOG.find((item) => item.aliases.some((alias) => name.includes(alias)));
  if (catalogMatch) return catalogMatch.imageUrl;

  const matched = sources.find((source) => {
    const haystack = `${source.name || ''} ${source.snippet || ''}`.toLowerCase();
    return source.thumbnailUrl && name.split(/\s+/).filter((word) => word.length > 2).some((word) => haystack.includes(word));
  });
  if (matched?.thumbnailUrl) return matched.thumbnailUrl;

  return 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&q=90&w=2200';
}

function catalogForVehicle(value) {
  const text = String(value || '').toLowerCase();
  return VEHICLE_CATALOG.find((item) => item.aliases.some((alias) => text.includes(alias))) || null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVehicle(vehicle, fallbackName, sources) {
  const rawName = trimText(vehicle?.name || fallbackName, 80) || fallbackName;
  const catalog = catalogForVehicle(`${rawName} ${vehicle?.brand || ''} ${vehicle?.model || ''}`);
  const brand = trimText(vehicle?.brand || catalog?.brand || rawName.split(' ')[0], 50);
  const model = trimText(vehicle?.model || catalog?.model || rawName.replace(new RegExp(`^${escapeRegExp(brand)}\\s*`, 'i'), ''), 80) || rawName;
  const type = trimText(vehicle?.type || vehicle?.segment || catalog?.type || 'Luxury vehicle', 60);
  const specs = {
    ...(catalog?.specs || {}),
    ...(vehicle?.specs && typeof vehicle.specs === 'object' ? vehicle.specs : {}),
  };
  const normalized = { name: rawName, brand, model, type, specs };
  return {
    ...normalized,
    name: catalog?.name || rawName,
    imageUrl: trimText(vehicle?.imageUrl || vehicle?.image || '', 600) || imageForVehicle(normalized, sources),
    highlight: trimText(vehicle?.highlight || vehicle?.bestFor || catalog?.highlight || 'Private showroom fit', 100),
  };
}

function fallbackComparison(message, sources = []) {
  const names = inferComparedVehicles(message);
  const vehicles = names.map((name) => normalizeVehicle({ name }, name, sources));
  return {
    title: `${vehicles[0].name} vs ${vehicles[1].name}`,
    summary: 'A curated AT MOTORS prototype dossier with AED market-oriented values and showroom-ready positioning.',
    vehicles,
    rows: ['Engine', 'Top speed', '0-100 km/h', 'Estimated price', 'Best fit'].map((label) => ({
      label,
      values: [
        trimText(vehicles[0].specs?.[label], 90) || 'Not verified',
        trimText(vehicles[1].specs?.[label], 90) || 'Not verified',
      ],
    })),
    recommendation: 'Use the table to qualify budget, driving style, and test-drive priority before booking a private viewing.',
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
  const normalizeRowValue = (label, value, index) => {
    const cleaned = trimText(value, 90);
    if (/price/i.test(label) && (!/AED/i.test(cleaned) || /USD|\$/i.test(cleaned))) {
      return trimText(normalizedVehicles[index].specs?.['Estimated price'], 90) || 'Not verified';
    }
    return cleaned || trimText(normalizedVehicles[index].specs?.[label], 90) || 'Not verified';
  };
  const rows = Array.isArray(raw?.rows) && raw.rows.length
    ? raw.rows.slice(0, 8).map((row) => ({
      label: trimText(row.label, 40),
      values: Array.isArray(row.values)
        ? row.values.slice(0, 2).map((value, index) => normalizeRowValue(trimText(row.label, 40), value, index))
        : [
          normalizeRowValue(trimText(row.label, 40), row.left || row.a || '', 0),
          normalizeRowValue(trimText(row.label, 40), row.right || row.b || '', 1),
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
    : 'No web search sources are configured. Use general automotive knowledge, keep values realistic, and mark approximate values with "approx." when needed.';
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nReturn only valid JSON for the UI. Do not wrap in markdown. Use concise, realistic automotive data suitable for a luxury comparison UI. All prices must be AED only. Mark uncertain specs as "approx." rather than pretending exact inventory data.` },
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

  let reply = null;
  try {
    reply = await callAzureOpenAI(messages, {
      temperature: 0.25,
      maxTokens: 900,
      responseFormat: { type: 'json_object' },
    });
  } catch {
    reply = await callAzureOpenAI(messages, {
      temperature: 0.25,
      maxTokens: 900,
    });
  }
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
        sources = await searchCarSources(`${message} UAE AED price official specs engine top speed 0-100`).catch((error) => {
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
      const sources = [];

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
