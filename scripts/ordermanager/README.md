# OrderManager Test Suite

Comprehensive test scripts for validating OrderManager functionality, including coverage for known bugs.

## Test Scripts Overview

| Script | Purpose | Balance | Duration |
|--------|---------|---------|----------|
| **quick-test.ts** | Basic functionality | ~5 USDC.e | ~13s |
| **balanced-test.ts** | Low balance scenarios | ~1.5 USDC.e | ~15s |
| **minimal-loop-test.ts** | Fund cycling (create→cancel) | ~7 USDC.e | ~30s |
| **smart-cycle-test.ts** | Buy/Sell cycle | ~15 USDC.e | ~25s |
| **full-e2e.ts** | Complete E2E | ~50 USDC.e | ~3min |
| **bug20-deep-analysis.ts** | Bug 20 analysis | ~6 USDC.e | ~2min |
| **bug24-tokenid-test.ts** | Bug 24 verification | ~5 USDC.e | ~30s |

---

## Bug Coverage

### Bug 20: `matchedSize=0` in WebSocket Events

**Problem**: WebSocket USER_TRADE events returned `matchedSize: 0` for maker orders.

**Fix**: Use `matched_amount` field (correct field name) instead of `matched_size`.

**Test**: `bug20-deep-analysis.ts` - Records raw WebSocket payloads to verify correct field usage.

### Bug 24: Polling Overwrites tokenId ✅ Fixed

**Problem**:
- `watchOrder()` initialized with empty `tokenId=''`
- Polling mechanism updated `watched.order` with potentially wrong tokenId from API
- Fill events processed with wrong tokenType (e.g., NO order counted as YES)

**Fix**:
- Default mode changed from `'hybrid'` to `'websocket'`
- Added `initialTokenId` field to preserve original tokenId
- `createOrder/createMarketOrder` pass tokenId to `watchOrder()`

**Test**: `bug24-tokenid-test.ts` - Creates YES/NO orders and verifies tokenId preservation.

---

## Quick Start

```bash
# Run basic validation
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/quick-test.ts

# Run Bug 24 verification (recommended after any OrderManager changes)
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/bug24-tokenid-test.ts
```

---

## Test Progression (Recommended Order)

```
Stage 1: Quick Validation (~13s)
└── quick-test.ts
    └── Core functionality check

Stage 2: Bug 24 Verification (~30s) ⭐ NEW
└── bug24-tokenid-test.ts
    └── TokenId preservation for YES/NO tokens

Stage 3: Parameter Validation (~15s)
└── balanced-test.ts
    └── Edge cases and low balance

Stage 4: Fund Cycling (~30s)
└── minimal-loop-test.ts
    └── Create → Cancel recovery

Stage 5: Buy/Sell Cycle (~25s)
└── smart-cycle-test.ts
    └── Full BUY → SELL loop

Stage 6: Complete E2E (~3min)
└── full-e2e.ts
    └── All features including GTD expiry
```

---

## Script Details

### quick-test.ts - Basic Validation

Tests core OrderManager functionality:
- ✅ Order creation
- ✅ Auto-watch
- ✅ Status transitions
- ✅ Fill events
- ✅ Order cancellation

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/quick-test.ts
```

### bug24-tokenid-test.ts - TokenId Preservation ⭐

Verifies Bug 24 fix by testing:
- ✅ YES token order tokenId preservation
- ✅ NO token order tokenId preservation
- ✅ Rapid YES/NO order creation (race condition test)
- ✅ WebSocket-only mode verification

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/bug24-tokenid-test.ts
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════
  Bug 24 Fix Verified - All tokenId tests passed!
═══════════════════════════════════════════════════════════
```

### balanced-test.ts - Low Balance Testing

Tests with minimal funds (~1.5 USDC.e):
- ✅ Parameter validation (min size, precision)
- ✅ Low balance order creation
- ✅ Order lifecycle events

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/balanced-test.ts
```

### minimal-loop-test.ts - Fund Cycling

Tests fund recovery via order cancellation:
- ✅ Create → Cancel cycles (6 iterations)
- ✅ Different price points
- ✅ Immediate cancellation
- ✅ Batch orders

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/minimal-loop-test.ts
```

### smart-cycle-test.ts - Buy/Sell Loop

Tests complete trading cycle:
- ✅ BUY token → SELL token
- ✅ Both YES and NO tokens
- ✅ Fund recovery (~95%)

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/smart-cycle-test.ts
```

### full-e2e.ts - Complete E2E

Comprehensive test suite:
- ✅ GTC orders
- ✅ GTD orders (expiry test ~70s)
- ✅ Partial fills
- ✅ External order watching
- ✅ Full parameter validation

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/full-e2e.ts
```

### bug20-deep-analysis.ts - Bug 20 Analysis

Records raw WebSocket events for analysis:
- ✅ Maker limit orders (passive)
- ✅ Taker limit orders (aggressive)
- ✅ FOK market orders
- ✅ FAK market orders

```bash
PRIVATE_KEY=0x... npx tsx scripts/ordermanager/bug20-deep-analysis.ts
```

### Utility Scripts

- **debug-market-data.ts** - Market data inspection
- **test-market-order-lifecycle.ts** - Market order lifecycle analysis

---

## CI/CD Integration

### Minimum (PR Check)

```yaml
- name: Quick OrderManager Test
  run: |
    PRIVATE_KEY=${{ secrets.TEST_WALLET_KEY }} \
    npx tsx scripts/ordermanager/quick-test.ts
```

### Standard (Merge to Main)

```yaml
- name: OrderManager Tests
  run: |
    PRIVATE_KEY=${{ secrets.TEST_WALLET_KEY }} \
    npx tsx scripts/ordermanager/quick-test.ts && \
    npx tsx scripts/ordermanager/bug24-tokenid-test.ts && \
    npx tsx scripts/ordermanager/balanced-test.ts
```

### Full (Release)

```yaml
- name: Full OrderManager E2E
  run: |
    PRIVATE_KEY=${{ secrets.TEST_WALLET_KEY }} \
    npx tsx scripts/ordermanager/quick-test.ts && \
    npx tsx scripts/ordermanager/bug24-tokenid-test.ts && \
    npx tsx scripts/ordermanager/balanced-test.ts && \
    npx tsx scripts/ordermanager/minimal-loop-test.ts && \
    npx tsx scripts/ordermanager/smart-cycle-test.ts && \
    npx tsx scripts/ordermanager/full-e2e.ts
```

---

## Troubleshooting

### Common Errors

**"not enough balance / allowance"**
- Check USDC.e balance
- Use `balanced-test.ts` for lower requirements

**"Order not in watched list"**
- Order may have filled immediately (normal)
- Use lower prices to avoid instant fills

**"tokenId mismatch"**
- Bug 24 may not be properly fixed
- Verify OrderManager mode is 'websocket'

---

## Market Selection

Tests use 15-minute crypto markets (BTC/SOL/ETH) for:
- ✅ High liquidity (fast fills)
- ✅ Short cycles (quick settlement)
- ✅ Predictable price ranges

---

*Last Updated: 2026-02-01*
