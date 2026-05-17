const { SOURCE_REGISTRY, VEHICLE_CATALOG } = require('./catalog');
const { AgentTurnResultSchema } = require('./schemas');

const AUTOMOTIVE_TERMS = [
  'car', 'cars', 'auto', 'automotive', 'vehicle', 'vehicles', 'motor', 'motors',
  'engine', 'speed', 'drive', 'driving', 'luxury', 'supercar', 'sedan', 'suv',
  'coupe', 'convertible', 'horsepower', 'hp', 'torque', '0-100', '0 to 100',
  'price', 'finance', 'booking', 'viewing', 'test drive', 'compare', 'range',
  'battery', 'hybrid', 'ev', 'electric', 'mustang', 'ferrari', 'ford', 'maserati',
  'mc20', 'jaguar', 'land rover', 'range rover', 'defender', 'f-pace', 'f pace',
];

const FAREWELL_PATTERNS = [
  /\b(that'?s all|that is all|all i had|i am done|i'm done|we are done)\b/i,
  /\b(thank you|thanks|thank you very much|bye|goodbye|see you|see ya|take care|stop listening|end session)\b/i,
  /\b(no more questions|nothing else|disconnect|close the session|catch you later|talk later)\b/i,
];

const COMPARISON_PATTERN = /\b(compare|comparison|versus|vs\.?|against|between|table|tabular|difference|better|recommend|choose|which one)\b/i;
const PROFILE_PATTERN = /\b(show|check|open|view|display|details|profile|price|specs|specification|tell me about|what about|look|looks|looking|see|overview|features|interior|exterior)\b/i;

function cleanText(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isAutomotiveTopic(message) {
  const text = String(message || '').toLowerCase();
  return AUTOMOTIVE_TERMS.some((term) => text.includes(term));
}

function isFarewell(message) {
  return FAREWELL_PATTERNS.some((pattern) => pattern.test(message));
}

function tokenize(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function catalogVehicleToUi(vehicle) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    brand: vehicle.brand,
    model: vehicle.model,
    type: vehicle.type,
    highlight: vehicle.highlight,
    imageUrl: vehicle.imageUrl,
    specs: vehicle.specs,
  };
}

function resolveVehicles(message) {
  const text = String(message || '').toLowerCase();
  const tokens = tokenize(text);
  const scored = VEHICLE_CATALOG.map((vehicle) => {
    const aliasScore = vehicle.aliases.reduce((score, alias) => (
      text.includes(alias) ? score + Math.max(5, alias.length) : score
    ), 0);
    const tokenScore = tokens.reduce((score, token) => {
      const haystack = `${vehicle.brand} ${vehicle.model} ${vehicle.name}`.toLowerCase();
      return haystack.includes(token) ? score + 1 : score;
    }, 0);
    return { vehicle, score: aliasScore + tokenScore };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const unique = [];
  const seen = new Set();
  scored.forEach(({ vehicle }) => {
    if (seen.has(vehicle.id)) return;
    seen.add(vehicle.id);
    unique.push(catalogVehicleToUi(vehicle));
  });
  return unique.slice(0, 2);
}

function resolveReplacementVehicles(message, currentComparison) {
  const currentVehicles = Array.isArray(currentComparison?.vehicles) ? currentComparison.vehicles.slice(0, 2) : [];
  if (currentVehicles.length < 2) return null;

  const text = String(message || '').toLowerCase();
  const match = text.match(/\b(?:replace|change|switch|remove)\s+(.+?)\s+(?:with|to|and make it|make it)\s+(.+?)(?:[?.!]|$)/i);
  if (!match) return null;

  const oldText = match[1] || '';
  const newText = match[2] || '';
  const oldVehicle = resolveVehicles(oldText)[0];
  const newVehicle = resolveVehicles(newText)[0];
  if (!newVehicle) return null;

  const oldId = oldVehicle?.id;
  const oldLower = oldText.toLowerCase();
  const replaceIndex = currentVehicles.findIndex((vehicle) => (
    (oldId && vehicle.id === oldId) ||
    oldLower.includes(String(vehicle.brand || '').toLowerCase()) ||
    oldLower.includes(String(vehicle.model || '').toLowerCase())
  ));
  if (replaceIndex < 0) return null;

  return currentVehicles.map((vehicle, index) => (index === replaceIndex ? newVehicle : vehicle));
}

function classifyIntent(message, vehicles) {
  if (isFarewell(message)) return 'session_end';
  if (!isAutomotiveTopic(message)) return 'out_of_scope';
  if (COMPARISON_PATTERN.test(message) || vehicles.length > 1) return 'vehicle_comparison';
  if (PROFILE_PATTERN.test(message) || vehicles.length === 1) return 'vehicle_profile';
  if (/\b(insurance|insured|premium|comprehensive|third party)\b/i.test(message)) return 'insurance';
  if (/\b(service|maintenance|warranty|after sales|aftersales|repair|interval)\b/i.test(message)) return 'after_sales';
  if (/\b(heritage|history|brand story|legacy|racing|motorsport)\b/i.test(message)) return 'brand';
  if (/\b(lifestyle|family|daily|weekend|off road|city|commute|comfort|practical)\b/i.test(message)) return 'lifestyle';
  if (/\b(finance|payment|loan|emi|installment|lease)\b/i.test(message)) return 'finance';
  if (/\b(book|booking|appointment|viewing|test drive|visit|call me)\b/i.test(message)) return 'booking';
  if (/\b(buy|sell|purchase|available|availability|inventory|offer)\b/i.test(message)) return 'sales';
  return 'general_automotive';
}

function buildRows(vehicles) {
  const labels = [
    'Engine',
    'Power',
    'Drivetrain',
    'Top speed',
    '0-100 km/h',
    'Estimated price',
    'Character',
    'Best fit',
  ];

  return labels.map((label) => ({
    label,
    values: vehicles.map((vehicle) => cleanText(vehicle.specs?.[label], 120) || 'To be confirmed with showroom'),
    confidence: 'fallback',
    citations: vehicles.map((vehicle) => {
      const source = SOURCE_REGISTRY.find((item) => item.brand === vehicle.brand);
      return source ? { name: source.brand, url: source.url } : null;
    }).filter(Boolean),
  }));
}

function buildComparison(vehicles, intent) {
  const resolved = vehicles.length ? vehicles : [catalogVehicleToUi(VEHICLE_CATALOG[0])];
  const isSingle = intent === 'vehicle_profile' || resolved.length === 1;
  const active = isSingle ? [resolved[0]] : resolved.slice(0, 2);
  const title = isSingle ? `${active[0].name} profile` : `${active[0].name} vs ${active[1].name}`;
  const summary = isSingle
    ? `${active[0].name} is presented as a focused UAE showroom profile with performance, price, and buyer-fit signals.`
    : `${active[0].name} and ${active[1].name} are compared across performance, price, character, and ownership fit.`;
  const recommendation = isSingle
    ? 'Use this profile to qualify budget, driving style, and whether to move into a private viewing or comparison.'
    : 'Use the dossier to qualify budget, driving style, and test-drive priority before booking a private viewing.';

  const result = {
    title,
    summary,
    recommendation,
    vehicles: active,
    rows: buildRows(active),
    sources: active.map((vehicle) => {
      const source = SOURCE_REGISTRY.find((item) => item.brand === vehicle.brand);
      return source ? { name: source.brand, url: source.url } : null;
    }).filter(Boolean),
  };
  return result;
}

function buildUiEvents(state) {
  if (state.intent === 'session_end') {
    return [{ type: 'session_end', reason: 'farewell' }];
  }
  if (state.intent === 'vehicle_profile') {
    return [{ type: 'show_vehicle_profile', comparison: state.comparison }];
  }
  if (state.intent === 'vehicle_comparison') {
    return [{ type: 'show_comparison', comparison: state.comparison }];
  }
  return [];
}

function fallbackReply(state) {
  const first = state.vehicles[0];
  const second = state.vehicles[1];
  if (state.intent === 'session_end') {
    return 'Session closed. I will stop listening now.';
  }
  if (state.intent === 'out_of_scope') {
    return 'I can help with AT MOTORS vehicles, comparisons, pricing, ownership, finance, test drives, and showroom bookings.';
  }
  if (state.intent === 'vehicle_profile' && first) {
    return `${first.name} is ready on the showroom view. I have highlighted the key performance, price, and buyer-fit details for UAE customers.`;
  }
  if (state.intent === 'vehicle_comparison' && first && second) {
    return `I have prepared a side-by-side dossier for ${first.name} and ${second.name}, focused on performance, price, character, and ownership fit.`;
  }
  if (state.intent === 'finance') {
    return 'I can qualify budget and finance fit once we shortlist the model, trim, expected usage, and preferred monthly range.';
  }
  if (state.intent === 'booking') {
    return 'I can help prepare a private viewing. Share the model, preferred date, and contact details to move forward.';
  }
  return 'I can help compare vehicles, explain ownership fit, qualify budget, and prepare the next showroom step.';
}

async function composeReplyWithModel(state, generateReply) {
  if (!generateReply || ['session_end', 'out_of_scope'].includes(state.intent)) return fallbackReply(state);
  const prompt = [
    {
      role: 'system',
      content: 'You are AT MOTORS luxury automotive concierge. Use only the provided agent state. Keep the reply concise, premium, automotive-only, English-only, and use AED for pricing. Do not mention tools, agents, routing, Azure, LangGraph, JSON, or implementation.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        intent: state.intent,
        vehicles: state.vehicles.map((vehicle) => ({
          name: vehicle.name,
          type: vehicle.type,
          highlight: vehicle.highlight,
          specs: vehicle.specs,
        })),
        tableRows: state.comparison?.rows || [],
      }),
    },
  ];

  try {
    const reply = await generateReply(prompt, { temperature: 0.28, maxTokens: 260 });
    return cleanText(reply, 900) || fallbackReply(state);
  } catch {
    return fallbackReply(state);
  }
}

async function runAgentTurn(input, options = {}) {
  const message = cleanText(input.message);
  const sessionId = cleanText(input.sessionId, 120) || `session-${Date.now()}`;
  const graphStartedAt = Date.now();
  const toolsUsed = [];

  const replacementVehicles = resolveReplacementVehicles(message, input.currentComparison);
  const vehicles = replacementVehicles || resolveVehicles(message);
  toolsUsed.push({ name: 'vehicle_resolver', resultCount: vehicles.length });

  const intent = replacementVehicles ? 'vehicle_comparison' : classifyIntent(message, vehicles);
  toolsUsed.push({ name: 'intent_router', intent });

  const comparison = ['vehicle_profile', 'vehicle_comparison'].includes(intent)
    ? buildComparison(vehicles, intent)
    : null;
  if (comparison) toolsUsed.push({ name: 'comparison_builder', rowCount: comparison.rows.length });

  const state = {
    graphVersion: 'at-motors-agent-graph-v1',
    sessionId,
    message,
    intent,
    vehicles,
    comparison,
    session: {
      shouldEnd: intent === 'session_end',
      status: intent === 'session_end' ? 'closed' : 'active',
    },
    toolsUsed,
  };

  const uiEvents = buildUiEvents(state);
  const reply = await composeReplyWithModel(state, options.generateReply);

  return AgentTurnResultSchema.parse({
    ...state,
    uiEvents,
    reply,
    speech: reply,
    latencyMs: Date.now() - graphStartedAt,
  });
}

module.exports = {
  buildComparison,
  classifyIntent,
  isAutomotiveTopic,
  isFarewell,
  resolveVehicles,
  runAgentTurn,
};
