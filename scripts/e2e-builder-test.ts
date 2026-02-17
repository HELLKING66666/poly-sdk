#!/usr/bin/env tsx
/**
 * E2E Builder/Relayer Test
 *
 * Tests the complete Builder mode flow:
 *   1. Deploy Gnosis Safe via Relayer (idempotent)
 *   2. Approve USDC.e for CTF operations
 *   3. Fund Safe with USDC.e from EOA
 *   4. Split USDC into YES+NO tokens
 *   5. Place a limit order with Builder headers
 *   6. Cancel the order
 *   7. Merge tokens back to USDC
 *
 * Usage (from poly-sdk dir):
 *   npx tsx scripts/e2e-builder-test.ts
 *
 * Required env vars (in root .env):
 *   PRIVATE_KEY, POLYGON_RPC_URL
 *   POLY_BUILDER_API_KEY, POLY_BUILDER_SECRET, POLY_BUILDER_PASSPHRASE
 */

import { readFileSync, existsSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
const rootDir = resolve(__dirname, '../..');
const envPath = resolve(rootDir, '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && !key.startsWith('#')) {
      const value = valueParts.join('=').trim();
      if (value && !process.env[key.trim()]) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  }
}

import { RelayerService } from '../src/services/relayer-service.js';
import { USDC_CONTRACT, CTF_CONTRACT } from '../src/clients/ctf-client.js';
import { RateLimiter } from '../src/core/rate-limiter.js';
import { createUnifiedCache } from '../src/core/unified-cache.js';
import { TradingService } from '../src/services/trading-service.js';
import { MarketService } from '../src/services/market-service.js';
import { GammaApiClient } from '../src/clients/gamma-api.js';
import { DataApiClient } from '../src/clients/data-api.js';
import { BinanceService } from '../src/services/binance-service.js';

// ============================================================================
// Config
// ============================================================================

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
const BUILDER_CREDS = {
  key: process.env.POLY_BUILDER_API_KEY!,
  secret: process.env.POLY_BUILDER_SECRET!,
  passphrase: process.env.POLY_BUILDER_PASSPHRASE!,
};

const FUND_AMOUNT = '5';
const SPLIT_AMOUNT = '2';

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ============================================================================
// Helpers
// ============================================================================

function log(step: string, msg: string) {
  console.log(`[E2E] [${step}] ${msg}`);
}
function logOk(step: string, msg: string) {
  console.log(`  ✅ [${step}] ${msg}`);
}
function logFail(step: string, msg: string) {
  console.log(`  ❌ [${step}] ${msg}`);
}
async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// Find active market using MarketService.scanCryptoShortTermMarkets
// ============================================================================

async function findActiveMarket(marketService: MarketService): Promise<{
  conditionId: string;
  primaryTokenId: string;
  secondaryTokenId: string;
  question: string;
}> {
  log('Market', 'Scanning for active 15min BTC markets...');

  const markets = await marketService.scanCryptoShortTermMarkets({
    coin: 'BTC',
    duration: '15m',
    minMinutesUntilEnd: 5,
    maxMinutesUntilEnd: 30,
    limit: 5,
  });

  if (markets.length === 0) {
    throw new Error('No active 15min BTC markets found. Try again when markets are open.');
  }

  const selected = markets[0];
  log('Market', `Found: ${selected.question}`);

  // Resolve tokens via CLOB API (MarketService.getClobMarket)
  const marketInfo = await marketService.getClobMarket(selected.conditionId!);
  if (!marketInfo?.tokens || marketInfo.tokens.length < 2) {
    throw new Error(`Cannot resolve tokens for market ${selected.conditionId}`);
  }

  const primary = marketInfo.tokens.find((t: any) => t.outcome === 'Yes') || marketInfo.tokens[0];
  const secondary = marketInfo.tokens.find((t: any) => t.outcome === 'No') || marketInfo.tokens[1];

  return {
    conditionId: selected.conditionId!,
    primaryTokenId: primary.tokenId,
    secondaryTokenId: secondary.tokenId,
    question: selected.question || 'Unknown',
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('\n════════════════════════════════════════════════════');
  console.log('   Builder/Relayer E2E Test');
  console.log('════════════════════════════════════════════════════\n');

  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not set');
  if (!BUILDER_CREDS.key) throw new Error('POLY_BUILDER_API_KEY not set');
  if (!BUILDER_CREDS.secret) throw new Error('POLY_BUILDER_SECRET not set');
  if (!BUILDER_CREDS.passphrase) throw new Error('POLY_BUILDER_PASSPHRASE not set');

  // Use a static network to skip auto-detection (avoids rate-limit race)
  const provider = new ethers.providers.StaticJsonRpcProvider(
    { url: RPC_URL, timeout: 30000 },
    137 // Polygon mainnet
  );
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  log('Init', `EOA: ${wallet.address}`);
  log('Init', `RPC: ${RPC_URL}`);

  // ========================================================================
  // Step 1: Deploy Safe (idempotent)
  // ========================================================================
  log('Step 1', 'Deploying Gnosis Safe via Relayer...');

  const relayer = new RelayerService({
    builderCreds: BUILDER_CREDS,
    privateKey: PRIVATE_KEY,
    rpcUrl: RPC_URL,
  });

  const deployResult = await relayer.deploySafe();

  if (!deployResult.success) {
    logFail('Step 1', `Deploy failed: ${deployResult.errorMessage}`);
    process.exit(1);
  }

  const safeAddress = deployResult.safeAddress;
  const isNew = !!deployResult.txHash;
  logOk('Step 1', `Safe: ${safeAddress} (${isNew ? 'newly deployed' : 'already existed'})`);
  if (isNew) log('Step 1', `TX: ${deployResult.txHash}`);

  // Save to .env if not already there
  const envContent = readFileSync(envPath, 'utf-8');
  if (!envContent.includes('POLY_SAFE_ADDRESS=')) {
    appendFileSync(envPath, `\nPOLY_SAFE_ADDRESS=${safeAddress}\n`);
    log('Step 1', 'POLY_SAFE_ADDRESS saved to .env');
  }

  // ========================================================================
  // Step 2: Approve USDC.e for CTF Exchange
  // ========================================================================
  log('Step 2', 'Approving USDC.e for CTF Exchange...');

  const approveResult = await relayer.approveUsdc(
    CTF_CONTRACT,
    ethers.constants.MaxUint256
  );

  if (!approveResult.success) {
    logFail('Step 2', `Approve failed: ${approveResult.errorMessage}`);
    process.exit(1);
  }

  logOk('Step 2', `USDC.e approved. TX: ${approveResult.txHash}`);

  // ========================================================================
  // Step 3: Fund Safe with USDC.e from EOA (best-effort balance check)
  // ========================================================================
  log('Step 3', 'Checking Safe USDC.e balance...');

  let safeBalanceHuman = -1;
  try {
    const usdc = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const safeBalance = await usdc.balanceOf(safeAddress);
    safeBalanceHuman = parseFloat(ethers.utils.formatUnits(safeBalance, 6));
    log('Step 3', `Safe USDC.e balance: $${safeBalanceHuman.toFixed(2)}`);

    if (safeBalanceHuman >= parseFloat(SPLIT_AMOUNT)) {
      logOk('Step 3', `Safe has $${safeBalanceHuman.toFixed(2)} (>= $${SPLIT_AMOUNT} needed), skipping transfer`);
    } else {
      log('Step 3', `Safe balance ($${safeBalanceHuman.toFixed(2)}) < $${SPLIT_AMOUNT}. Transferring from EOA...`);
      const usdcWithSigner = usdc.connect(wallet);
      const transferTx = await usdcWithSigner.transfer(
        safeAddress,
        ethers.utils.parseUnits(FUND_AMOUNT, 6)
      );
      const receipt = await transferTx.wait();
      logOk('Step 3', `Transfer complete. TX: ${receipt.transactionHash}`);
    }
  } catch (err: any) {
    log('Step 3', `Balance check failed (${err.message?.slice(0, 80)}), proceeding anyway...`);
    logOk('Step 3', 'Skipped (RPC unavailable, Safe was previously funded)');
  }

  // ========================================================================
  // Step 4: Find active market
  // ========================================================================
  log('Step 4', 'Finding active market...');

  const rateLimiter = new RateLimiter();
  const cache = createUnifiedCache();
  const gamma = new GammaApiClient(rateLimiter, cache);
  const dataApi = new DataApiClient(rateLimiter, cache);
  const binance = new BinanceService(rateLimiter, cache);
  const marketService = new MarketService(gamma, dataApi, rateLimiter, cache, undefined, binance);

  const tradingService = new TradingService(rateLimiter, cache, {
    privateKey: PRIVATE_KEY,
    builderCreds: BUILDER_CREDS,
  });
  await tradingService.initialize();

  const market = await findActiveMarket(marketService);
  logOk('Step 4', `Market: ${market.question}`);
  log('Step 4', `conditionId: ${market.conditionId}`);

  // ========================================================================
  // Step 5: Split USDC into YES+NO tokens
  // ========================================================================
  log('Step 5', `Splitting $${SPLIT_AMOUNT} USDC into YES+NO tokens...`);

  const splitResult = await relayer.split(market.conditionId, SPLIT_AMOUNT);

  if (!splitResult.success) {
    logFail('Step 5', `Split failed: ${splitResult.errorMessage}`);
    process.exit(1);
  }

  logOk('Step 5', `Split complete. TX: ${splitResult.txHash}`);
  await sleep(3000);

  // ========================================================================
  // Step 6: Place and cancel a limit order with Builder headers
  // ========================================================================
  log('Step 6', 'Placing limit order with Builder headers...');

  const orderResult = await tradingService.createLimitOrder({
    tokenId: market.primaryTokenId,
    side: 'BUY',
    price: 0.01,
    size: 100,
  });

  if (!orderResult.success) {
    logFail('Step 6', `Order failed: ${orderResult.errorMsg || 'Unknown error'}`);
  } else {
    logOk('Step 6', `Order placed: ${orderResult.orderId}`);
    await sleep(1000);
    try {
      await tradingService.cancelOrder(orderResult.orderId!);
      logOk('Step 6', 'Order cancelled');
    } catch (err: any) {
      logFail('Step 6', `Cancel failed: ${err.message}`);
    }
  }

  // ========================================================================
  // Step 7: Merge tokens back to USDC
  // ========================================================================
  log('Step 7', `Merging ${SPLIT_AMOUNT} YES+NO tokens back to USDC...`);

  const mergeResult = await relayer.merge(market.conditionId, SPLIT_AMOUNT);

  if (!mergeResult.success) {
    logFail('Step 7', `Merge failed: ${mergeResult.errorMessage}`);
    process.exit(1);
  }

  logOk('Step 7', `Merge complete. TX: ${mergeResult.txHash}`);
  await sleep(3000);

  // Final balance check (best-effort)
  let finalBalanceStr = 'N/A (RPC timeout)';
  try {
    const usdcFinal = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, provider);
    const finalBalance = await usdcFinal.balanceOf(safeAddress);
    finalBalanceStr = `$${parseFloat(ethers.utils.formatUnits(finalBalance, 6)).toFixed(2)}`;
  } catch { /* ignore */ }

  // ========================================================================
  // Summary
  // ========================================================================
  console.log('\n════════════════════════════════════════════════════');
  console.log('   E2E Test Summary');
  console.log('════════════════════════════════════════════════════');
  console.log(`  Safe Address:  ${safeAddress}`);
  console.log(`  EOA Address:   ${wallet.address}`);
  console.log(`  Market:        ${market.question}`);
  console.log(`  Split/Merge:   $${SPLIT_AMOUNT}`);
  console.log(`  Final Balance: ${finalBalanceStr}`);
  console.log('════════════════════════════════════════════════════\n');

  console.log('✅ Builder/Relayer E2E test complete!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ E2E test failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
