targetScope = 'subscription'

@description('Azure region for the basic contributor-friendly backend stack.')
param location string = 'eastus2'

@description('Short environment name.')
param environmentName string = 'prod'

@description('Container image. Use the public hello-world image for first infra deploy, then update after ACR build.')
param apiImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Azure OpenAI endpoint.')
param azureOpenAIEndpoint string

@description('Azure OpenAI chat deployment name.')
param azureOpenAIChatDeployment string = 'gpt-4.1-mini'

@description('Azure OpenAI realtime deployment name.')
param azureOpenAIRealtimeDeployment string

@secure()
@description('Azure OpenAI key. Stored as a Container Apps secret for basic setup.')
param azureOpenAIKey string

@secure()
@description('Random signing secret for WSS sessions. Use openssl rand -hex 32.')
param wssSessionSecret string

@description('Allowed frontend origin for CORS, for example https://your-static-web-app.azurestaticapps.net')
param corsOrigin string

var prefix = 'atm-${environmentName}'
var rgName = 'rg-at-motors-ai-${environmentName}'
var logName = 'log-${prefix}'
var acrName = replace('acr${prefix}', '-', '')
var acaEnvName = 'cae-${prefix}'
var apiName = 'ca-api-${prefix}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: rgName
  location: location
}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logName
  location: location
  scope: rg
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  scope: rg
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

resource acaEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: acaEnvName
  location: location
  scope: rg
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: apiName
  location: location
  scope: rg
  properties: {
    managedEnvironmentId: acaEnv.id
    configuration: {
      activeRevisionsMode: 'Multiple'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        stickySessions: {
          affinity: 'sticky'
        }
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.name
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'azure-openai-key'
          value: azureOpenAIKey
        }
        {
          name: 'wss-session-secret'
          value: wssSessionSecret
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: [
            { name: 'PORT', value: '8080' }
            { name: 'CORS_ORIGIN', value: corsOrigin }
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
            { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT', value: azureOpenAIChatDeployment }
            { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: azureOpenAIRealtimeDeployment }
            { name: 'AZURE_OPENAI_REALTIME_API_VERSION', value: '2025-04-01-preview' }
            { name: 'AZURE_OPENAI_CHAT_API_VERSION', value: '2024-10-21' }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-key' }
            { name: 'WSS_SESSION_SECRET', secretRef: 'wss-session-secret' }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 15
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 20
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output resourceGroupName string = rg.name
output acrName string = acr.name
output acrLoginServer string = acr.properties.loginServer
output apiName string = api.name
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
