# Replicate Streaming LLM Reference

## Critical Signatures

### Python Client Stream

```python
def stream(
    ref: str,                           # Model ref: "owner/model-name:version" or "owner/model-name"
    *,
    input: Optional[Dict[str, Any]],   # Model inputs dictionary
    use_file_output: Optional[bool] = True,  # Auto-upload local file outputs
    **params                            # Additional CreatePredictionParams (webhook, webhook_events_filter)
) -> Iterator[ServerSentEvent]
```

Async variant: `async_stream()` → `AsyncIterator[ServerSentEvent]`

### JavaScript/TypeScript Client Stream

```typescript
for await (const event of replicate.stream(
    identifier: string,                 // Model identifier: "owner/model-name" or URL
    options: {
        input: Record<string, unknown>; // Model input parameters
        webhook?: string;               // Optional webhook URL for events
        webhook_events_filter?: string[]; // Event types: "start" | "output" | "logs" | "completed"
    }
)) {
    // event is ServerSentEvent
}
```

Returns: `AsyncGenerator<ServerSentEvent, void>`

### HTTP API - Create Prediction with Streaming

```
POST https://api.replicate.com/v1/predictions
Authorization: Bearer $REPLICATE_API_TOKEN

{
    "version": "string (UUID)",        // Model version UUID
    "input": {...},                    // Model inputs
    "stream": true,                    // REQUIRED: Enable streaming
    "webhook": "https://...",          // Optional callback URL
    "webhook_events_filter": [         // Optional: Filter events
        "start",                       // Fires when prediction starts
        "output",                      // Fires when output generated (throttled 500ms)
        "logs",                        // Fires when logs written (throttled 500ms)
        "completed"                    // Fires on terminal state
    ]
}
```

Response includes:
```json
{
    "id": "prediction-uuid",
    "status": "starting",
    "urls": {
        "stream": "https://stream.replicate.com/v1/stream/...",
        "get": "https://api.replicate.com/v1/predictions/...",
        "web": "https://replicate.com/p/...",
        "cancel": "https://api.replicate.com/v1/predictions/.../cancel"
    },
    "output": null,
    "error": null
}
```

## ServerSentEvent Types & Formats

### Event: `output`
```
event: output
data: "token_text_here"
```
Plain text chunk. Multiple events concatenate to form complete output. No JSON wrapping.

### Event: `done`
```
event: done
data: {"reason": "success"}
```
Signals stream completion. Reasons: `"success"` | `"error"` | `"canceled"`

### Event: `error`
```
event: error
data: {"detail": "Human-readable error message"}

event: done
data: {"reason": "error"}
```
Error event precedes `done` event with `"reason": "error"`. Always paired.

### Event: (Timeout)
```
408 Request Timeout
```
Plain text, not JSON. Indicates 30-second timeout exceeded.

## Configuration Shapes

### Python Prediction.stream() Parameters

```python
replicate.predictions.create(
    model="meta/meta-llama-3-70b-instruct",
    version="string-uuid-optional",  # Optional: specific version
    input={},                         # Required: model inputs
    stream=True,                      # Required: enable streaming
    webhook="https://example.com/webhook",  # Optional: webhook URL
    webhook_events_filter=[           # Optional: event filtering
        "start",                      # or "output", "logs", "completed"
    ]
)
# Returns: Prediction object with .stream() async method
```

### Webhook Event Filtering

```python
webhook_events_filter = [
    "start",      # Fires once when prediction begins processing
    "output",     # Fires each output generation (max frequency: 500ms)
    "logs",       # Fires each log line (max frequency: 500ms)
    "completed"   # Fires once on terminal state (succeeded/failed/canceled)
]
# Note: "start" and "completed" ignore 500ms throttling
# "output" and "logs" events may be coalesced if rapid
```

### Stream Endpoint URL Structure

```
https://stream.replicate.com/v1/stream/{prediction_id}
```

No authentication needed for stream endpoint—prediction ID acts as access token. Expires when prediction expires (1 hour).

## Non-Obvious Behaviors

### Streaming Timeout Behavior
- **Hard timeout: 30 seconds** on stream endpoint connections
- Triggered if: (1) connecting after prediction deleted, (2) client doesn't close connection after `done` event, (3) prediction expires (1-hour max)
- Response: Plain text event `"408 Request Timeout"`—NOT JSON
- Must close connection after `done` event or timeout will occur on next connection attempt

### Stream Endpoint Access & Expiration
- Stream URL valid only while prediction exists
- Prediction expires **1 hour after creation**, regardless of status
- Stream URLs are semi-public—prediction ID is secret, not traditional auth token
- Each stream connection is independent; multiple clients can consume same stream

### Event Output Throttling Rules
- `"output"` and `"logs"` webhooks: throttled to **max 1 per 500ms**
- `"start"` and `"completed"`: always sent immediately, no throttling
- Tokens may batch together if generation rate exceeds 2 tokens/second
- No guarantee of token-per-event granularity—single event may contain multiple tokens

### Model Version Specificity
- Stream support varies by model version—not all versions support streaming
- Omitting `version` uses latest version (may change behavior unexpectedly)
- Always specify explicit version UUID for production (immutable behavior)

### File Output Handling in Streams
- Python client: `use_file_output=True` (default) auto-uploads output files to Replicate
- Output URLs included in final prediction object, not streamed
- Large files (>256KB) must use HTTP URLs as input, not data URLs

### Retry Strategy on Stream Failures
- Stream connection failures don't auto-retry in client libraries
- HTTP status 429/503/504 on initial prediction creation: auto-retry with exponential backoff (max 10 attempts)
- Stream endpoint failures: client responsible for retry logic
- Idempotent: safe to retry failed streams; connecting to existing stream from multiple clients is safe

### Webhook Request Behavior
- Webhook requests are **fire-and-forget** (non-blocking)
- Your endpoint must respond with **2xx status within few seconds**
- Failed webhooks retry multiple times—endpoint must handle idempotency (same event may arrive >1x)
- Webhook payload is full Prediction object (same as GET /predictions/{id}), not just the event data

### Polling vs. Streaming Trade-offs
- **Streaming**: Real-time, higher resource use, connection management overhead
- **Polling**: Simpler implementation, higher latency, respects rate limits more gracefully
- Polling interval configurable: `REPLICATE_POLL_INTERVAL` env var (default: 0.5s)
- Streaming recommended for <10 second predictions; polling for longer-running tasks

### Error Event Pairing
- Error events **always paired**: `error` event followed by `done` event with `reason: "error"`
- Parsing: consume `error` event for detail, then expect `done` with `reason: "error"`
- Do not treat `error` event as terminal—must receive `done` event

## HTTP Headers & Authentication

### Request Headers
```
Authorization: Bearer $REPLICATE_API_TOKEN
Content-Type: application/json
Prefer: wait                    # Optional: wait up to 60s for completion (non-streaming)
```

### Response Headers (Streaming Connection)
```
Content-Type: text/event-stream
Transfer-Encoding: chunked
Cache-Control: no-cache
```

### Rate Limits
```
X-RateLimit-Limit: 600        # Predictions endpoint
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1698765432

X-RateLimit-Limit: 3000       # Other endpoints
```

- Predictions: 600 req/min
- Other endpoints: 3,000 req/min
- HTTP 429: throttled, includes `Retry-After` header

## Integration Patterns

### Pattern: Python Stream to Stdout
```python
import replicate

for event in replicate.stream(
    "meta/meta-llama-3-70b-instruct",
    input={"prompt": "Write a haiku"}
):
    print(str(event), end="")
```

### Pattern: Python Stream with Prediction ID
```python
prediction = replicate.predictions.create(
    model="meta/meta-llama-3-70b-instruct",
    input={"prompt": "..."},
    stream=True
)
# Can access prediction.id independently
for event in prediction.stream():
    print(str(event), end="")
```

### Pattern: JavaScript Stream with Async/Await
```javascript
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN
});

for await (const event of replicate.stream(
    "meta/meta-llama-3-70b-instruct",
    { input: { prompt: "..." } }
)) {
    process.stdout.write(event.toString());
}
```

### Pattern: EventSource (Browser) Direct Connection
```javascript
const stream = new EventSource(
    "https://stream.replicate.com/v1/stream/prediction-id"
);

stream.addEventListener("output", (event) => {
    console.log(event.data); // Plain text token
});

stream.addEventListener("done", (event) => {
    const data = JSON.parse(event.data);
    console.log("Reason:", data.reason);
    stream.close();
});

stream.addEventListener("error", (event) => {
    const data = JSON.parse(event.data);
    console.error(data.detail);
});
```

### Pattern: Webhook Event Filtering (Output Only)
```python
replicate.predictions.create(
    model="meta/meta-llama-3-70b-instruct",
    input={...},
    stream=True,
    webhook="https://yourapp.com/webhook",
    webhook_events_filter=["output"]  # Only output events
)
```

## Common Gotchas & Constraints

1. **Stream timeout not connection timeout**: 30-second limit applies to *inactivity* on stream, not total duration. Activity resets timer.

2. **Connection must close after `done`**: Leaving connection open after `done` event will trigger 408 timeout on next stream attempt. Always call `stream.close()` in browser or exit loop in CLI.

3. **Version changes break consistency**: Models constantly update. Explicit version UUID required for reproducible behavior.

4. **Event order guarantees**: `output` events always precede `done`. Error event always precedes done with matching reason. No interleaving.

5. **Webhook payload size**: Full prediction object (can be large if many logs/outputs). Consider log pruning for high-volume predictions.

6. **Stream endpoint is public** (prediction ID is secret): Don't expose prediction IDs in logs/error messages. Treat as sensitive.

7. **File outputs not streamed**: Use webhooks + final GET request to retrieve output file URLs, or poll.

8. **Streaming unavailable on older model versions**: Always test model version with `?_only_show_available=true` filter or check docs.

9. **Multiple concurrent streams per prediction**: Safe and supported. Each client gets independent stream copy. Useful for multiple consumers (UI update + backend logging).

10. **Retry logic is NOT built-in**: Stream connection failures require manual retry. Catching `StreamError` and retrying safely is common pattern.

## Supported Models for Streaming

Check `/collections/streaming-language-models` for current list. Typically includes:
- Meta Llama 3.1 (8B, 70B, 405B)
- Recent Llama variants
- Some fine-tuned LLM versions

Streaming support is **model-version specific**—not all versions of a model support streaming.

## Version: 2025-10 (Latest)

Last updated: October 29, 2025 based on official Replicate documentation
