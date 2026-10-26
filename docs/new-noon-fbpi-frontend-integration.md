# New Noon + FBPI frontend integration

This document is the frontend contract for Connecto's New Noon and Fulfilled by Partner (FBPI) backend. It describes the production, multi-user integration. It is not limited to user 35.

## 1. Core rules

1. Authenticate with the signed-in Connecto user's normal access token.
2. Never send a `user_id` in a URL, query string, header, or request body.
3. The backend reads `user_id` from the verified JWT and scopes Noon credentials, cache entries, notifications, snapshots, shipments, AWBs, and SKU mappings to that user.
4. Always send the warehouse selected from the connected user's warehouse list. Do not use `W00172296EG` as a production default.
5. Treat `DATABASE_FALLBACK` order data as read-only/stale until a live Noon refresh succeeds.
6. Never store Noon private keys, integrator credentials, dashboard passwords, or backend JWT secrets in frontend code or `VITE_*` variables.

## 2. Base URL and authentication

Configure the service URL through the frontend environment:

```text
VITE_API_BASE_URL=https://<approved-production-api-host>/service1
```

The test environment currently uses:

```text
https://test.connecto-me.com/service1
```

All documented endpoints, except OAuth callbacks and the Noon webhook, require the platform access token:

```http
Authorization: Bearer <connecto-access-token>
Accept: application/json
Content-Type: application/json
```

The backend also accepts the platform `access_token` cookie. Cookie-based calls must use `credentials: "include"` and the approved CORS configuration.

### Do not use the test-dashboard login in production

`POST /new_noon/dashboard/session` is a test/standalone-dashboard utility. It maps a shared password to one configured backend user and is therefore inappropriate for the multi-user production platform.

The production frontend must reuse the access token created by the main Connecto login.

## 3. Recommended API client

```ts
const API_BASE = import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function newNoonRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const detail = payload?.detail;
    const message = typeof detail === "string"
      ? detail
      : payload?.message || payload?.raw || `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

export function postJson<T>(path: string, token: string, body: unknown) {
  return newNoonRequest<T>(path, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

Do not clear the Connecto login automatically for every `401`. A `401` may mean either:

- the Connecto token is missing/expired; or
- Noon rejected the connected account credentials and the user must reconnect Noon.

Authentication errors such as `Not authenticated - no token found` and `Invalid or expired token` indicate a Connecto session problem. A Noon-specific message should lead to the Noon reconnection flow.

## 4. Per-user ownership contract

The order list and order-detail responses include an ownership marker:

```json
{
  "storage_scope": {
    "type": "USER",
    "user_id": 123
  }
}
```

The frontend should reject database fallback rows without this marker:

```ts
type StorageScope = {
  type: "USER";
  user_id: number;
};

function isUserScoped(value: unknown): value is StorageScope {
  const scope = value as Partial<StorageScope> | null;
  return scope?.type === "USER" && Number.isInteger(scope.user_id);
}
```

The marker is a consistency check, not the authorization boundary. Authorization is enforced by the backend JWT and `WHERE user_id = authenticated_user_id` queries.

Frontend data caches must include the authenticated Connecto user identity in their query key and must be cleared on logout/account switch. Do not persist order snapshots in shared browser storage.

## 5. Noon account connection

### Get connection status

```http
GET /new_noon/oauth/connect
```

or:

```http
POST /new_noon/oauth/status
Content-Length: 0
```

Example response:

```json
{
  "connected": true,
  "account": {
    "id": 10,
    "user_id": 123,
    "account_name": "Noon - PRJ123",
    "key_id": "key-id",
    "channel_identifier": "channel-id",
    "project_code": "PRJ123",
    "oauth_request_id": "request-id",
    "credential_type": "seller",
    "issued_at": "2026-08-12T10:00:00Z",
    "created_at": "2026-08-12T10:00:00Z",
    "updated_at": "2026-08-12T10:00:00Z"
  }
}
```

`private_key` is never returned.

### Start OAuth

```http
GET /new_noon/oauth/authorize
```

This endpoint responds with a redirect to Noon OAuth. For top-level browser navigation, the production platform should use its authenticated `access_token` cookie because `window.location` cannot attach a Bearer header.

```ts
window.location.assign(`${API_BASE}/new_noon/oauth/authorize`);
```

OAuth callbacks are handled entirely by the backend:

- `/new_noon/oauth/callback`
- `/service1/new_noon/redirect`

Do not implement credential exchange in the frontend.

### Disconnect

```http
POST /new_noon/oauth/disconnect
Content-Length: 0
```

```json
{ "message": "Disconnected" }
```

After disconnecting, clear all frontend New Noon query caches for that user.

## 6. Warehouse selection

```http
POST /new_noon/warehouses/list
```

```json
{
  "filters": {
    "fulfillment_system_code": "fbpi"
  }
}
```

Pagination may also include `next_token`:

```json
{
  "next_token": "cursor-from-previous-response",
  "filters": {
    "fulfillment_system_code": "fbpi"
  }
}
```

Persist the selected warehouse only as a user preference. Always send its actual `warehouse_code` to order, stock, and shipment calls.

## 7. FBPI orders

### List orders

```http
GET /new_noon/fbpi/orders?warehouse_code=<code>&unread_only=false
```

Optional query parameters:

| Parameter | Type | Rules |
|---|---:|---|
| `warehouse_code` | string | Required by the frontend; backend has a test default that production must not rely on. |
| `created_after` | string | Optional ISO-8601 timestamp, maximum 40 characters. |
| `created_before` | string | Optional ISO-8601 timestamp, maximum 40 characters. |
| `limit` | integer | Optional, 1–500. Without it the backend follows Noon pagination until Noon ends it or repeats a cursor. |
| `unread_only` | boolean | Defaults to `false`. |

The backend deduplicates orders by `fbpi_order_nr`, stores successful live responses as per-user snapshots, and joins per-user notifications and shipments.

#### Live response

```json
{
  "orders": [
    {
      "order_nr": "NEGI80005397226-IO-1",
      "event_type": "FBPI::ORDER_SYNC",
      "is_read": false,
      "received_at": "2026-08-12T07:42:00",
      "updated_at": "2026-08-12T07:42:00",
      "available": true,
      "order": {
        "fbpi_order_nr": "NEGI80005397226-IO-1",
        "mp_code": "noon",
        "mp_order_nr": "NEGI80005397226",
        "mp_country_code": "eg",
        "customer_country_code": "eg",
        "merchant_code": "STR489497",
        "currency_code": "egp",
        "warehouse_code": "W00172296EG",
        "order_created_at": "2026-08-12T07:41:48",
        "product_skus": ["MAT-02"],
        "shipment_ids": ["CONN-NEGI80005397226IO1-1786529309623"],
        "shipments": [
          {
            "integration_shipment_nr": "CONN-NEGI80005397226IO1-1786529309623",
            "warehouse_code": "W00172296EG",
            "awb_nr": "PG70052971528E"
          }
        ],
        "items": [
          {
            "mp_item_nr": "NEGI80005397226-1",
            "partner_sku": "MAT-02",
            "mp_status": "MP_ITEM_STATUS_CONFIRMED",
            "integration_status": "INTEGRATION_ITEM_STATUS_ACKNOWLEDGED",
            "delivered_invoice_price": 475,
            "cancellation_reason_code": null
          }
        ]
      }
    }
  ],
  "total": 1,
  "unread_count": 1,
  "next_token": null,
  "pages_fetched": 2,
  "source": "NOON_FBPI_ORDER_LIST",
  "degraded": false,
  "fallback_reason": null,
  "snapshot_updated_at": null,
  "storage_scope": {
    "type": "USER",
    "user_id": 123
  }
}
```

Notification properties may be absent for orders that were returned by Noon but have no stored webhook notification. Treat them as optional.

#### Database fallback response

When Noon fails and this user has stored snapshots, the endpoint still returns `200`:

```json
{
  "orders": [
    {
      "order_nr": "NEGI80005397226-IO-1",
      "is_read": false,
      "order": {
        "fbpi_order_nr": "NEGI80005397226-IO-1",
        "warehouse_code": "W00172296EG",
        "product_skus": ["MAT-02"],
        "shipment_ids": ["CONN-NEGI80005397226IO1-1786529309623"],
        "shipments": [
          {
            "integration_shipment_nr": "CONN-NEGI80005397226IO1-1786529309623",
            "warehouse_code": "W00172296EG",
            "awb_nr": "PG70052971528E"
          }
        ],
        "items": [
          {
            "mp_item_nr": "NEGI80005397226-1",
            "partner_sku": "MAT-02"
          }
        ]
      }
    }
  ],
  "total": 1,
  "unread_count": 1,
  "next_token": null,
  "pages_fetched": 0,
  "source": "DATABASE_FALLBACK",
  "degraded": true,
  "fallback_reason": "New Noon API request failed with HTTP 504",
  "snapshot_updated_at": "2026-08-12T10:24:32",
  "storage_scope": {
    "type": "USER",
    "user_id": 123
  }
}
```

Recommended UI behavior:

- Render fallback rows only when `degraded === true`, `source === "DATABASE_FALLBACK"`, and `storage_scope` is valid.
- Show `snapshot_updated_at` and a visible stale-data warning.
- Disable Noon-mutating actions such as out-of-stock updates, AWB allocation, shipment creation, and cancellation while degraded. A live call could still work, but the displayed order state may be stale.
- Keep manual refresh available so the UI returns to live mode automatically.
- If Noon fails and no snapshot exists, the endpoint returns the original error instead of an empty successful response.

### Get one order

```http
GET /new_noon/fbpi/orders/<url-encoded-fbpi-order-number>
```

Live responses include:

```json
{
  "fbpi_order_nr": "NEGI80005397226-IO-1",
  "items": [],
  "source": "NOON_FBPI_ORDER_GET",
  "degraded": false,
  "storage_scope": { "type": "USER", "user_id": 123 }
}
```

Fallback responses include stored `product_skus`, `shipment_ids`, `shipments`, `fallback_reason`, and `snapshot_updated_at`, with `source = "DATABASE_FALLBACK"`.

### Mark notifications read

Mark selected orders:

```http
POST /new_noon/fbpi/orders/mark-read
```

```json
{
  "order_nrs": ["NEGI80005397226-IO-1"]
}
```

Mark all notifications owned by the signed-in user:

```json
{ "order_nrs": null }
```

Response:

```json
{
  "updated": 1,
  "unread_count": 0
}
```

### Mark an item out of stock

```http
POST /new_noon/fbpi/orders/update
```

```json
{
  "fbpi_order_nr": "NEGI80005397226-IO-1",
  "items": [
    {
      "mp_item_nr": "NEGI80005397226-1",
      "status": "UPDATE_ORDER_REQUEST_ITEM_STATUS_OUT_OF_STOCK"
    }
  ]
}
```

This is a Noon mutation. Do not send it from stale fallback state without first obtaining a live order response.

## 8. Shipment and AWB workflow

### Allocate Noon Logistics AWBs

```http
POST /new_noon/fbpi/shipments/awbs
```

```json
{
  "country_code": "eg",
  "qty": 2
}
```

Supported country codes are `eg`, `ae`, and `sa`. Quantity must be 1–1000.

Noon's response is passed through. Depending on the upstream response version, AWBs may be under `awbs` or `items`, and the identifier may be `awb_nr` or `awb`.

```ts
function extractAwbs(payload: any) {
  const rows = payload?.awbs || payload?.items || [];
  return rows
    .map((row: any) => ({
      courier: row.courier || "noon",
      awb_nr: row.awb_nr || row.awb,
    }))
    .filter((row: any) => row.awb_nr);
}
```

### Create one shipment

```http
POST /new_noon/fbpi/shipments
```

```json
{
  "warehouse_code": "W00172296EG",
  "integration_shipment_nr": "CONN-NEGI80005397226IO1-1786529309623",
  "fbpi_order_nr": "NEGI80005397226-IO-1",
  "awbs": [
    {
      "courier": "noon",
      "awb_nr": "PG70052971528E"
    }
  ],
  "items": [
    { "mp_item_nr": "NEGI80005397226-1" }
  ]
}
```

Use a stable, unique `integration_shipment_nr`. Do not use the AWB as the shipment number.

The backend returns Noon's response plus the canonical submitted mapping:

```json
{
  "integration_shipment_nr": "CONN-NEGI80005397226IO1-1786529309623",
  "awb_nr": "PG70052971528E",
  "connecto_tracking_saved": true
}
```

If `connecto_tracking_saved` is `false`, Noon accepted the shipment but Connecto could not persist the shipment/AWB mapping. Show a warning and do not blindly retry shipment creation; retrieve the shipment first.

### Create shipments in bulk

```http
POST /new_noon/fbpi/shipments/bulk
```

```json
{
  "shipments": [
    {
      "warehouse_code": "W00172296EG",
      "integration_shipment_nr": "CONNECTO-SHIPMENT-1",
      "fbpi_order_nr": "NEGI80005397226-IO-1",
      "awbs": [{ "courier": "noon", "awb_nr": "PG70052971528E" }],
      "items": [{ "mp_item_nr": "NEGI80005397226-1" }]
    }
  ]
}
```

Maximum 100 shipments. The backend runs at most five Noon creations concurrently and reports every shipment independently:

```json
{
  "results": [
    {
      "fbpi_order_nr": "NEGI80005397226-IO-1",
      "integration_shipment_nr": "CONNECTO-SHIPMENT-1",
      "awb_nr": "PG70052971528E",
      "success": true,
      "connecto_tracking_saved": true,
      "response": {}
    },
    {
      "fbpi_order_nr": "NEGI80000000000-IO-1",
      "integration_shipment_nr": "CONNECTO-SHIPMENT-2",
      "success": false,
      "message": "Noon error message"
    }
  ]
}
```

Do not treat HTTP `200` for the bulk endpoint as success for every row. Inspect each result's `success` property.

### Get a shipment

```http
POST /new_noon/fbpi/shipments/get
```

```json
{
  "warehouse_code": "W00172296EG",
  "integration_shipment_nr": "CONNECTO-SHIPMENT-1"
}
```

The response is Noon's shipment object plus `connecto_tracking_saved`. A successful lookup also repairs the per-user order-to-shipment mapping when Noon returns `fbpi_order_nr`.

### Cancel a shipment

```http
POST /new_noon/fbpi/shipments/cancel
```

```json
{
  "warehouse_code": "W00172296EG",
  "integration_shipment_nr": "CONNECTO-SHIPMENT-1"
}
```

The backend attempts to retrieve and persist the order mapping before cancellation. A failed lookup does not block a valid cancellation request.

## 9. Order and item states

Useful Noon values currently exposed to the frontend:

| Field | Values |
|---|---|
| `mp_status` | `MP_ITEM_STATUS_UNSPECIFIED`, `MP_ITEM_STATUS_CONFIRMED`, `MP_ITEM_STATUS_CANCELLED` |
| `integration_status` | `INTEGRATION_ITEM_STATUS_UNSPECIFIED`, `INTEGRATION_ITEM_STATUS_ACKNOWLEDGED`, `INTEGRATION_ITEM_STATUS_OUT_OF_STOCK`, `INTEGRATION_ITEM_STATUS_SHIPPED` |

Recommended derived order states:

- All shipped → `shipped`.
- All out of stock → `out_of_stock`.
- All cancelled → `cancelled`.
- All confirmed and acknowledged → `ready`.
- All unspecified → `pending`.
- Mixed cancelled/out-of-stock → `attention`.
- Other mixed states → `processing`.

Use `product_skus` as the normalized SKU list. For compatibility, merge it with `items[].partner_sku` and remove duplicates.

Use `shipments` as the canonical mapping. `shipment_ids` is a convenience/compatibility list.

## 10. Other New Noon operations

These authenticated endpoints proxy the connected user's Noon account. Unless noted otherwise, their successful response is Noon's JSON object and may gain additional fields over time.

| Method | Path | Request body |
|---|---|---|
| `POST` | `/new_noon/stock/get` | `{ items: [{ warehouse_code, partner_sku }] }` |
| `POST` | `/new_noon/stock/update` | `{ items: [{ warehouse_code, partner_sku, qty?, processing_time? }] }` |
| `GET` | `/new_noon/reports/export-categories` | None |
| `POST` | `/new_noon/reports/exports` | `{ export_category_code, params }` |
| `POST` | `/new_noon/reports/export-status` | `{ export_code }` |
| `POST` | `/new_noon/pricing/get` | `{ items: [{ partner_sku, country_code }] }` |
| `POST` | `/new_noon/pricing/upsert` | `{ items: [{ partner_sku, country_code, price?, msrp?, is_active? }] }` |
| `POST` | `/new_noon/cross-border/products/upsert` | `{ items: [{ partner_sku, dimensions_cm?, vm_weight_cm?, actual_weight_kg?, hs_code? }] }` |
| `POST` | `/new_noon/cross-border/transfer-prices/get` | `{ items: [{ partner_sku }] }` |
| `POST` | `/new_noon/cross-border/transfer-prices/upsert` | `{ items: [{ partner_sku, transfer_price_usd?, msrp_usd?, is_active? }] }` |
| `POST` | `/new_noon/catalog/barcodes/map` | `{ items: [{ barcode, partner_sku, force_map? }] }` |
| `POST` | `/new_noon/catalog/skus/batch-map` | `{ items: [{ partner_sku, nsku_child, force_map? }] }` |
| `POST` | `/new_noon/catalog/parent-skus/delete` | `{ items: [{ parent_partner_sku, zsku_parent }] }` |
| `POST` | `/new_noon/catalog/child-skus/delete` | `{ items: [{ partner_sku, zsku_child }] }` |
| `POST` | `/new_noon/catalog/imports/signed-url` | `{ file_type }` |
| `POST` | `/new_noon/catalog/imports/barcodes` | See barcode import below. |
| `GET` | `/new_noon/catalog/imports/<reference>` | None |
| `POST` | `/new_noon/products/categories` | `{}` |
| `POST` | `/new_noon/products/category-attributes` | `{ category_code }` |
| `POST` | `/new_noon/products/upsert` | See product upsert below. |
| `POST` | `/new_noon/products/content` | `{ sku_parent }` |
| `POST` | `/new_noon/returns/references/list` | `{ barcode, merchant_codes? }` |

Country codes are `eg`, `ae`, or `sa`. Prices and weights must be non-negative.

### Barcode import

Provide exactly one of `file_url`, `bq_table`, or `items`:

```json
{
  "items": {
    "data": [
      {
        "partner_sku": "SKU-1",
        "barcode": "6220000000000",
        "force_sync": false
      }
    ]
  },
  "config": {
    "is_notification_required": true,
    "force_sync": false
  },
  "client_reference": "connecto-import-123"
}
```

Supported `file_type` values for signed URLs are:

- `FILE_TYPE_CSV`
- `FILE_TYPE_TSV`
- `FILE_TYPE_JSON`
- `FILE_TYPE_XLSX`
- `FILE_TYPE_XLSM`
- `FILE_TYPE_PARQUET`

### Product upsert

```json
{
  "skus": [{ "partner_sku": "SKU-1", "size": "M" }],
  "brand": "Brand name",
  "category": "category-code",
  "images": [{ "url": "https://example.com/image.jpg", "sort": 1 }],
  "attributes": {
    "title": {
      "values": [
        { "value": "Product title", "language": "LANGUAGE_EN", "sort": 1 }
      ]
    }
  }
}
```

## 11. Validation and errors

Typical response statuses:

| Status | Meaning |
|---:|---|
| `200` | Successful request, including a successful database fallback. |
| `303` | Successful OAuth callback redirect. |
| `400` | Missing OAuth callback parameters or Noon validation failure. |
| `401` | Connecto session invalid, or connected Noon credentials rejected. |
| `404` | No connected New Noon account, unknown resource, or missing stored fallback. |
| `422` | FastAPI request validation failed. `detail` is usually an array. |
| `502` | Noon login, upstream 5xx, network failure, or invalid upstream response. |
| `503` | Test-dashboard access is not configured. |

String error example:

```json
{ "detail": "New Noon API request failed with HTTP 504" }
```

Validation example:

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "warehouse_code"],
      "msg": "Field required"
    }
  ]
}
```

The frontend error parser must handle both string and array `detail` values.

## 12. Cache and refresh behavior

- The backend caches selected successful Noon reads per user, credentials, project, method, path, and payload.
- Order-list pages use a five-second cache to deduplicate simultaneous refreshes.
- Category hierarchy uses a 24-hour cache.
- Other cached read operations generally use the backend's standard five-minute TTL.
- Disconnecting/reconnecting Noon clears the affected user's backend credentials and response cache.
- Frontend auto-refresh should avoid overlapping requests and preserve the last successful render while refreshing.

## 13. Noon webhook (backend only)

The frontend does not call this endpoint:

```http
POST /noon/webhooks/fbpi-order-sync
```

Legacy alias:

```http
POST /noon/webhook
```

The webhook validates `x-api-key` or `x-connecto-webhook-key`, acknowledges with HTTP `200`, and stores one notification for every Connecto user whose Noon account matches `metadata.project_code`.

Example Noon event:

```json
{
  "event_type": "FBPI::ORDER_SYNC",
  "metadata": {
    "message_id": "message-123",
    "project_code": "PRJ123"
  },
  "payload": {
    "fbpi_order_nr": "NEGI80005397226-IO-1"
  }
}
```

Frontend order notifications should be obtained from `GET /new_noon/fbpi/orders`, not directly from the webhook.

## 14. Production integration checklist

- [ ] Production frontend uses the main Connecto access token, not `/dashboard/session`.
- [ ] `VITE_API_BASE_URL` points to the approved production service gateway.
- [ ] No frontend request sends or hardcodes `user_id`.
- [ ] Warehouse selection comes from `/warehouses/list` for the current user.
- [ ] Query/cache keys include the current Connecto user and are cleared on logout.
- [ ] Database fallback requires a valid `storage_scope` and shows its timestamp.
- [ ] Noon mutation controls are disabled while the order view is degraded.
- [ ] Bulk shipment results are evaluated row by row.
- [ ] `connecto_tracking_saved: false` is shown as a partial-success warning.
- [ ] OAuth uses the platform cookie for top-level navigation, or the backend contract is extended before using Bearer-only navigation.
- [ ] Error handling supports string and validation-array `detail` responses.
- [ ] Cross-user QA proves that orders, SKUs, notifications, shipment IDs, and AWBs never leak between users.
