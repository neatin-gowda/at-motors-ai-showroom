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
Represent a premium showroom with Ferrari, Ford, Lincoln, Jaguar, Land Rover, Maserati, VinFast, Deepal, Ford Trucks, Tesla, Mercedes-Benz, Volvo, Toyota, and other automotive brands when requested.
Use the supplied showroom context first. If context is missing, say so briefly and give a helpful next step.
Keep answers polished, concise, and sales-useful.
When comparison is requested, compare performance, comfort, ownership fit, budget tier, and appointment next step.
Always present pricing in UAE dirhams/AED only, never USD.
Use English only.
Never invent exact inventory availability.
Strictly refuse non-automotive topics and redirect the user back to cars, automotive ownership, finance, test drives, showroom bookings, or AT MOTORS.`;

const SOURCE_REGISTRY = [
  {
    brand: 'Ford',
    aliases: ['ford', 'mustang', 'bronco', 'explorer', 'expedition', 'everest', 'territory', 'taurus', 'ranger', 'f-150'],
    url: 'https://www.altayermotors.com/ford/',
  },
  {
    brand: 'Lincoln',
    aliases: ['lincoln', 'navigator', 'aviator', 'corsair', 'nautilus'],
    url: 'https://www.altayermotors.com/lincoln/',
  },
  {
    brand: 'Jaguar',
    aliases: ['jaguar', 'f-pace', 'f pace', 'i-pace', 'i pace', 'f-type', 'f type'],
    url: 'https://www.altayermotors.com/jaguar/',
  },
  {
    brand: 'Land Rover',
    aliases: ['land rover', 'range rover', 'defender', 'discovery', 'velar', 'evoque'],
    url: 'https://www.altayermotors.com/land-rover/',
  },
  {
    brand: 'Maserati',
    aliases: ['maserati', 'mc20', 'granturismo', 'grecale', 'levante', 'ghibli', 'quattroporte'],
    url: 'https://www.altayermotors.com/maserati/',
  },
  {
    brand: 'Ferrari',
    aliases: ['ferrari', '849', 'testarossa', 'amalfi', '296', 'gtb', 'gts', '12cilindri', 'purosangue'],
    url: 'https://www.altayermotors.com/ferrari/',
  },
  {
    brand: 'VinFast',
    aliases: ['vinfast', 'vf 6', 'vf6', 'vf 7', 'vf7', 'vf 8', 'vf8', 'vf 9', 'vf9'],
    url: 'https://www.altayermotors.com/vinfast/',
  },
  {
    brand: 'Deepal',
    aliases: ['deepal', 's07', 'sl03', 'g318', 'changan'],
    url: 'https://www.altayermotors.com/deepal/',
  },
  {
    brand: 'Ford Trucks',
    aliases: ['ford trucks', 'ford truck', 'f-max', 'f max', 'cargo'],
    url: 'https://www.altayermotors.com/ford-trucks/',
  },
  {
    brand: 'Tesla',
    aliases: ['tesla', 'model s', 'model 3', 'model x', 'model y', 'cybertruck'],
    url: 'https://www.tesla.com/en_ae',
  },
  {
    brand: 'Mercedes-Benz',
    aliases: ['mercedes', 'benz', 'mercedes-benz', 'amg', 's-class', 'g-class', 'eqs', 'gle', 'glc'],
    url: 'https://www.mercedes-benz-mena.com/dubai/en/passengercars.html',
  },
  {
    brand: 'Volvo',
    aliases: ['volvo', 'xc40', 'xc60', 'xc90', 'ex30', 'ex40', 'ex90'],
    url: 'https://www.volvocars.com/ae/',
  },
  {
    brand: 'Toyota',
    aliases: ['toyota', 'land cruiser', 'prado', 'camry', 'rav4', 'supra', 'hilux', 'fortuner'],
    url: 'https://www.toyota.ae/',
  },
];

function configuredSourceRegistry() {
  const extra = extractJsonObject(process.env.AT_MOTORS_SOURCE_URLS);
  if (!Array.isArray(extra)) return SOURCE_REGISTRY;
  return [
    ...SOURCE_REGISTRY,
    ...extra.map((item) => ({
      brand: trimText(item.brand, 80),
      url: trimText(item.url, 500),
      aliases: Array.isArray(item.aliases) ? item.aliases.map((alias) => trimText(alias, 60)).filter(Boolean) : [],
    })).filter((item) => item.brand && item.url),
  ];
}

function isAutomotiveTopic(message) {
  const text = String(message || '').toLowerCase();
  return [
    'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
    'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
    'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
    'price', 'finance', 'booking', 'viewing', 'test drive', 'compare',
    'ferrari', 'sf90', 'roma', '296', 'ford', 'mustang', 'bronco', 'lincoln',
    'jaguar', 'land rover', 'range rover', 'defender', 'maserati', 'mc20',
    'granturismo', 'trofeo', 'vinfast', 'deepal', 's07', 'ford trucks',
    'porsche', '911', 'taycan', 'lucid', 'mercedes', 'benz', 'volvo', 'toyota',
    'bmw', 'audi', 'tesla', 'model s', 'lamborghini', 'bentley', 'rolls',
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return '';
  }
}

function htmlToText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function extractPageTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return trimText(decodeHtml(match?.[1] || ''), 140);
}

function extractImages(html, baseUrl) {
  const images = [];
  const seen = new Set();
  const text = String(html || '');
  const regexes = [
    /<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi,
    /<source[^>]+srcset=["']([^"']+)["'][^>]*>/gi,
    /"image"\s*:\s*"([^"]+)"/gi,
    /background-image:\s*url\(["']?([^"')]+)["']?\)/gi,
  ];
  regexes.forEach((regex) => {
    let match = regex.exec(text);
    while (match) {
      const raw = String(match[1] || '').split(',')[0].trim().split(/\s+/)[0];
      const url = absoluteUrl(raw, baseUrl);
      const lower = url.toLowerCase();
      if (
        url &&
        !seen.has(url) &&
        !lower.includes('logo') &&
        !lower.includes('icon') &&
        !lower.endsWith('.svg') &&
        /\.(jpg|jpeg|png|webp)(\?|$)/i.test(lower)
      ) {
        seen.add(url);
        images.push({ url, alt: trimText(decodeHtml(match[2] || ''), 120) });
      }
      match = regex.exec(text);
    }
  });
  return images.slice(0, 18);
}

function extractLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match = regex.exec(String(html || ''));
  while (match) {
    const url = absoluteUrl(match[1], baseUrl);
    const text = trimText(htmlToText(match[2]), 140);
    if (url && text && !seen.has(url)) {
      seen.add(url);
      links.push({ url, text });
    }
    match = regex.exec(String(html || ''));
  }
  return links.slice(0, 80);
}

function tokensFromRequest(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !['compare', 'versus', 'against', 'between', 'price', 'spec', 'specs', 'table', 'with', 'and', 'the'].includes(token));
}

function sourceCandidatesForMessage(message) {
  const text = String(message || '').toLowerCase();
  const registry = configuredSourceRegistry();
  const matches = registry.filter((source) => source.aliases.some((alias) => text.includes(alias.toLowerCase())));
  return (matches.length ? matches : registry.slice(0, 6)).slice(0, 6);
}

async function fetchTextUrl(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 AT-MOTORS-AI/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBundleForSource(source, tokens = []) {
  const html = await fetchTextUrl(source.url);
  if (!html) return null;
  const links = extractLinks(html, source.url);
  const detailLinks = links
    .filter((link) => {
      const haystack = `${link.text} ${link.url}`.toLowerCase();
      return tokens.some((token) => haystack.includes(token)) || source.aliases.some((alias) => haystack.includes(alias.toLowerCase()));
    })
    .slice(0, 3);

  const detailPages = (await Promise.all(detailLinks.map(async (link) => {
    const detailHtml = await fetchTextUrl(link.url, 5000);
    if (!detailHtml) return null;
    return {
        name: `${source.brand}: ${link.text}`,
        url: link.url,
        title: extractPageTitle(detailHtml) || link.text,
        text: trimText(htmlToText(detailHtml), 4500),
        images: extractImages(detailHtml, link.url),
    };
  }))).filter(Boolean);

  return {
    name: source.brand,
    url: source.url,
    title: extractPageTitle(html) || source.brand,
    text: trimText(htmlToText(html), 4500),
    images: extractImages(html, source.url),
    links: links.slice(0, 18),
    details: detailPages,
  };
}

async function fetchSourceBundles(message) {
  const tokens = tokensFromRequest(message);
  const sources = sourceCandidatesForMessage(message);
  return (await Promise.all(sources.map((source) => fetchBundleForSource(source, tokens)))).filter(Boolean);
}

function flattenSourceBundles(bundles) {
  return bundles.flatMap((bundle) => [
    {
      name: bundle.title || bundle.name,
      url: bundle.url,
      snippet: trimText(bundle.text, 420),
      thumbnailUrl: bundle.images?.[0]?.url || '',
    },
    ...(bundle.details || []).map((detail) => ({
      name: detail.title || detail.name,
      url: detail.url,
      snippet: trimText(detail.text, 420),
      thumbnailUrl: detail.images?.[0]?.url || '',
    })),
  ]).filter((item) => item.url);
}

function modelsFromBundle(bundle) {
  const images = [...(bundle.images || []), ...(bundle.details || []).flatMap((detail) => detail.images || [])];
  const links = [
    ...(bundle.links || []),
    ...(bundle.details || []).map((detail) => ({ text: detail.title || detail.name, url: detail.url })),
  ];
  const modelWords = ['mustang', 'bronco', 'explorer', 'expedition', 'ranger', 'f-150', 'navigator', 'aviator', 'range rover', 'defender', 'discovery', 'mc20', 'granturismo', 'grecale', 'ferrari', '296', 'purosangue', 'amalfi', 'vinfast', 'deepal', 's07', 'vf', 'tesla', 'model', 'mercedes', 'volvo', 'toyota'];
  const picked = [];
  const seen = new Set();

  links.forEach((link, index) => {
    const text = trimText(link.text, 80);
    const lower = text.toLowerCase();
    if (!text || seen.has(lower) || !modelWords.some((word) => lower.includes(word))) return;
    seen.add(lower);
    picked.push({
      brand: bundle.name,
      model: text,
      type: 'Public source model',
      detail: `Open ${bundle.name} source details for ${text}.`,
      imageUrl: images[index % Math.max(images.length, 1)]?.url || images[0]?.url || '',
      comparePrompt: `Compare ${text} with another ${bundle.name} or UAE automotive model in AED`,
      sourceUrl: link.url || bundle.url,
    });
  });

  if (!picked.length) {
    picked.push({
      brand: bundle.name,
      model: trimText(bundle.title || bundle.name, 80),
      type: 'Brand source',
      detail: `Browse live ${bundle.name} source information.`,
      imageUrl: images[0]?.url || '',
      comparePrompt: `Compare ${bundle.name} models in AED`,
      sourceUrl: bundle.url,
    });
  }

  return picked.slice(0, 4);
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
  const matched = sources.find((source) => {
    const haystack = `${source.name || ''} ${source.snippet || ''}`.toLowerCase();
    return source.thumbnailUrl && name.split(/\s+/).filter((word) => word.length > 2).some((word) => haystack.includes(word));
  });
  if (matched?.thumbnailUrl) return matched.thumbnailUrl;

  const anyImage = sources.find((source) => source.thumbnailUrl);
  return anyImage?.thumbnailUrl || '';
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
    highlight: trimText(vehicle?.highlight || vehicle?.bestFor || 'Source-led showroom fit', 100),
  };
}

function fallbackComparison(message, sources = []) {
  const names = inferComparedVehicles(message);
  const vehicles = names.map((name) => normalizeVehicle({ name }, name, sources));
  return {
    title: `${vehicles[0].name} vs ${vehicles[1].name}`,
    summary: 'A source-led AT MOTORS dossier. Publicly listed values are shown when available; missing details are marked clearly.',
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

async function buildStructuredComparison(message, context, sourceBundles) {
  const sourceText = sourceBundles.length
    ? sourceBundles.map((source, index) => {
      const details = (source.details || []).map((detail, detailIndex) => (
        `[${index + 1}.${detailIndex + 1}] ${detail.title}\n${detail.url}\n${trimText(detail.text, 1800)}\nImages: ${(detail.images || []).slice(0, 5).map((image) => image.url).join(', ')}`
      )).join('\n\n');
      return `[${index + 1}] ${source.title}\n${source.url}\n${trimText(source.text, 1800)}\nImages: ${(source.images || []).slice(0, 8).map((image) => image.url).join(', ')}\nModel links: ${(source.links || []).slice(0, 10).map((link) => `${link.text} ${link.url}`).join(' | ')}\n\n${details}`;
    }).join('\n\n')
    : 'No public source pages could be fetched. Return a useful structure but mark unavailable facts as "Not listed on source".';
  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\nReturn only valid JSON for the UI. Do not wrap in markdown. Use only the supplied source pages for prices, specifications, model names, and image URLs. All prices must be AED only. If the source does not list a price or spec, write "Not listed on source" rather than guessing.` },
    { role: 'system', content: context.text ? `Showroom context:\n${context.text}` : 'No uploaded showroom context is available yet.' },
    { role: 'system', content: `Live source context:\n${sourceText}` },
    {
      role: 'user',
      content: `Create a luxury automotive comparison from this request: "${message}".
Return JSON with this exact shape:
{
  "title": "Vehicle A vs Vehicle B",
  "summary": "one polished source-led sentence for the showroom UI",
  "recommendation": "one concise buying guidance sentence based only on listed facts",
  "vehicles": [
    {"name":"", "brand":"", "model":"", "type":"", "highlight":"", "imageUrl":"", "specs":{"Engine":"","Top speed":"","0-100 km/h":"","Estimated price":"","Best fit":""}},
    {"name":"", "brand":"", "model":"", "type":"", "highlight":"", "imageUrl":"", "specs":{"Engine":"","Top speed":"","0-100 km/h":"","Estimated price":"","Best fit":""}}
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

app.http('showroom-models', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'at-motors/showroom-models',
  handler: async (request, context) => {
    try {
      const sources = configuredSourceRegistry().slice(0, 12);
      const bundles = (await Promise.all(sources.map((source) => (
        fetchBundleForSource(source, source.aliases.slice(0, 8).map((alias) => alias.toLowerCase()))
      )))).filter(Boolean).slice(0, 8);
      const vehicles = bundles.flatMap(modelsFromBundle).filter((item) => item.imageUrl).slice(0, 12);
      return ok({ vehicles, sources: bundles.map((bundle) => ({ name: bundle.name, url: bundle.url })) });
    } catch (error) {
      log(context, 'warn', 'Showroom models failed', { error: error.message });
      return ok({ vehicles: [], sources: [] });
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
        const sourceBundles = await fetchSourceBundles(message).catch((error) => {
          log(context, 'warn', 'Public source fetch failed', { error: error.message });
          return [];
        });
        sources = flattenSourceBundles(sourceBundles);
        if (!sources.length) {
          sources = await searchCarSources(`${message} UAE AED price official specs engine top speed 0-100`).catch((error) => {
            log(context, 'warn', 'Bing grounding failed', { error: error.message });
            return [];
          });
        }
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
      const sourceBundles = await fetchSourceBundles(message).catch((error) => {
        log(context, 'warn', 'Public source fetch failed', { error: error.message });
        return [];
      });
      const sources = flattenSourceBundles(sourceBundles);

      let raw = null;
      try {
        raw = await buildStructuredComparison(message, docContext, sourceBundles);
      } catch (error) {
        log(context, 'warn', 'Structured comparison failed', { error: error.message });
      }

      return ok({
        comparison: normalizeComparison(raw, message, sources),
        documentsUsed: docContext.names,
        sourceCount: sources.length,
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
