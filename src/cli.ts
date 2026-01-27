#!/usr/bin/env node

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { verifyChain } from './verifier.js';
import { downloadChain } from './downloader.js';
import type { ChainExport } from './types.js';

const program = new Command();

program
  .name('sowasit-verify')
  .description('Cryptographic verification tool for SoWasIt blockchain chains')
  .version('0.1.0');

// Verify command
program
  .command('verify')
  .description('Verify the cryptographic integrity of a chain export file or download and verify a chain by ID')
  .argument('<chainIdOrFile>', 'Chain ID to download or path to chain export JSON file')
  .option('-o, --output <file>', 'Output verification report to a file')
  .option('-v, --verbose', 'Show detailed block-by-block results')
  .option('-k, --api-key <key>', 'API key for downloading chains (or use SOWASIT_API_KEY env var). Required only for private chains.')
  .option('-u, --api-url <url>', 'API URL (default: https://api.sowasit.com)')
  .option('--force-download', 'Force re-download of entire chain, ignoring cache')
  .option('--include-anchors', 'Include anchor blocks when downloading')
  .action(async (chainIdOrFile: string, options: { output?: string; verbose?: boolean; apiKey?: string; apiUrl?: string; forceDownload?: boolean; includeAnchors?: boolean }) => {
    try {
      console.log(chalk.cyan('🔍 SoWasIt Chain Verifier\n'));

      let chainData: ChainExport;
      const isFile = chainIdOrFile.endsWith('.json') || existsSync(chainIdOrFile);

      if (isFile) {
        // Read from file
        console.log(chalk.gray(`Reading chain from: ${chainIdOrFile}`));
        const fileContent = await readFile(chainIdOrFile, 'utf-8');
        chainData = JSON.parse(fileContent);
      } else {
        // Download chain
        const chainId = chainIdOrFile;
        const apiKey = options.apiKey || process.env.SOWASIT_API_KEY;
        const apiUrl = options.apiUrl || 'https://api.sowasit.com';
        const cacheDir = join(process.cwd(), '.sowasit-cache', chainId);
        const cacheFile = join(cacheDir, 'chain.json');

        console.log(chalk.gray(`Chain ID: ${chainId}`));
        
        if (!options.forceDownload && existsSync(cacheFile)) {
          // Load from cache and download incrementally
          console.log(chalk.gray(`Loading cached data from: ${cacheFile}`));
          const cachedContent = await readFile(cacheFile, 'utf-8');
          const cachedData: ChainExport = JSON.parse(cachedContent);
          
          const lastBlockId = cachedData.blocks.length > 0 
            ? Math.max(...cachedData.blocks.map(b => b.data.id))
            : 0;

          console.log(chalk.gray(`Cached blocks: 1-${lastBlockId}`));
          console.log(chalk.gray(`Checking for new blocks...`));

          try {
            const newData = await downloadChain(chainId, {
              apiKey,
              apiUrl,
              from: lastBlockId + 1,
              includeAnchors: options.includeAnchors,
            });

            if (newData.blocks.length > 0) {
              console.log(chalk.green(`✓ Downloaded ${newData.blocks.length} new blocks`));
              
              // Merge with cached data
              chainData = {
                ...cachedData,
                blocks: [...cachedData.blocks, ...newData.blocks],
                metadata: newData.metadata,
                anchors: options.includeAnchors ? newData.anchors : cachedData.anchors,
              };

              // Update cache
              await mkdir(cacheDir, { recursive: true });
              await writeFile(cacheFile, JSON.stringify(chainData, null, 2));
              console.log(chalk.gray(`Cache updated\n`));
            } else {
              console.log(chalk.gray(`No new blocks found\n`));
              chainData = cachedData;
            }
          } catch (error: any) {
            if (error.message.includes('404') || error.message.includes('403')) {
              console.log(chalk.gray(`No new blocks available or access denied\n`));
              chainData = cachedData;
            } else {
              throw error;
            }
          }
        } else {
          // Download full chain
          if (!apiKey) {
            console.log(chalk.yellow('⚠ No API key provided - attempting to download as public chain'));
            console.log(chalk.gray('  For private chains, use --api-key or set SOWASIT_API_KEY environment variable\n'));
          }

          console.log(chalk.gray(`Downloading chain from: ${apiUrl}`));
          
          chainData = await downloadChain(chainId, {
            apiKey,
            apiUrl,
            includeAnchors: options.includeAnchors,
          });

          console.log(chalk.green(`✓ Downloaded ${chainData.blocks.length} blocks\n`));

          // Save to cache
          await mkdir(cacheDir, { recursive: true });
          await writeFile(cacheFile, JSON.stringify(chainData, null, 2));
          console.log(chalk.gray(`Cached to: ${cacheFile}\n`));
        }
      }

      console.log(chalk.gray(`Chain ID: ${chainData.chain_id}`));
      console.log(chalk.gray(`Total blocks: ${chainData.blocks?.length || 0}\n`));

      // Create progress bar
      const progressBar = new cliProgress.SingleBar({
        format: 'Verifying |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} blocks',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      });

      const totalBlocks = chainData.blocks?.length || 0;
      progressBar.start(totalBlocks, 0);

      // Verify chain (we'll update progress manually)
      const result = verifyChain(chainData);

      // Update progress to completion
      progressBar.update(totalBlocks);
      progressBar.stop();

      console.log('');

      // Display results
      if (result.valid) {
        console.log(chalk.green('✓ Chain verification PASSED'));
        console.log(chalk.green(`  All ${result.validBlocks} blocks are cryptographically valid\n`));
      } else {
        console.log(chalk.red('✗ Chain verification FAILED'));
        console.log(chalk.red(`  ${result.invalidBlocks} invalid blocks found\n`));
      }

      // Show summary
      console.log(chalk.bold('Summary:'));
      console.log(`  Total blocks:   ${result.totalBlocks}`);
      console.log(`  Valid blocks:   ${chalk.green(result.validBlocks)}`);
      console.log(`  Invalid blocks: ${result.invalidBlocks > 0 ? chalk.red(result.invalidBlocks) : result.invalidBlocks}`);
      console.log(`  Verified at:    ${result.verifiedAt}\n`);

      // Show errors
      if (result.errors.length > 0) {
        console.log(chalk.red.bold('Errors:'));
        result.errors.forEach((error) => {
          console.log(chalk.red(`  ✗ ${error}`));
        });
        console.log('');
      }

      // Show warnings
      if (result.warnings.length > 0) {
        console.log(chalk.yellow.bold('Warnings:'));
        result.warnings.forEach((warning) => {
          console.log(chalk.yellow(`  ⚠ ${warning}`));
        });
        console.log('');
      }

      // Show anchor verification results
      if (result.anchorVerification) {
        const av = result.anchorVerification;
        console.log(chalk.bold('Anchor Verification:'));
        if (av.valid) {
          console.log(chalk.green(`  ✓ All ${av.validAnchors} anchor blocks verified successfully`));
        } else {
          console.log(chalk.red(`  ✗ ${av.invalidAnchors} anchor blocks failed verification`));
        }
        console.log(`  Total anchors:   ${av.totalAnchors}`);
        console.log(`  Valid anchors:   ${chalk.green(av.validAnchors)}`);
        console.log(`  Invalid anchors: ${av.invalidAnchors > 0 ? chalk.red(av.invalidAnchors) : av.invalidAnchors}\n`);

        if (av.errors.length > 0) {
          console.log(chalk.red.bold('Anchor Errors:'));
          av.errors.forEach((error) => {
            console.log(chalk.red(`  ✗ ${error}`));
          });
          console.log('');
        }

        if (av.warnings.length > 0) {
          console.log(chalk.yellow.bold('Anchor Warnings:'));
          av.warnings.forEach((warning) => {
            console.log(chalk.yellow(`  ⚠ ${warning}`));
          });
          console.log('');
        }

        if (options.verbose && av.anchorResults.length > 0) {
          console.log(chalk.bold('Anchor-by-anchor results:\n'));
          av.anchorResults.forEach((anchorResult) => {
            const status = anchorResult.valid ? chalk.green('✓') : chalk.red('✗');
            console.log(`${status} Anchor Block #${anchorResult.anchorBlockId} → References Block #${anchorResult.referencedBlockId}`);
            console.log(`  Expected hash: ${anchorResult.expectedHash.substring(0, 16)}...`);
            if (anchorResult.actualHash) {
              console.log(`  Actual hash:   ${anchorResult.actualHash.substring(0, 16)}...`);
            }
            
            if (anchorResult.errors.length > 0) {
              anchorResult.errors.forEach((error) => {
                console.log(chalk.red(`  ✗ ${error}`));
              });
            }
            if (anchorResult.warnings.length > 0) {
              anchorResult.warnings.forEach((warning) => {
                console.log(chalk.yellow(`  ⚠ ${warning}`));
              });
            }
            console.log('');
          });
        }
      }

      // Show detailed block results if verbose
      if (options.verbose) {
        console.log(chalk.bold('Block-by-block results:\n'));
        result.blockResults.forEach((blockResult) => {
          const status = blockResult.valid ? chalk.green('✓') : chalk.red('✗');
          console.log(`${status} Block #${blockResult.blockId} (index ${blockResult.blockIndex})`);
          console.log(`  Hash: ${blockResult.hash.substring(0, 16)}...`);
          
          if (blockResult.errors.length > 0) {
            blockResult.errors.forEach((error) => {
              console.log(chalk.red(`  ✗ ${error}`));
            });
          }
          if (blockResult.warnings.length > 0) {
            blockResult.warnings.forEach((warning) => {
              console.log(chalk.yellow(`  ⚠ ${warning}`));
            });
          }
          console.log('');
        });
      }

      // Write output file if requested
      if (options.output) {
        const report = {
          source: chainIdOrFile,
          chainId: chainData.chain_id,
          verificationResult: result,
        };
        await writeFile(options.output, JSON.stringify(report, null, 2));
        console.log(chalk.gray(`Report saved to: ${options.output}\n`));
      }

      // Exit with appropriate code
      process.exit(result.valid ? 0 : 1);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Download command
program
  .command('download')
  .description('Download a chain from the SoWasIt API')
  .argument('<chainId>', 'The chain ID to download')
  .option('-k, --api-key <key>', 'API key for authentication (or set SOWASIT_API_KEY env var). Required only for private chains.')
  .option('-u, --api-url <url>', 'API URL (default: https://api.sowasit.com)')
  .option('-o, --output <file>', 'Output file path (default: <chainId>.json)')
  .option('--from <index>', 'Start block index (inclusive)')
  .option('--to <index>', 'End block index (inclusive)')
  .option('--include-anchors', 'Include anchor blocks in the export')
  .action(async (chainId: string, options: {
    apiKey?: string;
    apiUrl?: string;
    output?: string;
    from?: string;
    to?: string;
    includeAnchors?: boolean;
  }) => {
    try {
      console.log(chalk.cyan('📥 Downloading chain from SoWasIt API\n'));

      const apiKey = options.apiKey || process.env.SOWASIT_API_KEY;
      
      if (!apiKey) {
        console.log(chalk.yellow('⚠ No API key provided - attempting to download as public chain'));
        console.log(chalk.gray('  For private chains, use --api-key or set SOWASIT_API_KEY environment variable\n'));
      }

      console.log(chalk.gray(`Chain ID: ${chainId}`));
      console.log(chalk.gray(`API URL: ${options.apiUrl || 'https://api.sowasit.com'}\n`));

      const downloadOptions = {
        apiUrl: options.apiUrl,
        apiKey,
        from: options.from ? parseInt(options.from) : undefined,
        to: options.to ? parseInt(options.to) : undefined,
        includeAnchors: options.includeAnchors,
      };

      const chainData = await downloadChain(chainId, downloadOptions);

      const outputFile = options.output || `${chainId}.json`;
      await writeFile(outputFile, JSON.stringify(chainData, null, 2));

      console.log(chalk.green(`✓ Chain downloaded successfully`));
      console.log(chalk.gray(`  Blocks: ${chainData.blocks?.length || 0}`));
      console.log(chalk.gray(`  Saved to: ${outputFile}\n`));

      console.log(chalk.cyan('💡 Verify the downloaded chain with:'));
      console.log(chalk.gray(`  npx @sowasit/chain-verifier verify ${outputFile}\n`));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();
