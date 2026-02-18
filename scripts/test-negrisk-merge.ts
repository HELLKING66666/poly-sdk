#!/usr/bin/env npx tsx
/**
 * E2E Test: NegRisk Merge via Adapter
 *
 * Tests that mergeByTokenIds correctly uses the NegRisk Adapter
 * for NegRisk markets (where CLOB token IDs ≠ calculated position IDs).
 *
 * Usage:
 *   PRIVATE_KEY=0x... npx tsx scripts/test-negrisk-merge.ts
 *
 * Test flow:
 *   1. Check balance at CLOB token IDs
 *   2. Check balance at calculated position IDs (should differ for NegRisk)
 *   3. Merge $1 via mergeByTokenIds (uses NegRisk Adapter automatically)
 *   4. Verify balance decreased and USDC increased
 */

import { CTFClient, USDC_DECIMALS } from '../src/clients/ctf-client.js';
import { ethers } from 'ethers';

// ======= Configuration =======

// Monoline FUT vs PV market (NegRisk)
const CONDITION_ID = '0x6498159d253a7f5c305264d0b68ca53bd8e30f9bd451a617d1bbc483b5b6f10a';
const TOKEN_IDS = {
  yesTokenId: '96604699770614701613304832744987771366565286043892398776344969979961648002024',
  noTokenId: '4293155955248146015788513757683601555029963724066356360902198499071458481627',
};

// Small test amount
const TEST_AMOUNT = '1'; // $1 USDC worth of tokens

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('ERROR: Set PRIVATE_KEY env var');
    process.exit(1);
  }

  const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

  console.log('=== NegRisk Merge E2E Test ===\n');

  const ctf = new CTFClient({ privateKey, rpcUrl });
  const address = ctf.getAddress();
  console.log(`Wallet: ${address}`);

  // Step 1: Check USDC balance
  const usdcBefore = await ctf.getUsdcBalance();
  console.log(`USDC.e balance: ${usdcBefore}`);

  // Step 2: Check token balance at CLOB token IDs
  const clobBalances = await ctf.getPositionBalanceByTokenIds(CONDITION_ID, TOKEN_IDS);
  console.log(`\nCLOB token balances:`);
  console.log(`  YES (${TOKEN_IDS.yesTokenId.slice(0, 10)}...): ${clobBalances.yesBalance}`);
  console.log(`  NO  (${TOKEN_IDS.noTokenId.slice(0, 10)}...): ${clobBalances.noBalance}`);

  // Step 3: Check token balance at calculated position IDs (for comparison)
  const calcBalances = await ctf.getPositionBalance(CONDITION_ID);
  console.log(`\nCalculated position balances:`);
  console.log(`  YES (${calcBalances.yesPositionId.slice(0, 10)}...): ${calcBalances.yesBalance}`);
  console.log(`  NO  (${calcBalances.noPositionId.slice(0, 10)}...): ${calcBalances.noBalance}`);

  // Step 4: NegRisk detection
  const clobYes = TOKEN_IDS.yesTokenId;
  const calcYes = ethers.BigNumber.from(calcBalances.yesPositionId).toString();
  const isNegRisk = clobYes !== calcYes;
  console.log(`\nNegRisk detected: ${isNegRisk}`);
  console.log(`  CLOB YES ID: ${clobYes.slice(0, 20)}...`);
  console.log(`  Calc YES ID: ${calcYes.slice(0, 20)}...`);

  if (!isNegRisk) {
    console.log('\nNot a NegRisk market. Standard merge should work.');
  }

  // Step 5: Check if we have enough balance to test
  const minBalance = parseFloat(clobBalances.yesBalance);
  const noBalance = parseFloat(clobBalances.noBalance);
  const testAmount = parseFloat(TEST_AMOUNT);

  if (minBalance < testAmount || noBalance < testAmount) {
    console.error(`\nInsufficient balance for test. Need ${TEST_AMOUNT} of each. Have: YES=${clobBalances.yesBalance}, NO=${clobBalances.noBalance}`);
    process.exit(1);
  }

  // Step 6: Merge test amount via mergeByTokenIds
  console.log(`\n--- Merging ${TEST_AMOUNT} tokens via mergeByTokenIds ---`);
  try {
    const result = await ctf.mergeByTokenIds(CONDITION_ID, TOKEN_IDS, TEST_AMOUNT);
    console.log(`✅ Merge succeeded!`);
    console.log(`  TX: ${result.txHash}`);
    console.log(`  Amount: ${result.amount}`);
    console.log(`  USDC received: ${result.usdcReceived}`);
    console.log(`  Gas used: ${result.gasUsed}`);
  } catch (error: any) {
    console.error(`❌ Merge failed: ${error.message}`);
    process.exit(1);
  }

  // Step 7: Verify balance changes
  const usdcAfter = await ctf.getUsdcBalance();
  const clobBalancesAfter = await ctf.getPositionBalanceByTokenIds(CONDITION_ID, TOKEN_IDS);

  console.log(`\n--- Balance verification ---`);
  console.log(`USDC.e: ${usdcBefore} → ${usdcAfter} (diff: +${(parseFloat(usdcAfter) - parseFloat(usdcBefore)).toFixed(6)})`);
  console.log(`YES tokens: ${clobBalances.yesBalance} → ${clobBalancesAfter.yesBalance}`);
  console.log(`NO tokens:  ${clobBalances.noBalance} → ${clobBalancesAfter.noBalance}`);

  const usdcDiff = parseFloat(usdcAfter) - parseFloat(usdcBefore);
  if (usdcDiff >= testAmount * 0.99) {
    console.log(`\n✅ E2E test PASSED — NegRisk merge via adapter works!`);
  } else {
    console.log(`\n⚠️  USDC increase (${usdcDiff.toFixed(6)}) less than expected (${TEST_AMOUNT})`);
  }
}

main().catch(console.error);
