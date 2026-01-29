import { createReadStream, statSync, readFileSync } from 'fs';
import Parser from 'stream-json/Parser.js';
import StreamArray from 'stream-json/streamers/StreamArray.js';
import { verifyBlock } from './verifier.js';
import type { Block, ChainVerificationResult, BlockVerificationResult } from './types.js';

export interface StreamingStats {
  totalBlocks: number;
  validBlocks: number;
  invalidBlocks: number;
  bytesProcessed: number;
  errors: string[];
  warnings: string[];
}

export async function verifyChainStreaming(
  filePath: string,
  onProgress?: (stats: StreamingStats) => void
): Promise<ChainVerificationResult> {
  const stats: StreamingStats = {
    totalBlocks: 0,
    validBlocks: 0,
    invalidBlocks: 0,
    bytesProcessed: 0,
    errors: [],
    warnings: [],
  };

  const blockResults: BlockVerificationResult[] = [];
  let prevHash: string | null = null;
  let chainHash: string | null = null;

  const fileStats = statSync(filePath);
  const totalBytes = fileStats.size;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const firstPart = content.substring(0, Math.min(50000, content.length));
    const metadataMatch = firstPart.match(/"metadata"\s*:\s*({[^}]*"chain_info"[^}]*})/);
    
    if (metadataMatch) {
      try {
        const metadataStr = metadataMatch[0].replace(/"metadata"\s*:\s*/, '');
        const metadata = JSON.parse(metadataStr);
        chainHash = metadata?.chain_info?.hash;
        
        if (!chainHash) {
          stats.warnings.push('Chain hash not found in metadata.chain_info.hash - cannot verify genesis block prev_hash');
        }

        const abuseStatus = metadata?.chain_info?.abuse_status;
        if (abuseStatus) {
          if (abuseStatus === 'signaled') {
            stats.warnings.push('Chain has been signaled for abuse');
          } else if (abuseStatus === 'checked') {
            stats.warnings.push('Chain is under review for abuse');
          } else if (abuseStatus === 'confirmed') {
            stats.errors.push('Chain has confirmed abuse - use with extreme caution');
          }
        }
      } catch (e) {
      }
    }

    const stream = createReadStream(filePath);
    
    stream.on('data', (chunk: string | Buffer) => {
      stats.bytesProcessed += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      if (onProgress) {
        onProgress(stats);
      }
    });

    const pipeline = stream
      .pipe(new Parser())
      .pipe(new StreamArray());

    for await (const { value: block } of pipeline) {
      if (stats.totalBlocks === 0 && chainHash) {
        prevHash = chainHash;
      }

      const result = verifyBlock(block as Block, prevHash);
      blockResults.push(result);

      if (result.valid) {
        stats.validBlocks++;
      } else {
        stats.invalidBlocks++;
      }

      prevHash = (block as Block).hash;
      stats.totalBlocks++;

      if (onProgress && stats.totalBlocks % 100 === 0) {
        onProgress(stats);
      }
    }

    if (onProgress) {
      onProgress(stats);
    }

    const allValid = stats.invalidBlocks === 0 && stats.errors.length === 0;

    return {
      valid: allValid,
      totalBlocks: stats.totalBlocks,
      validBlocks: stats.validBlocks,
      invalidBlocks: stats.invalidBlocks,
      errors: stats.errors,
      warnings: stats.warnings,
      blockResults,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Streaming verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function shouldUseStreaming(filePath: string, thresholdMB: number = 50): boolean {
  try {
    const stats = statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    return sizeMB > thresholdMB;
  } catch {
    return false;
  }
}
