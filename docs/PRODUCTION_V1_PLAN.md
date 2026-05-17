# AT MOTORS Production V1 Plan

This migration keeps the working showroom experience alive while moving the platform toward a production multi-agent architecture.

## Target Shape

- SPA: React + Vite, luxury editorial UI, streamed inline glass cards.
- API: Node 20, Express, `ws`, hosted on Azure Container Apps.
- Voice: raw WebSocket broker to Azure OpenAI Realtime. Provider keys stay server-side.
- Agent orchestration: LangGraph.js supervisor pattern with specialist nodes.
- Tool contracts: Zod schemas in `backend/src-functions/agent/schemas.js`.
- Retrieval: Azure AI Search hybrid keyword/vector over catalog, brochures, dealer pages, finance/service docs.
- Data: Cosmos DB for leads, catalog overrides, conversation checkpoints, and 14-day trace metadata.
- Secrets: Key Vault, RBAC mode, managed identity, no plaintext secrets in GitHub or container env values.
- Observability: LangSmith for agent trace replay, Application Insights for API/WSS/container spans.

## Specialist Nodes

1. `supervisor`: classifies every text or voice turn and selects the next specialist.
2. `sales`: availability, showroom fit, next best action.
3. `comparator`: grounded side-by-side matrix, row-by-row streaming.
4. `booking`: guided lead capture and private viewing persistence.
5. `brand`: heritage, model positioning, design language.
6. `lifestyle`: family, commute, weekend, off-road, performance fit.
7. `after_sales`: service, warranty, ownership care.
8. `insurance`: insurance band guidance and handoff.

## Current Migration Slice

Already added:

- `backend/src-functions/agent/catalog.js`
  Catalog source of truth for the five prototype models.
- `backend/src-functions/agent/schemas.js`
  Zod contracts for vehicles, spec rows, comparison cards, booking cards, and agent turns.
- `backend/src-functions/agent/graph.js`
  First graph-shaped supervisor/router/resolver/comparison builder.
- `backend/src-server/server.js`
  Production API scaffold with health checks, agent turn endpoint, SSE streaming endpoint, signed voice sessions, and WSS broker.
- `backend/Dockerfile`
  Non-root production container image.
- `infra/main.bicep`
  Subscription-scope Azure Container Apps foundation.

## Next Slices

### Slice 2: Real LangGraph Nodes

- Replace the graph-shaped functions with actual LangGraph.js nodes.
- Add checkpoint persistence to Cosmos DB.
- Add trace IDs to every state transition.
- Emit agent events as typed SSE deltas.

### Slice 3: RAG and Catalog

- Expand catalog to 24 vehicles.
- Store three image angles per vehicle.
- Add Azure AI Search index:
  - `vehicles`
  - `brand_docs`
  - `service_docs`
  - `finance_docs`
- Add ingestion job for dealer URLs and internal documents.

### Slice 4: Frontend Streaming Cards

- Add TanStack Query for catalog/session data.
- Add Framer Motion for card mount transitions and voice orb halo.
- Render streamed `uiEvents` progressively:
  - comparison row deltas
  - profile cards
  - finance cards
  - booking cards

### Slice 5: Admin

- Corporate SSO.
- Leads export.
- Catalog editor.
- Conversation replay.
- Agent trace deep links.

## Local Production API

```bash
cd backend
npm install
npm run server
```

Health:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

Agent turn:

```bash
curl -X POST http://localhost:8080/api/at-motors/agent-turn \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo","message":"Compare Ford Mustang and Maserati MC20"}'
```

SSE stream:

```bash
curl -N -X POST http://localhost:8080/api/at-motors/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo","message":"Show me Ferrari 296 GTB"}'
```
