# API Field Mappings

## OpenOrder (REST API)

Response from `GET /orders/{orderId}` or `GET /orders`.

| API Field | SDK Field | Type | Description |
|-----------|-----------|------|-------------|
| `id` | `orderId` | string | Order ID |
| `market` | `market` | string | Condition ID (0x...) |
| `asset_id` | `assetId` | string | Token ID |
| `side` | `side` | 'BUY' \| 'SELL' | Order side |
| `price` | `price` | string → number | Price (0-1) |
| `original_size` | `originalSize` | string → number | Original order size |
| `size_matched` | `sizeMatched` | string → number | Filled amount |
| `status` | `status` | string | live, matched, cancelled, expired |
| `type` | `orderType` | string | GTC, GTD, FOK, FAK |
| `expiration` | `expiration` | string → number | GTD expiration timestamp |
| `created_at` | `createdAt` | string → Date | Order creation time |

## Order Submission

Request body for `POST /orders`.

```typescript
interface OrderPayload {
  tokenID: string;        // Token ID to trade
  price: number;          // Price (0.01 - 0.99)
  size: number;           // Size in shares
  side: 'BUY' | 'SELL';
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK';
  expiration?: number;    // Required for GTD
  feeRateBps?: number;    // Fee rate in basis points
}
```

## Trade History (REST API)

Response from `GET /trades`.

| API Field | SDK Field | Type | Description |
|-----------|-----------|------|-------------|
| `id` | `tradeId` | string | Trade ID |
| `market` | `market` | string | Condition ID |
| `asset_id` | `assetId` | string | Token ID |
| `side` | `side` | 'BUY' \| 'SELL' | Trade side |
| `price` | `price` | string → number | Trade price |
| `size` | `size` | string → number | Trade size |
| `fee_rate_bps` | `feeRateBps` | number | Fee in basis points |
| `outcome` | `outcome` | string | Yes, No, Up, Down |
| `owner` | `owner` | string | Trader address |
| `match_time` | `matchTime` | string → Date | When matched |
| `status` | `status` | string | Trade status |
| `transaction_hash` | `transactionHash` | string | On-chain tx |

## OnChain Order Info (OrderFilled Event)

From blockchain logs when order is filled.

| Event Field | Description |
|-------------|-------------|
| `orderHash` | Unique hash for the filled order |
| `maker` | Address of order creator |
| `taker` | Address of filler (or Exchange contract) |
| `makerAssetId` | 0 = BUY (USDC out), non-zero = SELL (tokens out) |
| `takerAssetId` | 0 = SELL (USDC received), non-zero = BUY (tokens received) |
| `makerAmountFilled` | Amount of asset given out |
| `takerAmountFilled` | Amount of asset received |
| `fee` | Fees paid by order maker |

### Interpreting makerAssetId

```typescript
// Determine order direction from makerAssetId
if (makerAssetId === 0) {
  // BUY order - maker gives USDC, receives tokens
  direction = 'BUY';
} else {
  // SELL order - maker gives tokens, receives USDC
  direction = 'SELL';
}
```

## Market Info (Gamma API)

Response from Gamma API market endpoints.

| API Field | SDK Field | Type | Description |
|-----------|-----------|------|-------------|
| `condition_id` | `conditionId` | string | Market identifier |
| `question_id` | `questionId` | string | |
| `slug` | `slug` | string | URL-friendly name |
| `question` | `question` | string | Market question |
| `tokens` | `tokens` | array | Token info |
| `volume` | `volume` | string → number | Total volume |
| `volume_24hr` | `volume24hr` | string → number | 24h volume |
| `liquidity` | `liquidity` | string → number | |
| `active` | `active` | boolean | |
| `closed` | `closed` | boolean | |
| `end_date` | `endDate` | string → Date | Market end |

## Token Info

| API Field | SDK Field | Type | Description |
|-----------|-----------|------|-------------|
| `token_id` | `tokenId` | string | ERC-1155 token ID |
| `outcome` | `outcome` | string | Yes, No, Up, Down, Team A, etc |
| `price` | `price` | number | Current price (0-1) |
| `winner` | `winner` | boolean | After resolution |

## Common Type Conversions

```typescript
// Prices and sizes come as strings from API
price: Number(apiResponse.price) || 0
size: Number(apiResponse.size) || 0

// Timestamps may be strings or numbers
timestamp: typeof ts === 'string' ? parseInt(ts) : ts

// Dates
endDate: new Date(apiResponse.end_date)
createdAt: new Date(apiResponse.created_at)
```

## Status Values

### Order Status (API)

| Value | Description |
|-------|-------------|
| `live` | Active in orderbook |
| `matched` | Has fills (check size_matched for partial/full) |
| `delayed` | Submitted but not yet active |
| `cancelled` | Cancelled |
| `expired` | GTD expired |

### Trade Status

| Value | Description |
|-------|-------------|
| `MATCHED` | Matched in orderbook |
| `MINED` | Tx submitted to chain |
| `CONFIRMED` | Tx confirmed |
| `RETRYING` | Tx failed, retrying |
| `FAILED` | Tx permanently failed |

## SDK Enums

```typescript
enum OrderStatus {
  PENDING = 'pending',
  OPEN = 'open',
  PARTIALLY_FILLED = 'partially_filled',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REJECTED = 'rejected',
}

type OrderType = 'GTC' | 'GTD' | 'FOK' | 'FAK';
type Side = 'BUY' | 'SELL';
```
