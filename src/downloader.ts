import type { ChainExport, DownloadOptions, DownloadAnchorOptions, AnchorBlocksExport } from './types.js';

/**
 * Download a chain from the SoWasIt API
 * @param chainId - The chain ID to download
 * @param options - Download options (API URL, API key, range, etc.)
 * @returns The complete chain export data
 */
export async function downloadChain(
  chainId: string,
  options: DownloadOptions = {}
): Promise<ChainExport> {
  const {
    apiUrl = 'https://api.sowasit.io',
    apiKey,
    from,
    to,
    includeAnchors = false,
  } = options;

  // Build URL with query parameters
  const url = new URL(`${apiUrl}/chains/${chainId}/export`);
  if (from !== undefined) {
    url.searchParams.set('from', from.toString());
  }
  if (to !== undefined) {
    url.searchParams.set('to', to.toString());
  }
  if (includeAnchors) {
    url.searchParams.set('includeAnchors', 'true');
  }

  // Determine auth header based on key format (optional for public chains)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    if (apiKey.startsWith('te_')) {
      headers['X-API-Key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to download chain: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const data = await response.json();
    return data as ChainExport;
  } catch (error) {
    if (error instanceof Error) {
      const errorMsg = [
        `Download failed: ${error.message}`,
        `URL: ${url.toString()}`,
        error.cause ? `Cause: ${error.cause}` : null,
      ].filter(Boolean).join('\n');
      throw new Error(errorMsg);
    }
    throw error;
  }
}

/**
 * Download anchor blocks from a chain filtered by content.chain_id
 * @param anchorChainId - The anchoring chain ID
 * @param options - Download options including contentChainId filter
 * @returns The filtered anchor blocks export data
 */
export async function downloadAnchorBlocks(
  anchorChainId: string,
  options: DownloadAnchorOptions
): Promise<AnchorBlocksExport> {
  const {
    apiUrl = 'https://api.sowasit.io',
    apiKey,
    contentChainId,
    contentTenantId,
  } = options;

  if (!contentChainId) {
    throw new Error('contentChainId is required to filter anchor blocks');
  }

  const url = new URL(`${apiUrl}/chains/${anchorChainId}/anchors`);
  url.searchParams.set('contentChainId', contentChainId);
  if (contentTenantId !== undefined) {
    url.searchParams.set('contentTenantId', String(contentTenantId));
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    if (apiKey.startsWith('te_')) {
      headers['X-API-Key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to download anchor blocks: ${response.status} ${response.statusText}\n${errorText}`
      );
    }

    const data = await response.json();
    return data as AnchorBlocksExport;
  } catch (error) {
    if (error instanceof Error) {
      const errorMsg = [
        `Anchor blocks download failed: ${error.message}`,
        `URL: ${url.toString()}`,
        error.cause ? `Cause: ${error.cause}` : null,
      ].filter(Boolean).join('\n');
      throw new Error(errorMsg);
    }
    throw error;
  }
}
