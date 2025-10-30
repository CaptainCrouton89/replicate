# Replicate Predictions & Webhooks LLM Reference

## Critical Function Signatures

### Create Prediction (Async - Default)
```
POST /v1/predictions
Authorization: Bearer $REPLICATE_API_TOKEN
Content-Type: application/json

{
  "version": string,                    // Required: model version ID
  "input": object,                      // Required: model input parameters
  "webhook": string,                    // Optional: webhook URL for notifications
  "webhook_events_filter": string[],    // Optional: ["start","output","logs","completed"]
  "stream": boolean,                    // Optional: Default false. Enable SSE streaming
}

Response: {
  "id": string,                         // Unique prediction ID
  "status": "starting",                 // Initial state (or "processing", etc.)
  "version": string,
  "input": object,
  "output": null,                       // null in async, populated at completion
  "error": null,
  "urls": {
    "get": string,                      // GET endpoint to poll prediction
    "cancel": string,                   // POST endpoint to cancel
    "stream": string,                   // (only if stream=true) SSE stream URL
    "web": string,                      // Browser-shareable prediction link
  },
  "created_at": string,                 // ISO 8601 timestamp
  "started_at": string | null,
  "completed_at": string | null,
}
```

### Create Prediction (Sync Mode)
```
POST /v1/predictions
Authorization: Bearer $REPLICATE_API_TOKEN
Prefer: wait=60                         // Default: 60 seconds. Max: ~300 but timeout-prone
Content-Type: application/json

{
  "version": string,
  "input": object,
  // ... other fields ...
}

Response:
- If completes within timeout: Prediction with "status": "succeeded", "output": <result>
- If times out: Returns with "status": "starting" or "processing"
```

### Get Prediction (Polling)
```
GET /v1/predictions/{prediction_id}
Authorization: Bearer $REPLICATE_API_TOKEN

Response: Complete prediction object (same shape as create response)
```

### Cancel Prediction
```
POST /v1/predictions/{prediction_id}/cancel
Authorization: Bearer $REPLICATE_API_TOKEN

Response: Prediction with "status": "canceled"
```

### Get Webhook Secret (For Verification)
```
GET /v1/webhooks/default/secret
Authorization: Bearer $REPLICATE_API_TOKEN

Response: {
  "key": "whsec_..." // Base64, cache this locally
}
```

## Prediction Lifecycle States

### Active States
- **starting**: Initial phase, may involve cold boot (lasts few seconds typically)
- **processing**: Model's predict() method is actively running

### Terminal States (Final)
- **succeeded**: Completed successfully, output available
- **failed**: Error occurred during execution
- **canceled**: User-terminated or deadline exceeded after starting
- **aborted**: Deadline exceeded BEFORE execution began (no charges)

### Status Transition Rules
- Cannot go backwards (no regression in status)
- Only `completed` webhook fired after terminal state reached
- Ignore all webhooks after first terminal state webhook

## Webhook Configuration

### Event Types & Throttling
```
webhook_events_filter options:
- "start":     Fires when prediction begins (NO throttling, always sent)
- "output":    Fires on new output (throttled: max 1 per 500ms)
- "logs":      Fires on log output (throttled: max 1 per 500ms)
- "completed": Fires at terminal state (NO throttling, always sent)
```

**Critical**: If webhook_events_filter omitted, defaults to ["output", "completed"]

### Webhook Request Headers
```
POST {your_webhook_url}
Content-Type: application/json
webhook-id: {unique_message_id}         // Consistent across retries
webhook-timestamp: {seconds_since_epoch}
webhook-signature: v1,{signature} v2,{signature}  // Multiple versions allowed

Body: Complete prediction JSON object (identical to GET response)
```

### Webhook Request Body
```json
{
  "id": string,
  "status": string,                     // "starting", "processing", "succeeded", "failed", "canceled", "aborted"
  "version": string,
  "input": object,
  "output": any | null,                 // null until succeeded
  "error": string | null,               // Non-null if failed
  "urls": { ... },
  "created_at": string,
  "started_at": string | null,
  "completed_at": string | null,
}
```

## Webhook Verification (HMAC-SHA256)

### Signature Validation Process
```javascript
// 1. Extract signing key
const secret = response.key; // e.g., "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD"
const keyMaterial = secret.replace("whsec_", ""); // Remove prefix
const keyBytes = Buffer.from(keyMaterial, 'base64');

// 2. Construct signed content (RAW request body, no modifications)
const signedContent = `${webhookId}.${webhookTimestamp}.${rawRequestBody}`;

// 3. Compute HMAC-SHA256
const computed = crypto
  .createHmac('sha256', keyBytes)
  .update(signedContent)
  .digest('base64');

// 4. Extract signature from header (remove version prefix: "v1,")
const signatures = webhookSignature.split(' ').map(s => {
  const [version, sig] = s.split(',');
  return sig;
});

// 5. Constant-time comparison (prevent timing attacks)
const isValid = signatures.some(sig =>
  crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(sig)
  )
);

// 6. Verify timestamp (prevent replay attacks)
const now = Math.floor(Date.now() / 1000);
const tolerance = 300; // 5 minutes
if (Math.abs(now - webhookTimestamp) > tolerance) {
  throw new Error('Webhook timestamp too old');
}
```

## Webhook Retry & Idempotency

### Retry Behavior
- **Non-terminal webhooks** (start, output, logs): NOT retried
- **Terminal webhooks** (completed): Exponentially retried with last attempt ~1 minute after completion
- Your endpoint MUST respond with 2xx status within seconds or retry occurs

### Idempotency Requirements
```
Critical: Make handlers idempotent
- webhook-id constant across retries (use as deduplication key)
- Identical webhooks can arrive multiple times
- Webhooks for single prediction may arrive out-of-order
- Must ignore/discard events after terminal webhook
- Must ignore status regressions (e.g., succeeded → processing)
```

## Streaming Output (SSE)

### Enable Streaming
```
POST /v1/predictions
{
  "version": string,
  "input": object,
  "stream": true,                       // Enable streaming
}

Response includes:
{
  "urls": {
    "stream": "https://api.replicate.com/v1/predictions/{id}/stream"
  }
}
```

### Stream Event Types
```
Event: output
Data: "text chunk or data"

Event: error
Data: {"detail": "Error message"}

Event: done
Data: {}                  // Successful completion

Event: done
Data: {"reason": "canceled"}

Event: done
Data: {"reason": "error"}

Stream Timeout: 30 seconds (408 error after)
API Prediction Expiration: 1 hour
```

## Prediction Deadlines & Cancellation

### Set Deadline (Auto-Cancel)
```
POST /v1/predictions
Cancel-After: {duration}                // Format: 5s, 10m, 1h
                                        // Range: 5 seconds to 24 hours
                                        // Auto-cancels if not complete
```

### Cancellation Results
```
If deadline exceeded BEFORE starting:
- Status: "aborted"
- Billing: NO CHARGE

If deadline exceeded DURING execution:
- Status: "canceled"
- Billing: Charge for elapsed time only
```

## Rate Limits & Constraints

```
POST /v1/predictions (create): 600 req/min
All other endpoints:              3000 req/min

Input file handling:
- URLs (>256KB): Pass as HTTP/HTTPS URL strings
- Inline data (<256KB): Pass as data URLs (data:image/png;base64,...)

Prediction timeout: 30 minutes max (30 days available with support)
API data retention: Deleted after 1 hour (use webhooks to persist)
Webhook URLs: No redirects followed (must resolve directly)
```

## Polling Strategy

### Async Polling (Recommended for Long Tasks)
```
1. POST /v1/predictions (create, no Prefer header)
2. GET /v1/predictions/{id} (initial check)
3. If status not terminal: sleep 1-2 seconds, repeat step 2
4. Continue until status in ["succeeded", "failed", "canceled", "aborted"]

Polling interval: 1-2 seconds recommended
Max polling duration: 30+ minutes
```

### Sync Mode with Timeout (Recommended for <60s Tasks)
```
POST /v1/predictions
Prefer: wait=60                         // Holds connection, returns when done or timeout
                                        // Range: 1-300, but higher values prone to timeout
                                        // Default: 60 seconds

If times out: Returns with status "starting"/"processing"
Then switch to polling or webhooks
```

### Long-Wait Anti-Pattern
❌ Avoid `Prefer: wait=300` (5 minutes)
- Network infrastructure timeouts typical at 30-120 seconds
- 300+ second waits will timeout and return incomplete prediction
- Use polling + webhooks instead for long-running models

## Non-Obvious Behaviors & Gotchas

### Webhook Uniqueness Constraints
- Same webhook URL can receive multiple events per prediction
- Multiple predictions can use same webhook URL
- `webhook-id` uniqueness scoped to single prediction, NOT globally unique
- Use `{prediction_id, webhook-id}` tuple for deduplication

### Status & Output Timing
- `output` field always null until `status` is "succeeded"
- `started_at` may be null for quick predictions
- `completed_at` populated only in terminal states
- Multiple output events possible; accumulate in order

### Webhook Event Sequencing
```
Typical order: start → [output...] → completed
But out-of-order delivery is possible:
- start may arrive after output
- completed may arrive before final output
- Always validate status field, not event type, for state
```

### File Input/Output Handling
```
Input files:
- Large files (>256KB): Pass URL string (e.g., "https://example.com/image.png")
- Small data (<256KB): Pass data URL (e.g., "data:image/png;base64,...")
- Invalid file types or corrupted data cause E9825 errors

Output files:
- Returned as URLs in output field
- URLs expire after 1 hour
- Must be captured via webhook or polling before expiration
```

### Error Codes (Common)
```
E1001: Out of memory - reduce input size or try model variant
E6716: Timeout starting - retry during off-peak hours
E8765: Health check failed - try different model version
E9243: Invalid input/startup error - verify parameters
E9825: File upload issues - check size/format/network
```

### Cancellation Edge Cases
```
- Cannot cancel aborted predictions (deadline already passed)
- Canceling failed predictions returns error
- Cancel request idempotent (safe to retry)
- Canceled predictions still accumulate time charges
```

### Streaming + Sync Interaction
```
If stream=true AND Prefer: wait specified:
- stream URL returned immediately (connection not held)
- Use stream URL for output
- Prefer: wait ignored when streaming
```

## Common Implementation Patterns

### Pattern: Robust Polling Loop
```javascript
async function pollPrediction(id, maxWaitMs = 1800000) {
  const startTime = Date.now();
  const terminalStates = ["succeeded", "failed", "canceled", "aborted"];

  while (Date.now() - startTime < maxWaitMs) {
    const pred = await getPrediction(id);

    if (terminalStates.includes(pred.status)) {
      return pred;
    }

    // Avoid thundering herd on short intervals
    await sleep(Math.min(2000, (Date.now() - startTime) / 100));
  }

  throw new Error("Prediction timeout");
}
```

### Pattern: Webhook Deduplication
```javascript
const processedWebhooks = new Set(); // Use persistent store in production

function handleWebhook(req) {
  const dedupeKey = `${req.body.id}-${req.headers['webhook-id']}`;

  if (processedWebhooks.has(dedupeKey)) {
    return 200; // Already processed
  }

  // Verify signature (prevents duplicate processing of fake webhooks)
  if (!verifyWebhookSignature(req)) {
    return 401;
  }

  // Process only once
  processedWebhooks.add(dedupeKey);
  processWebhookPayload(req.body);

  return 200;
}
```

### Pattern: Hybrid Sync + Webhook
```javascript
async function createPrediction(input, webhookUrl) {
  // Start with sync mode for fast models
  const syncResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Prefer': 'wait=10', // Short timeout
    },
    body: JSON.stringify({
      version,
      input,
      webhook: webhookUrl,
      webhook_events_filter: ["completed"],
    }),
  });

  const pred = await syncResponse.json();

  // If completed in 10s, done
  if (pred.status === "succeeded") {
    return pred.output;
  }

  // Otherwise, wait for webhook (prevents polling)
  return new Promise((resolve) => {
    webhookManager.once(pred.id, (final) => resolve(final.output));
    setTimeout(() => resolve(null), 1800000); // 30min fallback
  });
}
```

## API Response Status Codes

```
200 OK: Successful GET/prediction created and completed
201 Created: Prediction created (async)
401 Unauthorized: Invalid token
402 Payment Required: Account credits insufficient
404 Not Found: Prediction or version doesn't exist
429 Too Many Requests: Rate limit exceeded (back off exponentially)
500+ Server Error: Replicate infrastructure issue (retry with backoff)
```

## Version: Latest (October 2025)

Recent updates:
- Prediction deadlines added (Cancel-After header)
- Streaming output via SSE widely available
- Webhook event filtering granular (start, output, logs, completed)
- Sync mode stable with Prefer: wait support
- HMAC-SHA256 signature verification required for security
