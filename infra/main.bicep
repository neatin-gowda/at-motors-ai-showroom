targetScope = 'subscription'

@description('Azure region for the production stack.')
param location string = 'eastus2'

@description('Short environment name.')
param environmentName string = 'prod'

@description('Container image for the API/WSS broker.')
param apiImage string

@description('Azure OpenAI endpoint, stored as a Container Apps env value. Keys stay in Key Vault.')
param azureOpenAIEndpoint string

@description('Azure OpenAI chat deployment name.')
param azureOpenAIChatDeployment string = 'gpt-4o'

@description('Azure OpenAI realtime deployment name.')
param azureOpenAIRealtimeDeployment string = 'gpt-4o-realtime-preview'

var prefix = 'atm-${environmentName}'
var rgName = 'rg-at-motors-ai-${environmentName}'
var logName = 'log-${prefix}'
var appInsightsName = 'appi-${prefix}'
var acrName = replace('acr${prefix}', '-', '')
var acaEnvName = 'cae-${prefix}'
var apiName = 'ca-api-${prefix}'
var kvName = take(replace('kv-${prefix}', '-', ''), 24)
var cosmosName = 'cosmos-at-motors-ai-${environmentName}'
var searchName = 'srch-at-motors-ai-${environmentName}'

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

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  scope: rg
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
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
    adminUserEnabled: false
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  scope: rg
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    sku: {
      family: 'A'
      name: 'standard'
    }
  }
}

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosName
  location: location
  scope: rg
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
  }
}

resource search 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: searchName
  location: location
  scope: rg
  sku: {
    name: 'basic'
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
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
  identity: {
    type: 'SystemAssigned'
  }
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
          identity: 'system'
        }
      ]
      secrets: [
        {
          name: 'azure-openai-key'
          keyVaultUrl: 'https://${keyVault.name}.vault.azure.net/secrets/azure-openai-key'
          identity: 'system'
        }
        {
          name: 'wss-session-secret'
          keyVaultUrl: 'https://${keyVault.name}.vault.azure.net/secrets/wss-session-secret'
          identity: 'system'
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
            { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAIEndpoint }
            { name: 'AZURE_OPENAI_CHAT_DEPLOYMENT', value: azureOpenAIChatDeployment }
            { name: 'AZURE_OPENAI_CHAT_API_VERSION', value: '2024-10-21' }
            { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: azureOpenAIRealtimeDeployment }
            { name: 'AZURE_OPENAI_REALTIME_API_VERSION', value: '2025-04-01-preview' }
            { name: 'AZURE_OPENAI_API_KEY', secretRef: 'azure-openai-key' }
            { name: 'WSS_SESSION_SECRET', secretRef: 'wss-session-secret' }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
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
        maxReplicas: 5
        rules: [
          {
            name: 'http-scale'
            http: {
              metadata: {
                concurrentRequests: '40'
              }
            }
          }
        ]
      }
    }
  }
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, api.id, 'AcrPull')
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource keyVaultSecretsUserRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, api.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: api.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output resourceGroupName string = rg.name
output containerRegistryLoginServer string = acr.properties.loginServer
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output keyVaultName string = keyVault.name
output cosmosAccountName string = cosmos.name
output searchServiceName string = search.name
