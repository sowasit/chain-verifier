import { computeBlockHash, verifyHash } from './crypto.js';
import type { 
  Block, 
  BlockVerificationResult, 
  ChainVerificationResult, 
  ChainExport,
  AnchorVerificationResult,
  AnchorBlockVerificationResult,
} from './types.js';

/**
 * Verify a single block's cryptographic integrity
 * @param block - The block to verify
 * @param expectedPrevHash - The expected prev_hash (from previous block or genesis)
 * @returns Verification result with detailed information
 */
export function verifyBlock(
  block: Block,
  expectedPrevHash: string | null = null
): BlockVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockId = block.data.id;
  const blockIndex = blockId - 1;

  // Check block structure
  if (!block.hash) {
    errors.push('Block hash is missing');
  }
  if (!block.data) {
    errors.push('Block data is missing');
  }
  if (block.data && typeof block.data.prev_hash !== 'string') {
    errors.push('Block prev_hash is missing or invalid');
  }

  // Verify prev_hash matches expected (chain continuity)
  if (expectedPrevHash !== null && block.data.prev_hash !== expectedPrevHash) {
    errors.push(
      `Chain continuity broken: expected prev_hash ${expectedPrevHash}, got ${block.data.prev_hash}`
    );
  }

  // Compute and verify block hash
  if (block.hash && block.data) {
    const abuseStatus = (block.metadata as any)?.['abuse-status'];
    const isReported = abuseStatus === 'signaled' || abuseStatus === 'confirmed';

    if (isReported) {
      warnings.push(
        `Block ${blockId} hash verification skipped: content unavailable for legal reasons (status: ${abuseStatus})`
      );
    } else {
      const computedHash = computeBlockHash(block.data);
      if (!verifyHash(computedHash, block.hash)) {
        errors.push(
          `Hash mismatch: computed ${computedHash}, expected ${block.hash}`
        );
      }
    }
  }



  return {
    valid: errors.length === 0,
    blockIndex,
    blockId,
    hash: block.hash,
    errors,
    warnings,
  };
}

/**
 * Verify an entire chain's cryptographic integrity
 * @param chainData - The chain export data containing all blocks
 * @returns Complete verification result with per-block details
 */
export function verifyChain(chainData: ChainExport): ChainVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockResults: BlockVerificationResult[] = [];

  if (!chainData.blocks || !Array.isArray(chainData.blocks)) {
    errors.push('Invalid chain data: blocks array is missing or invalid');
    return {
      valid: false,
      totalBlocks: 0,
      validBlocks: 0,
      invalidBlocks: 0,
      errors,
      warnings,
      blockResults: [],
      verifiedAt: new Date().toISOString(),
    };
  }

  const blocks = chainData.blocks;
  let validBlocks = 0;
  let invalidBlocks = 0;
  const unverifiedBlockIds: number[] = [];

  // Sort blocks by ID to ensure correct order
  const sortedBlocks = [...blocks].sort((a, b) => a.data.id - b.data.id);

  // Check for missing blocks
  for (let i = 0; i < sortedBlocks.length; i++) {
    const expectedId = i + 1;
    if (sortedBlocks[i].data.id !== expectedId) {
      warnings.push(
        `Block ID gap detected: expected ${expectedId}, found ${sortedBlocks[i].data.id}`
      );
    }
  }

  // Get chain hash for genesis block verification
  const chainHash = (chainData.metadata as any)?.chain_info?.hash;
  if (!chainHash) {
    warnings.push('Chain hash not found in metadata.chain_info.hash - cannot verify genesis block prev_hash');
  }

  // Verify each block
  let prevHash: string | null = null;
  for (let i = 0; i < sortedBlocks.length; i++) {
    const block = sortedBlocks[i];
    
    // For first block, expect chain hash as prev_hash
    if (i === 0 && chainHash) {
      prevHash = chainHash;
    }

    const result = verifyBlock(block, prevHash);
    blockResults.push(result);

    const abuseStatus = (block.metadata as any)?.['abuse-status'];
    const isReported = abuseStatus === 'signaled' || abuseStatus === 'confirmed';

    if (isReported) {
      unverifiedBlockIds.push(block.data.id);
      validBlocks++; // Supposer blocs signalés comme valides as per roadmap
    } else if (result.valid) {
      validBlocks++;
    } else {
      invalidBlocks++;
    }

    // Update prevHash for next iteration
    prevHash = block.hash;
  }

  if (unverifiedBlockIds.length > 0) {
    warnings.push(
      `${unverifiedBlockIds.length} blocks not verified (content unavailable for legal reasons)`
    );
  }

  // Check abuse status (only warn if defined: signaled, checked, or confirmed)
  const abuseStatus = (chainData.metadata as any)?.chain_info?.abuse_status;
  if (abuseStatus) {
    if (abuseStatus === 'signaled') {
      warnings.push('Chain has been signaled for abuse');
    } else if (abuseStatus === 'checked') {
      warnings.push('Chain is under review for abuse');
    } else if (abuseStatus === 'confirmed') {
      errors.push('Chain has confirmed abuse - use with extreme caution');
    }
  }

  // Add anchor verification if present
  let anchorVerification: AnchorVerificationResult | undefined;
  if (chainData.anchors && Array.isArray(chainData.anchors) && chainData.anchors.length > 0) {
    anchorVerification = verifyAnchors(sortedBlocks, chainData.anchors);
    
    if (!anchorVerification.valid) {
      errors.push(
        `Anchor verification failed: ${anchorVerification.invalidAnchors} invalid anchor(s)`
      );
    }
  }

  const allValid = invalidBlocks === 0 && errors.length === 0 && (!anchorVerification || anchorVerification.valid);

  return {
    valid: allValid,
    totalBlocks: sortedBlocks.length,
    validBlocks,
    invalidBlocks,
    unverifiedBlocks: unverifiedBlockIds.length,
    unverifiedBlockIds,
    errors,
    warnings,
    blockResults,
    anchorVerification,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Verify anchor blocks against the data chain
 * This ensures that no blocks have been deleted from the data chain by checking
 * that all anchored blocks exist and their hashes match
 * 
 * @param dataChainBlocks - Array of blocks from the data chain
 * @param anchorBlocks - Array of anchor blocks that reference the data chain
 * @returns Anchor verification result with detailed information
 */
export function verifyAnchors(
  dataChainBlocks: Block[],
  anchorBlocks: Block[]
): AnchorVerificationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const anchorResults: AnchorBlockVerificationResult[] = [];

  if (!anchorBlocks || anchorBlocks.length === 0) {
    warnings.push('No anchor blocks provided for verification');
    return {
      valid: true,
      totalAnchors: 0,
      validAnchors: 0,
      invalidAnchors: 0,
      errors,
      warnings,
      anchorResults: [],
    };
  }

  const blockMap = new Map<number, Block>();
  for (const block of dataChainBlocks) {
    blockMap.set(block.data.id, block);
  }

  let validAnchors = 0;
  let invalidAnchors = 0;

  for (const anchorBlock of anchorBlocks) {
    const anchorErrors: string[] = [];
    const anchorWarnings: string[] = [];

    const content = anchorBlock.data.content as any;
    if (!content) {
      anchorErrors.push(`Anchor block ${anchorBlock.data.id} has no content`);
      anchorResults.push({
        valid: false,
        anchorBlockId: anchorBlock.data.id,
        referencedBlockId: -1,
        expectedHash: '',
        errors: anchorErrors,
        warnings: anchorWarnings,
      });
      invalidAnchors++;
      continue;
    }

    const referencedBlockId = content.block_id;
    const expectedHash = content.block_hash;

    if (typeof referencedBlockId !== 'number') {
      anchorErrors.push(
        `Anchor block ${anchorBlock.data.id} has invalid block_id in content`
      );
    }

    if (typeof expectedHash !== 'string') {
      anchorErrors.push(
        `Anchor block ${anchorBlock.data.id} has invalid block_hash in content`
      );
    }

    if (anchorErrors.length > 0) {
      anchorResults.push({
        valid: false,
        anchorBlockId: anchorBlock.data.id,
        referencedBlockId: referencedBlockId || -1,
        expectedHash: expectedHash || '',
        errors: anchorErrors,
        warnings: anchorWarnings,
      });
      invalidAnchors++;
      continue;
    }

    const referencedBlock = blockMap.get(referencedBlockId);

    if (!referencedBlock) {
      anchorErrors.push(
        `Referenced block ${referencedBlockId} does not exist in the data chain (possibly deleted)`
      );
      anchorResults.push({
        valid: false,
        anchorBlockId: anchorBlock.data.id,
        referencedBlockId,
        expectedHash,
        errors: anchorErrors,
        warnings: anchorWarnings,
      });
      invalidAnchors++;
      continue;
    }

    const actualHash = referencedBlock.hash;
    if (actualHash !== expectedHash) {
      anchorErrors.push(
        `Hash mismatch for block ${referencedBlockId}: expected ${expectedHash}, got ${actualHash}`
      );
    }

    const isValid = anchorErrors.length === 0;
    if (isValid) {
      validAnchors++;
    } else {
      invalidAnchors++;
    }

    anchorResults.push({
      valid: isValid,
      anchorBlockId: anchorBlock.data.id,
      referencedBlockId,
      expectedHash,
      actualHash,
      errors: anchorErrors,
      warnings: anchorWarnings,
    });
  }

  if (invalidAnchors > 0) {
    errors.push(
      `${invalidAnchors} anchor block(s) failed verification - blocks may have been deleted or modified`
    );
  }

  const allValid = invalidAnchors === 0 && errors.length === 0;

  return {
    valid: allValid,
    totalAnchors: anchorBlocks.length,
    validAnchors,
    invalidAnchors,
    errors,
    warnings,
    anchorResults,
  };
}
