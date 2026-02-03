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
  "trade_id": "abc123",
  "taker_order_id": "0x...",
  "market": "0x...",
  "asset_id": "12345...",
  "outcome": "Yes",
  "side": "BUY",
  "price": "0.50",
  "size": "10",
  "status": "CONFIRMED",
  "transaction_hash": "0x...",
  "maker_orders": [
    {
      "order_id": "0x...",
      "matched_amount": "10",
      "price": "0.50",
      "asset_id": "12345...",
      "outcome": "Yes",
      "owner": "0x..."
    }
  ]
}
```

### Field Mapping

| API Field | SDK Field | Type | Notes |
|-----------|-----------|------|-------|
| `trade_id` | `tradeId` | string | May be empty for MATCHED |
| `taker_order_id` | `takerOrderId` | string | Order that took liquidity |
| `market` | `market` | string | Condition ID |
| `asset_id` | `assetId` | string | Token ID |
| `outcome` | `outcome` | string | Yes, No, Up, Down, etc |
| `side` | `side` | 'BUY' \| 'SELL' | Taker side |
| `price` | `price` | number | |
| `size` | `size` | number | Total trade size |
| `status` | `status` | string | MATCHED, MINED, CONFIRMED, etc |
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
