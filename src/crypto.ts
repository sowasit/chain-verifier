import { createHash } from 'crypto';
import stringify from 'json-stringify-deterministic';

/**
 * Compute double SHA-256 hash (SHA256(SHA256(data)))
 */
export function doubleSha256(data: string): string {
  const firstHash = createHash('sha256').update(data).digest();
  const secondHash = createHash('sha256').update(firstHash).digest('hex');
  return secondHash;
}

/**
 * Compute the hash of a block's data
 * This should match the server-side implementation exactly
 */
export function computeBlockHash(blockData: unknown): string {
  const serialized = stringify(blockData);
  console.log(`Serialized block data for hashing: ${serialized}`);
  return doubleSha256(serialized);
}

/**
 * Verify that a computed hash matches the expected hash
 */
export function verifyHash(computed: string, expected: string): boolean {
  return computed === expected;
}
