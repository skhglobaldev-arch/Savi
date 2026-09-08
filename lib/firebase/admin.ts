import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { getStorage } from 'firebase-admin/storage';
import { assertSaviProductionConfiguration } from '../config/saviConfig';

const DEFAULT_DATA_CONNECT_SERVICE_ID = 'savi-257e0-service';
const DEFAULT_DATA_CONNECT_LOCATION = 'europe-west2';
const DEFAULT_DATA_CONNECTOR = 'savi';

function requiredEnvironment(name: 'FIREBASE_PROJECT_ID' | 'FIREBASE_STORAGE_BUCKET') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getSaviAdminApp() {
  assertSaviProductionConfiguration('firebase');
  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  if (existing) return existing;

  return initializeApp({
    credential: applicationDefault(),
    projectId: requiredEnvironment('FIREBASE_PROJECT_ID'),
    storageBucket: requiredEnvironment('FIREBASE_STORAGE_BUCKET')
  });
}

export function getSaviDataConnect() {
  return getDataConnect(
    {
      serviceId: process.env.FIREBASE_DATA_CONNECT_SERVICE_ID?.trim() || DEFAULT_DATA_CONNECT_SERVICE_ID,
      location: process.env.FIREBASE_DATA_CONNECT_LOCATION?.trim() || DEFAULT_DATA_CONNECT_LOCATION,
      connector: process.env.FIREBASE_DATA_CONNECT_CONNECTOR?.trim() || DEFAULT_DATA_CONNECTOR
    },
    getSaviAdminApp()
  );
}

export function getSaviPrivateBucket() {
  return getStorage(getSaviAdminApp()).bucket(requiredEnvironment('FIREBASE_STORAGE_BUCKET'));
}
