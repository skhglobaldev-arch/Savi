import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { saviApiOrigin } from '@/src/auth/config';

export function ownedAssetUrl(assetId: string) {
  if (!/^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(assetId)) throw new Error('Invalid private asset.');
  return `${saviApiOrigin}/api/assets/${assetId}`;
}

export async function downloadPrivateFile(token: string, assetId: string, filename: string) {
  const directory = new Directory(Paths.cache, `savi-private-${Crypto.randomUUID()}`);
  directory.create();
  const destination = new File(directory, filename.replace(/[^a-z0-9._-]/gi, '-').slice(0, 160) || 'savi-output');
  try {
    return await File.downloadFileAsync(ownedAssetUrl(assetId), destination, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    directory.delete();
    throw error;
  }
}

export function removePrivateDownload(file: File) {
  try { file.parentDirectory.delete(); } catch { /* A previous cleanup may have already removed it. */ }
}

export async function sharePrivateFile(token: string, assetId: string, filename: string, mimeType?: string) {
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  const file = await downloadPrivateFile(token, assetId, filename);
  try { await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename }); }
  finally { removePrivateDownload(file); }
}
