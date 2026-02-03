# Order State Machine

## State Diagram

```
┌────────┐    submit    ┌──────┐    match    ┌─────────────────┐    full fill    ┌────────┐
│PENDING │ ───────────> │ OPEN │ ─────────> │PARTIALLY_FILLED │ ──────────────> │ FILLED │
└────────┘              └──────┘             └─────────────────┘                 └────────┘
    │                      │                        │
    │ reject               │ cancel/expire          │ cancel/expire
    ▼                      ▼                        ▼
┌──────────┐          ┌───────────┐            ┌───────────┐
│ REJECTED │          │CANCELLED/ │            │CANCELLED/ │
└──────────┘          │ EXPIRED   │            │ EXPIRED   │
                      └───────────┘            └───────────┘
```

## States

| State | API Status | Description |
|-------|------------|-------------|
| PENDING | `delayed` | Order created locally, not yet in orderbook |
| OPEN | `live` | Active in orderbook, no fills |
| PARTIALLY_FILLED | `matched` (size_matched < original_size) | Has some fills, more possible |
| FILLED | `matched` (size_matched >= original_size) | Completely filled (terminal) |
| CANCELLED | `cancelled` | Cancelled by user/system (terminal) |
| EXPIRED | `expired` | GTD order expired (terminal) |
| REJECTED | N/A (local) | Failed validation, never reached API (terminal) |

## Valid Transitions

```typescript
const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.OPEN,           // Normal submission
    OrderStatus.PARTIALLY_FILLED, // Immediate partial fill
    OrderStatus.FILLED,         // Immediate full fill (rare)
    OrderStatus.CANCELLED,      // Cancelled before open
    OrderStatus.EXPIRED,        // Expired immediately (rare)
    OrderStatus.REJECTED,       // Validation failure
  ],
  [OrderStatus.OPEN]: [
    OrderStatus.PARTIALLY_FILLED, // First fill
    OrderStatus.FILLED,          // Full fill at once
    OrderStatus.CANCELLED,       // User cancellation
    OrderStatus.EXPIRED,         // GTD expiration
  ],
  [OrderStatus.PARTIALLY_FILLED]: [
    OrderStatus.FILLED,          // Remaining filled
    OrderStatus.CANCELLED,       // Cancel remaining
    OrderStatus.EXPIRED,         // GTD expiration
  ],
  // Terminal states - no outgoing transitions
  [OrderStatus.FILLED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.REJECTED]: [],
};
```

## API Status Mapping Logic

```typescript
function mapApiStatusToInternal(apiOrder: OpenOrder): OrderStatus {
  const apiStatus = apiOrder.status?.toLowerCase() || 'live';
  const originalSize = Number(apiOrder.original_size) || 0;
  const sizeMatched = Number(apiOrder.size_matched) || 0;

  if (apiStatus === 'matched') {
    if (sizeMatched >= originalSize) return OrderStatus.FILLED;
    if (sizeMatched > 0) return OrderStatus.PARTIALLY_FILLED;
    return OrderStatus.OPEN; // API inconsistency fallback
  }

  if (apiStatus === 'live') {
    if (sizeMatched > 0) {
      return sizeMatched >= originalSize
        ? OrderStatus.FILLED
        : OrderStatus.PARTIALLY_FILLED;
    }
    return OrderStatus.OPEN;
  }

  if (apiStatus === 'delayed') return OrderStatus.PENDING;
  if (apiStatus === 'cancelled') return OrderStatus.CANCELLED;
  if (apiStatus === 'expired') return OrderStatus.EXPIRED;

  return OrderStatus.OPEN; // Unknown status fallback
}
```

## State Categories

### Active States (can still change)
- PENDING
- OPEN
- PARTIALLY_FILLED

### Terminal States (final, no more changes)
- FILLED
- CANCELLED
- EXPIRED
- REJECTED

### Cancellable States
- OPEN
- PARTIALLY_FILLED

## Helper Functions

```typescript
// Check if order is in active state
function isActiveStatus(status: OrderStatus): boolean {
  return status === OrderStatus.PENDING ||
         status === OrderStatus.OPEN ||
         status === OrderStatus.PARTIALLY_FILLED;
}

// Check if order is terminal
function isTerminalStatus(status: OrderStatus): boolean {
  return status === OrderStatus.FILLED ||
         status === OrderStatus.CANCELLED ||
         status === OrderStatus.EXPIRED ||
         status === OrderStatus.REJECTED;
}

// Check if order can be cancelled via API
function canOrderBeCancelled(status: OrderStatus): boolean {
  return status === OrderStatus.OPEN ||
         status === OrderStatus.PARTIALLY_FILLED;
}
```

## Order Type Lifecycles

### GTC (Good Till Cancelled)
```
Place → PENDING → OPEN → [fills] → FILLED
                      └→ [cancel] → CANCELLED
```

### GTD (Good Till Date)
```
Place → PENDING → OPEN → [fills] → FILLED
                      └→ [expire] → EXPIRED
                      └→ [cancel] → CANCELLED
```

### FOK (Fill Or Kill)
```
Place → PENDING → FILLED (immediate full fill)
              └→ CANCELLED (no immediate fill)
```

### FAK (Fill And Kill)
```
Place → PENDING → FILLED (partial ok, rest cancelled)
              └→ CANCELLED (no fill at all)
```

## Important Notes

1. **PENDING is local-only**: The API returns `delayed` rarely; most orders go directly to `live`
2. **REJECTED never reaches API**: This is a local-only state for validation failures
3. **Same-status transitions are valid**: Order staying in same state is a no-op
4. **Check original_size vs size_matched**: This is how to distinguish partial from full fill
