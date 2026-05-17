const { CosmosClient } = require('@azure/cosmos');

const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING;
const COSMOS_ENDPOINT = process.env.COSMOS_ENDPOINT;
const COSMOS_KEY = process.env.COSMOS_KEY;
const COSMOS_DB = process.env.COSMOS_DATABASE || process.env.COSMOS_DB || 'atmotors';

let client = null;
let containers = null;

async function getContainers() {
  if (containers) return containers;
  if (!COSMOS_CONNECTION_STRING && (!COSMOS_ENDPOINT || !COSMOS_KEY)) {
    throw new Error('Set COSMOS_CONNECTION_STRING and COSMOS_DATABASE, or set COSMOS_ENDPOINT and COSMOS_KEY in app settings.');
  }

  client = client || (COSMOS_CONNECTION_STRING
    ? new CosmosClient(COSMOS_CONNECTION_STRING)
    : new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY }));
  const { database } = await client.databases.createIfNotExists({ id: COSMOS_DB });

  const { container: documents } = await database.containers.createIfNotExists({
    id: 'documents',
    partitionKey: { paths: ['/brand'] },
  });

  const { container: leads } = await database.containers.createIfNotExists({
    id: 'leads',
    partitionKey: { paths: ['/brand'] },
  });

  containers = { documents, leads };
  return containers;
}

function ok(body) {
  return { status: 200, jsonBody: body };
}

function created(body) {
  return { status: 201, jsonBody: body };
}

function badRequest(message) {
  return { status: 400, jsonBody: { error: message } };
}

function serverError(message = 'Something went wrong') {
  return { status: 500, jsonBody: { error: message } };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function trimText(value, max = 16000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function log(context, level, message, data = {}) {
  const entry = {
    level,
    message,
    ...data,
    timestamp: new Date().toISOString(),
    invocationId: context.invocationId || 'unknown',
  };
  if (level === 'error') context.error(JSON.stringify(entry));
  else if (level === 'warn') context.warn(JSON.stringify(entry));
  else context.log(JSON.stringify(entry));
}

module.exports = {
  getContainers,
  ok,
  created,
  badRequest,
  serverError,
  uuid,
  trimText,
  log,
};
