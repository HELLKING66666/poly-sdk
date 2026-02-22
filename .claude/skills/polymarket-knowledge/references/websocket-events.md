# WebSocket Events Reference

## Endpoints

| Channel | URL | Auth Required |
|---------|-----|---------------|
| MARKET | `wss://ws-subscriptions-clob.polymarket.com/ws/market` | No |
| USER | `wss://ws-subscriptions-clob.polymarket.com/ws/user` | Yes (API Key) |

**Important**: USER events (orders, trades) MUST use `/ws/user` endpoint.

## USER_ORDER Event

Order lifecycle events for the authenticated user.

### API Payload

```json
{
  "id": "0x...",
  "market": "0x...",
  "asset_id": "12345...",
  "side": "BUY",
  "price": "0.50",
  "original_size": "100",
  "size_matched": "50",
  "type": "UPDATE"
}
```

### Field Mapping

| API Field | SDK Field | Type | Notes |
|-----------|-----------|------|-------|
| `id` | `orderId` | string | Order ID |
| `market` | `market` | string | Condition ID |
| `asset_id` | `asset` | string | Token ID |
| `side` | `side` | 'BUY' \| 'SELL' | |
| `price` | `price` | number | 0-1 |
| `original_size` | `originalSize` | number | |
| `size_matched` | `sizeMatched` | number | Already filled amount |
| `type` | `eventType` | string | PLACEMENT, UPDATE, CANCELLATION |

### Event Types

- **PLACEMENT**: New order placed
- **UPDATE**: Order state changed (partial fill, price change)
- **CANCELLATION**: Order cancelled

### SDK Interface

```typescript
interface UserOrder {
  orderId: string;
  market: string;
  asset: string;
  side: 'BUY' | 'SELL';
  price: number;
  originalSize: number;
  sizeMatched: number;  // API: size_matched
  eventType: 'PLACEMENT' | 'UPDATE' | 'CANCELLATION';
  timestamp: number;
}
```

## USER_TRADE Event

Trade execution events for the authenticated user.

### API Payload

```json
{
  "type": "TRADE",
  "id": "7fe5ed2d-...",
  "taker_order_id": "0x...",
  "market": "0x...",
  "asset_id": "12345...",
  "outcome": "Up",
  "side": "BUY",
  "price": "0.07",
  "size": "10",
  "status": "MATCHED",
  "match_time": "1771746841",
  "last_update": "1771746841",
  "timestamp": "1771746841700",
  "fee_rate_bps": "1000",
  "owner": "a23a3e42-...",
  "trade_owner": "a23a3e42-...",
  "maker_address": "0x...",
  "transaction_hash": "0x...",
  "trader_side": "TAKER",
  "event_type": "trade",
  "maker_orders": [
    {
      "order_id": "0x...",
      "matched_amount": "10",
      "price": "0.07",
      "fee_rate_bps": "1000",
      "asset_id": "12345...",
      "outcome": "Up",
      "outcome_index": 0,
      "side": "SELL",
      "owner": "d0030308-...",
      "maker_address": "0x..."
    }
  ]
}
```

> **Verified 2026-02-22**: Real WS payload captured. Key findings:
> - `match_time` (with underscore) is present in ALL statuses (MATCHED/MINED/CONFIRMED)
> - `match_time` is Unix seconds (string), `timestamp` is Unix milliseconds (string)
> - Additional fields: `type`, `fee_rate_bps`, `owner`, `trade_owner`, `maker_address`, `trader_side`, `event_type`

### Field Mapping

| API Field | SDK Field | Type | Notes |
|-----------|-----------|------|-------|
| `id` (or `trade_id`) | `tradeId` | string | API uses `id` field (e.g., "7fe5ed2d-..."). Fallback to `trade_id` for compat. |
| `taker_order_id` | `takerOrderId` | string | Order that took liquidity |
| `market` | `market` | string | Condition ID |
| `asset_id` | `assetId` | string | Token ID |
| `outcome` | `outcome` | string | Yes, No, Up, Down, etc |
| `side` | `side` | 'BUY' \| 'SELL' | Taker side |
| `price` | `price` | number | |
| `size` | `size` | number | Total trade size |
| `status` | `status` | string | MATCHED, MINED, CONFIRMED, etc |
| `match_time` | `matchTime` | number | **CLOB server-side match timestamp** (Unix seconds string, e.g. "1771746841"). Use `normalizeTimestamp()` to convert to ms. Present in ALL statuses (MATCHED/MINED/CONFIRMED). **NOTE: API field is `match_time` with underscore, NOT `matchtime`!** |
| `timestamp` | `timestamp` | number | Event timestamp (Unix milliseconds string, e.g. "1771746841700") |
| `last_update` | — | number | Last status update timestamp (Unix seconds string) |
| `transaction_hash` | `transactionHash` | string | After MINED |
| `maker_orders` | `makerOrders` | array | Maker side details |

### MakerOrderInfo

| API Field | SDK Field | Type | Notes |
|-----------|-----------|------|-------|
| `order_id` | `orderId` | string | Maker order ID |
| `matched_amount` | `matchedAmount` | number | **NOT matched_size!** |
| `price` | `price` | number | Maker's price |
| `asset_id` | `assetId` | string | Optional |
| `outcome` | `outcome` | string | Optional |
| `owner` | `owner` | string | Maker's address |

### Trade Statuses

| Status | Description |
|--------|-------------|
| MATCHED | Order matched in orderbook, awaiting tx |
| MINED | Transaction submitted to chain |
| CONFIRMED | Transaction confirmed on chain |
| RETRYING | Transaction failed, retrying |
| FAILED | Transaction permanently failed |

### SDK Interface

```typescript
interface UserTrade {
  tradeId: string;
  takerOrderId: string;
  market: string;
  assetId: string;
  outcome: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  status: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED';
  transactionHash?: string;
  makerOrders: MakerOrderInfo[];
  timestamp: number;
}

interface MakerOrderInfo {
  orderId: string;
  matchedAmount: number;  // API: matched_amount (NOT matched_size!)
  price: number;
  assetId?: string;
  outcome?: string;
  owner?: string;
}
```

## Bug 20: Wrong Field Name

**Problem**: Using `matched_size` instead of `matched_amount` for maker orders.

```typescript
// WRONG - matched_size doesn't exist
matchedAmount: Number(m.matched_size) || 0  // Always 0!

// CORRECT - use matched_amount
matchedAmount: Number(m.matched_amount) || 0  // Actual fill size
```

**Impact**: Fill size calculated as 0, causing balance tracking errors.

## MARKET Channel Events

### book

Orderbook updates for a token.

```json
{
  "event_type": "book",
  "asset_id": "12345...",
  "market": "0x...",
  "bids": [{"price": "0.49", "size": "100"}],
  "asks": [{"price": "0.51", "size": "100"}],
  "timestamp": "1704067200000"
}
```

### price_change

Price changes for a token.

```json
{
  "event_type": "price_change",
  "asset_id": "12345...",
  "price": "0.50",
  "timestamp": "1704067200000"
}
```

### last_trade_price

Recent trade price.

```json
{
  "event_type": "last_trade_price",
  "asset_id": "12345...",
  "price": "0.50"
}
```

## Authentication

USER channel requires L2 API credentials:

```typescript
const creds = await clobClient.createOrDeriveApiCreds();
// { key, secret, passphrase }

service.subscribeUserEvents(
  { key: creds.key, secret: creds.secret, passphrase: creds.passphrase },
  { onOrder, onTrade, onError }
);
```

## Subscription Messages

### Subscribe to Market

```json
{
  "type": "subscribe",
  "channel": "market",
  "assets_ids": ["12345...", "67890..."]
}
```

### Subscribe to User (authenticated)

```json
{
  "type": "subscribe",
  "channel": "user",
  "auth": {
    "apiKey": "...",
    "signature": "...",
    "timestamp": "...",
    "nonce": "..."
  }
}
```
