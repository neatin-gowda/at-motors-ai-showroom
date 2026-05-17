# AT MOTORS AI Showroom

A luxury automotive landing page and AI voice-agent showroom for AT MOTORS.

The project is ready to push into a new GitHub repo and deploy to Azure Static Web Apps with Azure Functions.

## Features

- React + Vite single-page luxury automotive landing page.
- Beige, orange, and navy brand palette.
- Animated Ferrari, Ford, and Maserati showroom sections.
- AI comparison screens.
- GPT Realtime audio-in/audio-out with synced listening, thinking, streaming, and speaking animation.
- Automatic inline insight popup after a voice or text ask.
- Two-vehicle comparison panel for comparison asks and action panels for booking, finance, daily-use, or other requests.
- Premium single-screen cockpit UI with a voice-reactive generative orb.
- GPT chat model generates structured comparison JSON for the UI.
- Optional Bing grounding for live citations in chat answers.
- Azure Functions backend.
- Cosmos DB document-context store.
- Azure OpenAI chat endpoint using uploaded showroom context.
- Optional lead-capture API endpoint.

## Project Structure

```text
at-motors-ai-showroom/
  .github/workflows/azure-static-web-apps.yml
  backend/
    host.json
    local.settings.json.example
    package.json
    src-functions/
      index.js
      shared.js
  src/
    main.jsx
    styles.css
  index.html
  package.json
  staticwebapp.config.json
  vite.config.js
```

## Local Setup

Install dependencies:

```bash
npm install
cd backend
npm install
cd ..
```

Create local backend settings:

```bash
cp backend/local.settings.json.example backend/local.settings.json
```

Update `backend/local.settings.json` with:

```json
{
  "COSMOS_CONNECTION_STRING": "AccountEndpoint=https://YOUR-COSMOS-ACCOUNT.documents.azure.com:443/;AccountKey=YOUR_COSMOS_PRIMARY_KEY;",
  "COSMOS_DATABASE": "atmotors",
  "AZURE_OPENAI_ENDPOINT": "https://YOUR-AZURE-OPENAI-RESOURCE.openai.azure.com",
  "AZURE_OPENAI_API_KEY": "YOUR_AZURE_OPENAI_KEY",
  "AZURE_OPENAI_CHAT_DEPLOYMENT": "gpt-4.1-mini",
  "AZURE_OPENAI_CHAT_API_VERSION": "2024-10-21",
  "AZURE_OPENAI_REALTIME_DEPLOYMENT": "gpt-realtime-mini",
  "AZURE_OPENAI_REALTIME_API_VERSION": "2025-04-01-preview",
  "BING_SEARCH_ENDPOINT": "https://api.bing.microsoft.com/v7.0/search",
  "BING_SEARCH_KEY": "YOUR_BING_SEARCH_KEY"
}
```

Run backend:

```bash
cd backend
npm start
```

Run frontend in another terminal:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

For local frontend to call local Functions, create `.env.local` in the repo root:

```bash
VITE_API_BASE=http://localhost:7071/api
```

## Backend API

### Health

```http
GET /api/health
```

### Save Document Context

```http
POST /api/at-motors/documents
Content-Type: application/json

{
  "name": "Inventory April",
  "content": "Paste inventory, pricing, FAQ, policy, or showroom process text here."
}
```

### List Document Context

```http
GET /api/at-motors/documents
```

### AI Chat

```http
POST /api/at-motors/chat
Content-Type: application/json

{
  "message": "Compare Ferrari and Maserati for weekend drives",
  "history": []
}
```

### Lead Capture

```http
POST /api/at-motors/leads
Content-Type: application/json

{
  "name": "Customer Name",
  "phone": "+971500000000",
  "interest": "Ferrari private viewing"
}
```

## Deploy To A New GitHub Repo

Create a new GitHub repo, then from this folder:

```bash
git init
git add .
git commit -m "Initial AT MOTORS AI showroom"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/YOUR_REPO.git
git push -u origin main
```

## Azure Deployment

1. Create an Azure Cosmos DB account.
2. Create an Azure OpenAI resource and deploy a chat model.
3. Create an Azure Static Web App.
4. Choose GitHub as the deployment source and select your new repo.
5. Use these build settings:

```text
App location: /
API location: backend
Output location: dist
```

6. In GitHub repo secrets, add:

```text
AZURE_STATIC_WEB_APPS_API_TOKEN
```

You can copy this token from the Azure Static Web App deployment token.

7. In Azure Static Web Apps configuration/app settings, add:

```text
COSMOS_CONNECTION_STRING
COSMOS_DATABASE
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_CHAT_DEPLOYMENT
AZURE_OPENAI_CHAT_API_VERSION
AZURE_OPENAI_REALTIME_DEPLOYMENT
AZURE_OPENAI_REALTIME_API_VERSION
BING_SEARCH_ENDPOINT
BING_SEARCH_KEY
```

Recommended values:

```text
COSMOS_DATABASE=atmotors
AZURE_OPENAI_CHAT_API_VERSION=2024-10-21
AZURE_OPENAI_REALTIME_DEPLOYMENT=gpt-realtime-mini
AZURE_OPENAI_REALTIME_API_VERSION=2025-04-01-preview
BING_SEARCH_ENDPOINT=https://api.bing.microsoft.com/v7.0/search
```

8. Push to `main`. GitHub Actions will deploy the frontend and backend.

## Using Document Context

After deployment:

1. Open the Static Web App URL.
2. Scroll to the AI Voice Agent section.
3. Paste or upload `.txt`, `.md`, `.csv`, or `.json` context.
4. Click `Save As LLM Context`.
5. Ask the AI agent questions. The backend injects the latest saved documents into the Azure OpenAI prompt.

## Notes

- Live voice uses Azure GPT Realtime WebSocket audio-in/audio-out when `AZURE_REALTIME_*` variables are configured.
- The browser streams microphone PCM16 audio to the realtime model and plays returned PCM16 audio chunks directly.
- Browser `speechSynthesis` is kept only as a fallback for non-realtime chat errors.
- The orb motion uses Web Audio frequency analysis from the microphone and maps the signal into CSS variable `--voice-level`.
- Comparison asks open a horizontal side-by-side stage from structured GPT chat JSON and curated vehicle imagery.
- If Azure OpenAI settings are missing, the backend returns a useful fallback response so the UI still works.

## Realtime Voice Upgrade Notes

The app calls `/api/at-motors/realtime-session` to get a WebSocket URL for Azure GPT Realtime. When the visitor clicks `Talk to AI`, the browser streams microphone audio as base64 PCM16 chunks with `input_audio_buffer.append`. Server VAD commits the user turn and creates the response automatically. The app listens for text transcript deltas and PCM16 audio deltas, renders the text live, and plays the model voice as it streams.

Realtime setup:

- Deploy a realtime model such as `gpt-realtime`, `gpt-realtime-mini`, `gpt-4o-realtime-preview`, or `gpt-4o-mini-realtime-preview` in a supported region.
- `gpt-4.1-mini` is not a realtime speech model.
- Set `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, and `AZURE_OPENAI_REALTIME_API_VERSION` in backend app settings.
- Server VAD and barge-in are enabled with `turn_detection.create_response` and `turn_detection.interrupt_response`.

Current implementation:

- `gpt-4.1-mini` remains the normal chat fallback.
- The realtime deployment is used first through WebSocket when `AZURE_OPENAI_REALTIME_*` variables are configured.
- Typed asks also use realtime audio output first, then fall back to the chat endpoint if realtime is unavailable.
