const { z } = require('zod');

const CitationSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().or(z.string().min(1)),
  snippet: z.string().optional(),
});

const VehicleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  type: z.string().min(1),
  highlight: z.string().optional(),
  imageUrl: z.string().url().or(z.string().min(1)).optional(),
  specs: z.record(z.string(), z.string()).default({}),
});

const SpecRowSchema = z.object({
  label: z.string().min(1),
  values: z.array(z.string()).min(1),
  confidence: z.enum(['verified', 'estimated', 'fallback']).default('fallback'),
  citations: z.array(CitationSchema).default([]),
});

const ComparisonCardSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  recommendation: z.string().optional(),
  vehicles: z.array(VehicleSchema).min(1).max(2),
  rows: z.array(SpecRowSchema).min(1),
  sources: z.array(CitationSchema).default([]),
});

const LeadCaptureSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  preferredModel: z.string().optional(),
  preferredDate: z.string().optional(),
  notes: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
});

const InlineCardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('show_vehicle_profile'), comparison: ComparisonCardSchema }),
  z.object({ type: z.literal('show_comparison'), comparison: ComparisonCardSchema }),
  z.object({ type: z.literal('show_booking'), lead: LeadCaptureSchema }),
  z.object({ type: z.literal('show_finance'), title: z.string(), rows: z.array(SpecRowSchema), citations: z.array(CitationSchema).default([]) }),
  z.object({ type: z.literal('show_lifestyle'), title: z.string(), summary: z.string(), bullets: z.array(z.string()).default([]), citations: z.array(CitationSchema).default([]) }),
  z.object({ type: z.literal('session_end'), reason: z.string().default('farewell') }),
]);

const AgentTurnSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  channel: z.enum(['text', 'voice']).default('text'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']).or(z.string()),
    text: z.string(),
  })).default([]),
});

const AgentTurnResultSchema = z.object({
  graphVersion: z.string(),
  sessionId: z.string(),
  message: z.string(),
  intent: z.enum([
    'vehicle_profile',
    'vehicle_comparison',
    'sales',
    'finance',
    'booking',
    'brand',
    'lifestyle',
    'after_sales',
    'insurance',
    'general_automotive',
    'session_end',
    'out_of_scope',
  ]),
  vehicles: z.array(VehicleSchema).default([]),
  comparison: ComparisonCardSchema.nullable().optional(),
  uiEvents: z.array(InlineCardSchema).default([]),
  reply: z.string(),
  speech: z.string(),
  session: z.object({
    shouldEnd: z.boolean(),
    status: z.enum(['active', 'closed']),
  }),
  toolsUsed: z.array(z.object({
    name: z.string(),
  }).passthrough()).default([]),
  latencyMs: z.number().optional(),
}).passthrough();

module.exports = {
  AgentTurnResultSchema,
  AgentTurnSchema,
  CitationSchema,
  ComparisonCardSchema,
  InlineCardSchema,
  LeadCaptureSchema,
  SpecRowSchema,
  VehicleSchema,
};
