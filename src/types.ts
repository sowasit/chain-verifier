export interface CreatedBy {
  type: 'user' | 'api_key' | 'system';
  id: string | null;
}

export interface BlockData {
  id: number;
  chain_id: string;
  prev_hash: string;
  created_at: string | Date;
  created_by: CreatedBy;
  content?: unknown;
  [key: string]: unknown;
}

export interface Block {
  hash: string;
  data: BlockData;
  metadata?: Record<string, unknown>;
}

export interface ChainExport {
  chain_id: string;
  blocks: Block[];
  metadata?: {
    exported_at?: string;
    total_blocks?: number;
    chain_info?: {
      hash: string;
      abuse_status?: 'signaled' | 'checked' | 'confirmed';
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  anchors?: Block[];
}

export interface BlockVerificationResult {
  valid: boolean;
  blockIndex: number;
  blockId: number;
  hash: string;
  errors: string[];
  warnings: string[];
}

export interface ChainVerificationResult {
  valid: boolean;
  totalBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
  unverifiedBlocks?: number;
  unverifiedBlockIds?: number[];
  errors: string[];
  warnings: string[];
  blockResults: BlockVerificationResult[];
  anchorVerification?: AnchorVerificationResult;
  verifiedAt: string;
}

export interface AnchorVerificationResult {
  valid: boolean;
  totalAnchors: number;
  validAnchors: number;
  invalidAnchors: number;
  errors: string[];
  warnings: string[];
  anchorResults: AnchorBlockVerificationResult[];
}

export interface AnchorBlockVerificationResult {
  valid: boolean;
  anchorBlockId: number;
  referencedBlockId: number;
  expectedHash: string;
  actualHash?: string;
  errors: string[];
  warnings: string[];
}

export interface DownloadOptions {
  apiUrl?: string;
  apiKey?: string;
  from?: number;
  to?: number;
  includeAnchors?: boolean;
}

export interface DownloadAnchorOptions {
  apiUrl?: string;
  apiKey?: string;
  contentChainId: string;
  contentTenantId?: string | number;
}

export interface AnchorBlocksExport {
  chain_id: string;
  content_chain_id: string;
  content_tenant_id?: string;
  exported_at: string;
  blocks: Block[];
  total_blocks: number;
}
