import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expected = {
  project: 'savi-production-607fd',
  bucket: 'savi-production-607fd.firebasestorage.app',
  service: 'savi-production-607fd-service',
  location: 'europe-west2',
  connector: 'savi',
  origin: 'https://savi.skh.global'
};

const forbiddenDevIdentifiers = [
  'savi-257e0',
  'savi-257e0-service',
  'savi-257e0-instance',
  'savi-257e0-database'
];

function read(path) {
  return readFileSync(path, 'utf8');
}

function fail(message) {
  console.error(`Production preflight failed: ${message}`);
  process.exitCode = 1;
}

function requireText(label, text, value) {
  if (!text.includes(value)) fail(`${label} is missing or incorrect.`);
}

function parseAppHostingEnv(text) {
  const entries = new Map();
  let variable = null;
  for (const line of text.split('\n')) {
    const variableMatch = line.match(/^  - variable: ([A-Z0-9_]+)\s*$/);
    if (variableMatch) {
      variable = variableMatch[1];
      continue;
    }
    const valueMatch = line.match(/^    (value|secret): (.*)$/);
    if (variable && valueMatch) entries.set(variable, { type: valueMatch[1], value: valueMatch[2] });
  }
  return entries;
}

const appHosting = read('apphosting.yaml');
const productionFirebase = read('firebase.production.json');
const productionDataConnect = read('dataconnect/production/dataconnect.yaml');
const aliases = JSON.parse(read('.firebaserc')).projects;
const env = parseAppHostingEnv(appHosting);

requireText('production Firebase project', appHosting, `value: ${expected.project}`);
requireText('production Storage bucket', appHosting, `value: ${expected.bucket}`);
requireText('production Data Connect service', appHosting, `value: ${expected.service}`);
requireText('production Data Connect location', appHosting, `value: ${expected.location}`);
requireText('production Data Connect connector', appHosting, `value: ${expected.connector}`);
requireText('production SAVI origin', appHosting, `value: ${expected.origin}`);
requireText('production Firebase config source', productionFirebase, '"source": "dataconnect/production"');
requireText('production Data Connect service', productionDataConnect, `serviceId: "${expected.service}"`);
requireText('production Data Connect location', productionDataConnect, `location: "${expected.location}"`);
requireText('production Data Connect database', productionDataConnect, 'database: "savi-production-607fd-database"');
requireText('production Cloud SQL instance', productionDataConnect, 'instanceId: "savi-production-607fd-instance"');
requireText('production connector source', productionDataConnect, 'connectorDirs: ["../savi"]');
if (!/^connectorId:\s*savi\s*$/m.test(read('dataconnect/savi/connector.yaml'))) fail('production connector ID is missing or incorrect.');

if (aliases.default !== 'savi-257e0' || aliases.dev !== 'savi-257e0' || aliases.prod !== expected.project) {
  fail('Firebase aliases do not preserve dev and production separation.');
}

const requiredValues = {
  FIREBASE_PROJECT_ID: expected.project,
  FIREBASE_STORAGE_BUCKET: expected.bucket,
  FIREBASE_DATA_CONNECT_SERVICE_ID: expected.service,
  FIREBASE_DATA_CONNECT_LOCATION: expected.location,
  FIREBASE_DATA_CONNECT_CONNECTOR: expected.connector,
  SAVI_APP_ORIGIN: expected.origin
};
for (const [name, value] of Object.entries(requiredValues)) {
  if (env.get(name)?.type !== 'value' || env.get(name)?.value !== value) fail(`${name} is not an exact production value.`);
}

for (const name of ['GOOGLE_CLIENT_SECRET', 'SAVI_AUTH_SECRET', 'GEMINI_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'ILOVEPDF_PUBLIC_KEY', 'ILOVEPDF_SECRET_KEY']) {
  if (env.get(name)?.type !== 'secret' || env.get(name)?.value !== name) fail(`${name} is not a name-only Secret Manager reference.`);
}

if (env.has('GOOGLE_APPLICATION_CREDENTIALS')) fail('GOOGLE_APPLICATION_CREDENTIALS must remain unset.');
if (/localhost|127\.0\.0\.1|sk_test_|price_test|prod_test/i.test(appHosting)) fail('development or Stripe test configuration appears in apphosting.yaml.');

for (const [label, text] of [
  ['apphosting.yaml', appHosting],
  ['firebase.production.json', productionFirebase],
  ['dataconnect/production/dataconnect.yaml', productionDataConnect]
]) {
  for (const identifier of forbiddenDevIdentifiers) {
    if (text.includes(identifier)) fail(`${identifier} appears in ${label}.`);
  }
}

try {
  execFileSync('git', ['check-ignore', '--quiet', '.env.local']);
} catch {
  fail('.env.local is not ignored.');
}

let trackedCredentials = '';
try {
  trackedCredentials = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
} catch {
  fail('Could not inspect tracked files.');
}
const credentialFiles = trackedCredentials.split('\n').filter((path) =>
  /(^|\/)(service-account|firebase-adminsdk|google-credentials|google-application-credentials|application_default_credentials).*\.json$/i.test(path)
);
if (credentialFiles.length) {
  fail('A service-account credential file is tracked.');
}

if (process.exitCode) process.exit();
console.log('Production preflight passed: production identifiers, secret references, aliases, and credential hygiene are valid.');
