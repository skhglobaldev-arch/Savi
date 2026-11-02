import type { SaviUser } from '../auth/session';

type AssetRow = { id: string; userId: string; status: string; filename: string; toolId: string; mediaType: string; mimeType: string; createdAt: string };
export type LibraryAsset = Omit<AssetRow, 'userId' | 'status'> & { url: string };
export type AssetLibraryQuery = <T>(operation: string, variables: Record<string, string | number>) => Promise<T>;

export async function listOwnedLibraryAssets(user: SaviUser, offset: number, query: AssetLibraryQuery) {
  const identity = await query<{ saviUsers?: { id: string; status: string }[] }>('FindSaviUserByProvider', { provider: 'google', providerSubject: user.id });
  const owner = identity.saviUsers?.[0];
  if (!owner || !['active', 'deletion_requested'].includes(owner.status)) return null;
  const page = await query<{ assets?: { id: string; status: string }[] }>('ListAccountAssets', { userId: owner.id, offset });
  const rows = (page.assets || []).slice(0, 20);
  const assets: LibraryAsset[] = [];
  // Reuse the deployed owner-scoped operations; storage paths never reach clients.
  for (const row of rows) {
    if (row.status !== 'available') continue;
    const detail = await query<{ assets?: AssetRow[] }>('GetAssetForUser', { userId: owner.id, assetId: row.id });
    const asset = detail.assets?.[0];
    if (!asset || asset.userId !== owner.id || asset.status !== 'available') continue;
    assets.push({ id: asset.id, toolId: asset.toolId, filename: asset.filename, mediaType: asset.mediaType, mimeType: asset.mimeType, createdAt: asset.createdAt, url: `/api/assets/${asset.id}` });
  }
  return { assets: assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), nextOffset: (page.assets || []).length > rows.length || rows.length === 20 ? offset + rows.length : null };
}
