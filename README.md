# @sowasit/chain-verifier

**Cryptographic verification tool for SoWasIt blockchain chains**

Verify the cryptographic integrity of your SoWasIt blockchain chains offline, anytime, anywhere. No API key required for verification - complete transparency and independence.

## Features

- ✅ **Offline verification** - Verify chain integrity without any API calls
- 🔐 **Cryptographic proof** - Double SHA-256 hash verification
- 📊 **Progress tracking** - Visual progress bar for large chains
- 📝 **Detailed reporting** - Block-by-block verification results
- 🚀 **CLI tool** - Easy command-line interface
- 📦 **NPM package** - Programmatic API for Node.js applications
- 🌐 **Chain download** - Download chains directly from SoWasIt API

## Installation

```bash
npm install @sowasit/chain-verifier
```

Or use directly with npx (no installation needed):

```bash
npx @sowasit/chain-verifier verify my-chain.json
```

## CLI Usage

### Verify a chain

You can verify either a local file or download and verify a chain by ID:

```bash
# Verify a local file
npx @sowasit/chain-verifier verify chain.json

# Download and verify a chain by ID (public chain)
npx @sowasit/chain-verifier verify my-chain-id

# Download and verify a private chain (requires API key)
npx @sowasit/chain-verifier verify my-private-chain --api-key live_xxxxx
```

**Options:**
- `-o, --output <file>` - Save verification report to a file
- `-v, --verbose` - Show detailed block-by-block results
- `-k, --api-key <key>` - API key (or use `SOWASIT_API_KEY` env var). **Required only for private chains.**
- `-u, --api-url <url>` - API URL (default: `https://api.sowasit.io`)
- `--force-download` - Force re-download, ignoring local cache
- `--include-anchors` - Include anchor blocks for verification

**Examples:**

```bash
# Verify local file with detailed output
npx @sowasit/chain-verifier verify my-chain.json --verbose --output report.json

# Verify public chain (auto-downloads with caching)
npx @sowasit/chain-verifier verify public-chain-id

# Verify private chain with API key
npx @sowasit/chain-verifier verify private-chain-id --api-key live_xxxxx

# Force full re-download
npx @sowasit/chain-verifier verify my-chain-id --force-download

# Verify with anchors
npx @sowasit/chain-verifier verify my-chain-id --include-anchors
```

**Caching:** When verifying by chain ID, blocks are cached in `.sowasit-cache/<chainId>/` and only new blocks are downloaded on subsequent runs.

### Download a chain from API

```bash
# Download a public chain (no API key required)
npx @sowasit/chain-verifier download <chainId>

# Download a private chain (API key required)
npx @sowasit/chain-verifier download <chainId> --api-key YOUR_API_KEY
```

**Options:**
- `-k, --api-key <key>` - API key (or use `SOWASIT_API_KEY` env var). **Required only for private chains.**
- `-u, --api-url <url>` - API URL (default: `https://api.sowasit.io`)
- `-o, --output <file>` - Output file (default: `<chainId>.json`)
- `--from <index>` - Start block index (inclusive)
- `--to <index>` - End block index (inclusive)
- `--include-anchors` - Include anchor blocks

**Examples:**

```bash
# Download public chain
npx @sowasit/chain-verifier download my-public-chain-id

# Download private chain with API key
npx @sowasit/chain-verifier download my-chain-id --api-key live_xxxxx

# Download partial chain (blocks 100-200)
npx @sowasit/chain-verifier download my-chain-id --from 100 --to 200

# Use environment variable for API key
export SOWASIT_API_KEY=live_xxxxx
npx @sowasit/chain-verifier download my-private-chain-id
```

## Programmatic API

### Verify a chain

```typescript
import { verifyChain } from '@sowasit/chain-verifier';
import { readFile } from 'fs/promises';

// Load chain export
const chainData = JSON.parse(await readFile('chain.json', 'utf-8'));

// Verify
const result = verifyChain(chainData);

if (result.valid) {
  console.log(`✓ Chain verified: ${result.validBlocks} blocks are valid`);
} else {
  console.log(`✗ Verification failed: ${result.invalidBlocks} invalid blocks`);
  console.log('Errors:', result.errors);
}
```

### Verify a single block

```typescript
import { verifyBlock } from '@sowasit/chain-verifier';

const block = {
  hash: '146953e1a03e10d4ce3f50cbac45f7cee0580296afb4b478450cd110bb3f977b',
  data: {
    id: 1,
    chain_id: 'my-chain',
    prev_hash: 'abc123...', // Chain hash (from chain.hash)
    created_at: '2025-01-27T12:00:00.000Z',
    content: 'Genesis Block',
  },
};

const result = verifyBlock(block, 'abc123...'); // Expected prev_hash (chain hash)

console.log(result.valid ? '✓ Valid' : '✗ Invalid');
```

### Download a chain

```typescript
import { downloadChain } from '@sowasit/chain-verifier';
import { writeFile } from 'fs/promises';

// Download public chain (no API key required)
const publicChainData = await downloadChain('public-chain-id', {
  apiUrl: 'https://api.sowasit.io',
});

// Download private chain (API key required)
const privateChainData = await downloadChain('private-chain-id', {
  apiKey: 'live_xxxxx',
  apiUrl: 'https://api.sowasit.io',
  from: 0,
  to: 100,
});

await writeFile('chain.json', JSON.stringify(privateChainData, null, 2));
console.log(`Downloaded ${privateChainData.blocks.length} blocks`);
```

## Chain Export Format

The chain export JSON should follow this format:

```json
{
  "chain_id": "my-chain-id",
  "blocks": [
    {
      "hash": "146953e1a...",
      "data": {
        "id": 1,
        "chain_id": "my-chain-id",
        "prev_hash": "abc123...",
        "created_at": "2025-01-27T12:00:00.000Z",
        "content": "Block content"
      },
      "metadata": {
        "block_type": "data"
      }
    }
  ],
  "metadata": {
    "exported_at": "2025-01-27T12:00:00.000Z",
    "total_blocks": 1,
    "chain_info": {
      "id": "my-chain-id",
      "hash": "abc123...",
      "name": "My Chain",
      "visibility": "public"
    }
  }
}
```

## Verification Process

The verifier checks:

1. **Hash integrity** - Each block's hash is recomputed using double SHA-256 and compared with the stored hash
2. **Chain continuity** - Each block's `prev_hash` must match the previous block's `hash`
3. **Genesis block** - The first block must have a `prev_hash` matching the chain hash (from `chain.hash`)
4. **Block ordering** - Blocks are verified in sequential order by ID
5. **Anchor verification** - If anchor blocks are included, verifies all referenced blocks exist and hashes match
6. **Abuse status** - Warns if chain has been signaled/checked/confirmed for abuse (from `metadata.chain_info.abuse_status`)

## API Reference

### `verifyChain(chainData: ChainExport): ChainVerificationResult`

Verify an entire chain's cryptographic integrity.

**Returns:**
```typescript
{
  valid: boolean;              // Overall chain validity
  totalBlocks: number;         // Total number of blocks
  validBlocks: number;         // Number of valid blocks
  invalidBlocks: number;       // Number of invalid blocks
  errors: string[];            // Critical errors
  warnings: string[];          // Non-critical warnings
  blockResults: BlockVerificationResult[];  // Per-block results
  verifiedAt: string;          // ISO timestamp of verification
}
```

### `verifyBlock(block: Block, expectedPrevHash?: string): BlockVerificationResult`

Verify a single block's integrity.

**Returns:**
```typescript
{
  valid: boolean;        // Block validity
  blockIndex: number;    // Block index (0-based)
  blockId: number;       // Block ID (1-based)
  hash: string;          // Block hash
  errors: string[];      // Errors found
  warnings: string[];    // Warnings
}
```

### `downloadChain(chainId: string, options?: DownloadOptions): Promise<ChainExport>`

Download a chain from the SoWasIt API.

**Options:**
```typescript
{
  apiUrl?: string;           // API base URL
  apiKey?: string;           // API key or session token
  from?: number;             // Start block index
  to?: number;               // End block index
  includeAnchors?: boolean;  // Include anchor blocks
}
```

## Examples

### CI/CD Integration

```yaml
# .github/workflows/verify-chain.yml
name: Verify Chain Integrity

on:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Download chain
        run: |
          npx @sowasit/chain-verifier download ${{ secrets.CHAIN_ID }} \
            --api-key ${{ secrets.SOWASIT_API_KEY }} \
            --output chain.json

      - name: Verify chain
        run: |
          npx @sowasit/chain-verifier verify chain.json \
            --verbose \
            --output verification-report.json

      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: verification-report
          path: verification-report.json
```

### Backup Script

```javascript
// backup-and-verify.js
import { downloadChain, verifyChain } from '@sowasit/chain-verifier';
import { writeFile } from 'fs/promises';

async function backupAndVerify() {
  const chainId = process.env.CHAIN_ID;
  const apiKey = process.env.SOWASIT_API_KEY;

  // Download
  console.log('Downloading chain...');
  const chainData = await downloadChain(chainId, { apiKey });

  // Save
  const filename = `backup-${chainId}-${new Date().toISOString()}.json`;
  await writeFile(filename, JSON.stringify(chainData, null, 2));
  console.log(`Saved to ${filename}`);

  // Verify
  console.log('Verifying...');
  const result = verifyChain(chainData);

  if (!result.valid) {
    throw new Error(`Verification failed: ${result.errors.join(', ')}`);
  }

  console.log(`✓ Backup verified: ${result.validBlocks} blocks`);
}

backupAndVerify().catch(console.error);
```

## Why Verify?

- **Trust, but verify** - Don't just trust the platform, verify the cryptographic proof yourself
- **Compliance** - Meet audit requirements with independent verification
- **Backup validation** - Ensure your chain backups are intact and unmodified
- **Transparency** - Anyone can verify your chain's integrity, no special access needed
- **Independence** - Verification works offline, no dependency on SoWasIt infrastructure

## How It Works

SoWasIt uses **double SHA-256** hashing (the same algorithm as Bitcoin) to ensure immutability:

1. Each block's data is serialized deterministically (JSON canonicalization)
2. The data is hashed twice with SHA-256: `SHA256(SHA256(data))`
3. Each block contains the hash of the previous block (`prev_hash`)
4. Changing any bit in any block invalidates all subsequent blocks

This creates a cryptographic chain where:
- **Tampering is impossible** - Any modification breaks the chain
- **Verification is fast** - Only hashing, no complex cryptography
- **Proof is portable** - Just a JSON file, no special tools required

## License

MIT - See LICENSE file for details

## Links

- [SoWasIt Website](https://sowasit.io)
- [Documentation](https://docs.sowasit.io)
- [GitHub Repository](https://github.com/sowasit/chain-verifier)
- [Report Issues](https://github.com/sowasit/chain-verifier/issues)

## Support

- Email: support@sowasit.io
- Documentation: https://docs.sowasit.io
- Community: https://discord.gg/sowasit
