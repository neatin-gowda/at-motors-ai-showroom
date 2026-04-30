# AT MOTORS AI Showroom

A luxury automotive landing page and AI voice-agent showroom for AT MOTORS.

The project is ready to push into a new GitHub repo and deploy to Azure Static Web Apps with Azure Functions.

## Features

- React + Vite single-page luxury automotive landing page.
- Beige, orange, and navy brand palette.
- Animated Ferrari, Ford, and Maserati showroom sections.
- AI comparison screens.
- Browser voice input with speech recognition where supported.
- Browser voice output with synced listening, thinking, streaming, and speaking animation.
- Automatic inline insight popup after a voice or text ask.
- Two-vehicle comparison panel for comparison asks and action panels for booking, finance, daily-use, or other requests.
- Azure Functions backend.
- Cosmos DB document-context store.
- Azure OpenAI chat endpoint using uploaded showroom context.
- Optional lead-capture API endpoint.

## Project Structures

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
  "COSMOS_ENDPOINT": "https://YOUR-COSMOS-ACCOUNT.documents.azure.com:443/",
  "COSMOS_KEY": "YOUR_COSMOS_PRIMARY_KEY",
  "COSMOS_DB": "atmotors",
  "AZURE_OPENAI_ENDPOINT": "https://YOUR-AZURE-OPENAI-RESOURCE.openai.azure.com",
  "AZURE_OPENAI_API_KEY": "YOUR_AZURE_OPENAI_KEY",
  "AZURE_OPENAI_DEPLOYMENT": "gpt-4o-mini",
  "AZURE_OPENAI_API_VERSION": "2024-10-21"
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
COSMOS_ENDPOINT
COSMOS_KEY
COSMOS_DB
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_API_VERSION
```

Recommended values:

```text
COSMOS_DB=atmotors
AZURE_OPENAI_API_VERSION=2024-10-21
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

- Speech-to-text uses the browser `SpeechRecognition` / `webkitSpeechRecognition` API. It works best in Chrome and Edge over HTTPS or localhost.
- Text-to-speech uses the browser `speechSynthesis` API.
- After speech is recognized, the app automatically opens an inline AT MOTORS insight panel. Comparison asks show a two-vehicle panel; other asks show a tailored action/recommendation panel.
- If Azure OpenAI settings are missing, the backend returns a useful fallback response so the UI still works.
