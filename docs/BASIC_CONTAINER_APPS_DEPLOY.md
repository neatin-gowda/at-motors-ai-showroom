# Basic Container Apps Backend Deploy

This path is designed for a user with **Contributor** role only. It avoids Key Vault RBAC and ACR pull role assignments for now.

Tradeoff: secrets are stored as Azure Container Apps secrets, and ACR admin is enabled. This is acceptable for a prototype/basic deployment, then should be upgraded with the Azure admin team to managed identity + Key Vault.

## 1. Login

```bash
az login
az account set --subscription "<SUBSCRIPTION_ID>"
```

## 2. Set Variables

```bash
PROJECT="/Users/nmahalingaiah/Documents/New project/at-motors-ai-showroom"
LOCATION="eastus2"
ENVIRONMENT="prod"
SWA_ORIGIN="https://YOUR_STATIC_WEB_APP.azurestaticapps.net"
AOAI_ENDPOINT="https://YOUR_AZURE_OPENAI_RESOURCE.openai.azure.com"
AOAI_KEY="YOUR_AZURE_OPENAI_KEY"
CHAT_DEPLOYMENT="gpt-4.1-mini"
REALTIME_DEPLOYMENT="YOUR_REALTIME_DEPLOYMENT_NAME"
WSS_SECRET="$(openssl rand -hex 32)"
```

`REALTIME_DEPLOYMENT` must be the exact Azure AI Foundry deployment name for the realtime model.
The Container App settings use `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_CHAT_API_VERSION`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`, and `AZURE_OPENAI_REALTIME_API_VERSION`.

## 3. Provision Basic Resources

```bash
cd "$PROJECT"

az deployment sub create \
  --location "$LOCATION" \
  --template-file infra/basic-containerapps-contributor.bicep \
  --parameters \
    location="$LOCATION" \
    environmentName="$ENVIRONMENT" \
    azureOpenAIEndpoint="$AOAI_ENDPOINT" \
    azureOpenAIKey="$AOAI_KEY" \
    azureOpenAIChatDeployment="$CHAT_DEPLOYMENT" \
    azureOpenAIRealtimeDeployment="$REALTIME_DEPLOYMENT" \
    wssSessionSecret="$WSS_SECRET" \
    corsOrigin="$SWA_ORIGIN"
```

Capture outputs:

```bash
RG="rg-at-motors-ai-prod"
ACR_NAME="$(az deployment sub show --name basic-containerapps-contributor --query properties.outputs.acrName.value -o tsv 2>/dev/null || echo acratmprod)"
```

If the output command does not return the ACR name, get it:

```bash
az acr list -g "$RG" --query "[0].name" -o tsv
```

## 4. Build And Push Backend Image

```bash
ACR_NAME="$(az acr list -g "$RG" --query "[0].name" -o tsv)"
ACR_LOGIN_SERVER="$(az acr show -g "$RG" -n "$ACR_NAME" --query loginServer -o tsv)"

az acr build \
  --registry "$ACR_NAME" \
  --image at-motors-api:latest \
  "$PROJECT/backend"
```

## 5. Update Container App To Your Image

```bash
az containerapp update \
  --name "ca-api-atm-prod" \
  --resource-group "$RG" \
  --image "$ACR_LOGIN_SERVER/at-motors-api:latest"
```

Get the backend URL:

```bash
API_URL="$(az containerapp show -g "$RG" -n ca-api-atm-prod --query properties.configuration.ingress.fqdn -o tsv)"
echo "https://$API_URL"
```

## 6. Smoke Test Backend

```bash
curl "https://$API_URL/healthz"
curl "https://$API_URL/readyz"

curl -X POST "https://$API_URL/api/at-motors/agent-turn" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"smoke","message":"Compare Ford Mustang and Maserati MC20"}'
```

Voice session:

```bash
curl -X POST "https://$API_URL/api/at-motors/voice-session" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"smoke"}'
```

## 7. Point Static Web App Frontend To Container API

In Azure Static Web Apps configuration, add or update:

```text
VITE_API_BASE=https://YOUR_CONTAINER_APP_FQDN/api
```

Then redeploy the frontend from GitHub Actions.

## 8. Browser Test

Test in this order:

1. Open Static Web App URL.
2. Car rail loads.
3. Chat: `Show me Ford Mustang`.
4. Chat: `Compare Ford Mustang and Maserati MC20`.
5. Click Talk to AI.
6. Allow microphone permission.
7. Confirm the browser network tab connects to `wss://YOUR_CONTAINER_APP/voice?...`.

## Upgrade Later With Azure Admin Team

Replace this basic path with:

- Key Vault secret refs
- System-assigned managed identity
- ACR Pull RBAC instead of ACR admin credentials
- WAF/custom domain
- private endpoints if required
