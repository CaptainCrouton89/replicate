# Replicate Core API LLM Reference

## Critical Signatures

### Python Client Initialization
```python
import replicate
# Requires REPLICATE_API_TOKEN environment variable

# Custom client with specific API token
from replicate.client import Client
replicate = Client(api_token="r8_...")  # Tokens always start with r8_
```

### Prediction Execution Methods

```python
# Synchronous - blocks until complete or timeout
replicate.run(
    ref: str,  # "{owner}/{name}", "{owner}/{name}:{version_id}", or "{version_id}"
    input: Dict[str, Any],  # Model-specific parameters
    wait: int | False = 60,  # Timeout in seconds (1-3600), False disables sync
    use_file_output: bool = True,  # Returns FileOutput objects for files
    webhook: str = None,  # HTTPS URL for async notification
    webhook_events_filter: List[str] = None,  # ["start", "output", "logs", "completed"]
) -> Any

# Asynchronous - returns immediately with prediction ID
replicate.predictions.create(
    model: str,  # "{owner}/{name}"
    version: str,  # Version ID
    input: Dict[str, Any],  # Model-specific parameters
    webhook: str = None,
    webhook_events_filter: List[str] = None,
) -> Prediction

# Streaming - SSE for token-by-token output
replicate.stream(
    ref: str,
    input: Dict[str, Any] = None,
    use_file_output: bool = True,
) -> Iterator[ServerSentEvent]

# Async streaming variant
await replicate.async_stream(
    ref: str,
    input: Dict[str, Any] = None,
    use_file_output: bool = True,
) -> AsyncIterator[ServerSentEvent]
```

### Prediction Management

```python
prediction.reload()  # Refresh prediction state from API
prediction.wait()  # Block until prediction completes
prediction.cancel()  # Stop running prediction

prediction.id: str
prediction.status: str  # "starting", "processing", "succeeded", "failed", "canceled"
prediction.input: Dict[str, Any]
prediction.output: Any | None  # None until status is "succeeded"
prediction.error: str | None  # Error details if status is "failed"
prediction.created_at: str  # ISO 8601 timestamp
prediction.started_at: str | None
prediction.completed_at: str | None
prediction.metrics: {
    "predict_time": float,  # Seconds the model ran
    "total_time": float,  # Wall-clock time including queuing
}
prediction.urls: {
    "web": str,  # Shareable browser link
    "get": str,  # Polling endpoint
    "cancel": str,
    "stream": str | None,  # SSE endpoint if model supports streaming
}
```

### Model Discovery

```python
replicate.models.get(
    owner_name: str,  # "{owner}/{name}"
) -> Model

model.owner: str
model.name: str
model.description: str
model.visibility: str  # "public" or "private"
model.run_count: int
model.latest_version: Version

# Get specific version with OpenAPI schema
version = replicate.models.get(
    "{owner}/{name}"
).versions.get(version_id)

version.id: str
version.created_at: str
version.cog_version: str  # Framework version
version.openapi_schema: Dict  # Full Input/Output schemas
# Access input schema: version.openapi_schema["components"]["schemas"]["Input"]["properties"]
# Access output schema: version.openapi_schema["components"]["schemas"]["Output"]
```

### File Output Objects

```python
# FileOutput implements file-like interface
file_output: FileOutput

file_output.read()  # Load entire file into memory
await file_output.aread()  # Async variant
file_output.url  # Access underlying data source

# Iteration support for streaming chunks
for chunk in file_output:
    # Process file data in chunks
    pass
```

## HTTP API Endpoints

### Authentication
All requests require: `Authorization: Bearer $REPLICATE_API_TOKEN`
- Tokens are 40-character strings starting with `r8_`
- Get at: https://replicate.com/account/api-tokens

### Prediction Endpoints

```
POST /v1/predictions
  Creates prediction (community/deployment models)
  Body: { version, input, webhook, webhook_events_filter }
  Headers: Prefer: wait=N (sync mode, N=1-60s), Cancel-After: 30s|5m|2h (auto-cancel)
  Response: Prediction object

GET /v1/predictions/{id}
  Retrieve prediction state

POST /v1/predictions/{id}/cancel
  Stop running prediction (non-terminal states only)

GET /v1/predictions
  List user's predictions (paginated, 100 per page)

POST /v1/models/{owner}/{name}/predictions (official models only)
  Specialized endpoint for official Replicate models
```

### Model Discovery Endpoints

```
GET /v1/models/{owner}/{name}
  Get model metadata with latest_version containing openapi_schema

GET /v1/models/{owner}/{name}/versions/{version_id}
  Get specific version with openapi_schema containing Input/Output definitions

GET /v1/models
  List models with pagination (sort_by, sort_direction parameters)
  sort_by: "latest_version_created_at" (default), "model_created_at"
  sort_direction: "asc", "desc" (default)

GET /v1/search
  Cross-resource search (models, collections, docs) - RECOMMENDED
  Query param: query="{search_term}"

QUERY /v1/models (legacy)
  Old search endpoint - returns paginated model list
```

### Deployment Endpoints

```
POST /v1/deployments/{owner}/{name}/predictions
  Run model via deployment (auto-scaling, throughput SLA)
```

## Configuration Shapes

### Prediction Creation Parameters

```python
{
    "version": str,  # Required: model version ID
    "input": {
        # Model-specific parameters - check openapi_schema
        # String inputs can be HTTP URLs (>256KB) or data: URLs (≤256KB)
    },
    "webhook": "https://...",  # Optional: POST on completion
    "webhook_events_filter": [  # Optional: which events trigger webhook
        "start",      # Always sent regardless of filtering
        "output",     # Model produced new output
        "logs",       # Log output generated
        "completed",  # Terminal state reached (always sent)
    ],
}
```

### Sync Mode Headers

```
Prefer: wait=N
  - N: seconds to wait (1-60, default 60)
  - wait=false disables sync, returns immediately
  - Blocks HTTP connection, blocks until complete or timeout
  - Returns Prediction with populated output field if succeeded

Cancel-After: duration
  - Formats: "30", "30s", "5m", "2h", "1h30m45s"
  - Minimum: 5s, Maximum: 24h
  - Auto-cancels prediction if not complete within duration
  - Independent of wait timeout
```

### Model Input Constraints (From openapi_schema)

Input validation uses OpenAPI Schema standard:
- **type**: "string", "integer", "number", "boolean", "array", "object"
- **enum**: List of allowed values (case-sensitive)
- **minimum/maximum**: For numeric types
- **minLength/maxLength**: For strings
- **pattern**: Regex pattern strings must match
- **description**: What the input does and expected format

Non-obvious constraints from experience:
- String inputs larger than 256KB MUST be HTTP URLs, not data URLs
- Image inputs: Accept URLs or data URLs (JPEG, PNG, WebP)
- File inputs: Accept HTTP URLs or multipart file uploads
- Numeric ranges often have non-obvious limits (check description)

## Non-Obvious Behaviors

### Sync Mode Gotchas

1. **Timeout is HTTP connection timeout, not prediction deadline**
   - `wait=30` waits 30 seconds for HTTP response
   - If model takes 45 seconds, HTTP times out but prediction continues running
   - Use `Cancel-After` header to actually cancel the prediction

2. **Prefer header is case-sensitive**
   - Must be exactly: `Prefer: wait=60` or `Prefer: wait=false`
   - Not `prefer` or `Wait`

3. **Both wait and Cancel-After can be used together**
   - `wait=60` + `Cancel-After: 2h` = wait 60s for HTTP, cancel after 2h total
   - Useful for sync with guaranteed upper timeout

### Prediction Lifecycle

Status transitions:
```
starting → processing → succeeded/failed/canceled
```

Non-obvious points:
- `starting` state can last >5 seconds if new worker is cold-starting
- Status is NOT updated in real-time; polling intervals are ~500ms
- Outputs may be available before status changes to `succeeded`
- Completed predictions auto-delete input/output after 1 hour (configurable)
- Files served from `replicate.delivery` domain with short-lived signatures

### Model Reference Format

The `ref` parameter accepts three formats:
```
"{owner}/{name}"          # Uses latest version
"{owner}/{name}:{version_id}"  # Specific version
"{version_id}"            # Direct version ID (if you have it)
```

Most common format: `"meta/llama-2-70b-chat"`

### FileOutput Behavior

```python
# File outputs are NOT regular file objects
file_output = prediction.output[0]  # Might be FileOutput

# DO THIS:
content = file_output.read()  # Load from URL

# NOT THIS:
content = file_output.open()  # FileOutput doesn't have open()
```

FileOutput wraps HTTP URLs with auto-expiring signatures. Read before 1 hour expires.

### Webhook Event Timing

- `start` and `completed` events: Always sent, not throttled
- `output` and `logs` events: Throttled to 1 per 500ms maximum
- Multiple outputs in 500ms window are batched into single webhook request
- Webhooks are POST requests with Prediction object as body
- Webhook verification requires checking X-Webhook-Secret header

### Rate Limiting

- **Create prediction**: 600 requests/minute (10 per second, burst to 600/s)
- **All other endpoints**: 3,000 requests/minute (50 per second)
- **Response**: HTTP 429 with `detail` field indicating wait time
- **Credit-based**: As credits deplete, rates drop to prevent overspend
- **No payment method**: Rate limited to 1 req/s (max 6/minute)

Rate limiting is per-account, not per-token.

### Model Input Validation

- Input validation happens during startup, not at creation time
- Invalid inputs trigger `status: "failed"` with `error` field set
- Error codes in error field are prefixed with `E` (e.g., `E1001`)
- Check `openapi_schema` for expected input structure

### OpenAPI Schema Location

```python
# Latest version
model = replicate.models.get("owner/name")
schema = model.latest_version.openapi_schema

# Specific version
version = replicate.models.get("owner/name").versions.get(version_id)
schema = version.openapi_schema

# Structure
schema["components"]["schemas"]["Input"]["properties"]  # Input parameters
schema["components"]["schemas"]["Output"]  # Output shape
```

### Streaming (SSE) Behavior

- Not all models support streaming
- Check if `urls.stream` is present in prediction object
- Stream only works with `stream()` or `async_stream()` methods
- `use_file_output=True` still applies to streamed outputs
- Each event is a ServerSentEvent; access `.data` for content

## Webhook Security & Verification

### Webhook Request Headers

```
webhook-id: str                    # Unique message identifier
webhook-timestamp: str             # Seconds since epoch (integer as string)
webhook-signature: str             # Base64-encoded signatures, space-delimited, format "v1,{sig}"
```

### Signature Verification Algorithm

HMAC-SHA256 with this exact process:

```python
import hashlib
import hmac
import base64

# 1. Get signing key from API
# GET /v1/webhooks/default/secret → { "key": "whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD" }
# Extract base64 key: everything after "whsec_"
secret_key = base64.b64decode("C2FVsBQIhrscChlQIMV+b5sSYspob7oD")

# 2. Construct signed content
webhook_id = request.headers["webhook-id"]
timestamp = request.headers["webhook-timestamp"]
body = request.body  # Raw bytes - must not be modified
signed_content = f"{webhook_id}.{timestamp}.{body}"

# 3. Compute HMAC-SHA256
computed_signature = base64.b64encode(
    hmac.new(secret_key, signed_content.encode(), hashlib.sha256).digest()
)

# 4. Compare using constant-time comparison
# Extract signature from header (remove "v1," prefix)
header_signature = request.headers["webhook-signature"].split(",", 1)[1]

# Use hmac.compare_digest to prevent timing attacks
if hmac.compare_digest(computed_signature, header_signature.encode()):
    # Webhook is authentic
    pass
```

### Non-Obvious Webhook Behaviors

- **Body sensitivity**: Any modification to request body breaks signature - validate raw bytes
- **Timestamp replay protection**: Compare webhook-timestamp against current time to reject stale requests
- **Key format**: Signing key starts with `whsec_` prefix - remove this before base64 decoding
- **Signature prefix**: Header format is `v1,{signature}` - extract signature after the comma
- **Constant-time comparison**: Use `hmac.compare_digest()` or equivalent to prevent timing attacks
- **Throttling**: output/logs events throttled to 1 per 500ms; start/completed events never throttled
- **Caching**: Cache signing key locally; only fetch from API periodically (check if changed)

## Deployment Configuration

### Creating Deployments (POST /v1/deployments)

```python
{
    "name": str,               # Deployment identifier
    "model": str,              # "{owner}/{name}" format
    "version": str,            # Specific version ID (not flexible)
    "hardware": str,           # SKU: "cpu", "gpu-t4", "gpu-a100", etc.
    "min_instances": int,      # Minimum warm instances (0-N)
    "max_instances": int,      # Maximum auto-scaled instances
}
```

### Auto-Scaling Behavior

- **min_instances**: Number of instances always running (cost baseline)
- **max_instances**: Hard limit on scaling (cost ceiling)
- **Scaling**: Automatic based on prediction queue depth
- **Scale to zero**: min_instances=0 allows complete shutdown when idle
- **Warm start**: min_instances>0 ensures predictions start immediately
- **Cost**: Billed per instance-hour + compute credits per prediction

### Non-Obvious Deployment Patterns

1. **Version is immutable**: Can't change version without deleting/recreating deployment
2. **Hardware changes**: Require deployment update, which causes brief downtime
3. **Deletion**: Requires 15+ minutes idle before deletion allowed
4. **Official models**: Some deployments only work with Replicate official models
5. **Scaling response**: Cold starts add 10-30s when scaling from zero; keep min_instances>0 for guaranteed latency

## Error Handling

### Error Code Reference (E#### format)

| Code | Meaning | Recovery |
|------|---------|----------|
| E1000 | Unknown/unexpected error | Retry; check system status |
| E1001 | Out of memory (OOM) | Reduce input size; try lower-memory variant |
| E1002 | Model health check failed | Try different version; check known issues |
| E1003 | Error starting prediction | Verify input params; check environment |
| E4875 | Webhook URL empty/invalid | Provide valid HTTPS webhook URL |
| E6716 | Timeout starting prediction | Retry; try off-peak hours |
| E8367 | Prediction stopped unexpectedly | Check for cancellation; retry if unintended |
| E8765 | Model container failed | Try different version; contact support |
| E9243 | Prediction startup error | Verify inputs; test with simpler inputs |
| E9825 | File upload failed | Check size limits; verify format; retry |

### Python Exception Handling

```python
from replicate.exceptions import ModelError

try:
    output = replicate.run(...)
except ModelError as e:
    # e.prediction contains the failed Prediction object
    print(e.prediction.error)  # Error string from server
    print(e.prediction.status)  # "failed"
```

### HTTP Error Responses

Non-2xx responses include JSON body:
```json
{
    "detail": "Error message describing the problem"
}
```

Status codes:
- **400**: Invalid request (bad parameters, missing required fields)
- **401**: Unauthorized (missing/invalid token)
- **404**: Not found (invalid model/prediction ID)
- **409**: Conflict (can't cancel non-running prediction)
- **429**: Rate limited (hit request limits)
- **500**: Server error (transient, retry-safe)

## Data Retention & Quotas

- **Input/output auto-delete**: 1 hour after prediction completes
- **File URLs**: Expire with short-lived signatures
- **Model limit**: 1,000 models per account (use versions instead)
- **Default pagination**: 100 records per page
- **Prediction listing**: Paginated via `next`/`previous` cursors

## Common Integration Patterns

### Handling Long-Running Predictions

```python
# Pattern 1: Webhook (Recommended for long tasks)
prediction = replicate.predictions.create(
    model="...",
    version="...",
    input={...},
    webhook="https://myapp.com/webhook",
    webhook_events_filter=["completed"]
)
# Your endpoint receives prediction when complete

# Pattern 2: Polling with exponential backoff
import time
prediction = replicate.predictions.create(...)
wait = 1
while prediction.status not in ["succeeded", "failed", "canceled"]:
    time.sleep(wait)
    prediction.reload()
    wait = min(wait * 1.5, 30)  # Cap at 30s
```

### Model Input Discovery

```python
# Get all available models matching query
search_results = replicate.client.models.list(
    query="language model",  # Text search
    sort_by="latest_version_created_at",
    sort_direction="desc"
)

# Get model with full schema
model = replicate.models.get("meta/llama-2-70b-chat")
input_schema = model.latest_version.openapi_schema["components"]["schemas"]["Input"]["properties"]

for param_name, param_schema in input_schema.items():
    print(f"{param_name}: {param_schema['type']} - {param_schema.get('description', '')}")
```

### Handling FileOutput in Predictions

```python
prediction = replicate.run("stability-ai/sdxl", input={...})

# prediction.output might be list of FileOutput objects
if isinstance(prediction.output, list):
    for item in prediction.output:
        if hasattr(item, 'read'):  # It's a FileOutput
            image_data = item.read()  # Read within 1 hour
            # Process image_data
        else:
            # Regular string/object output
            print(item)
```

### Streaming Token Output

```python
# Only works with models that support streaming
prompt = "Write a poem about..."
stream_events = replicate.stream(
    "meta/llama-2-70b-chat",
    input={"prompt": prompt}
)

# Events are ServerSentEvent objects
for event in stream_events:
    if event.event == "output":
        # event.data contains token
        print(event.data, end="", flush=True)
```

## Critical Gotchas & Mistakes

1. **Confusing sync timeout with prediction deadline**
   - `replicate.run(..., wait=30)` does NOT cancel after 30s
   - Prediction continues running on Replicate servers
   - Use `Cancel-After` header to actually cancel

2. **Reading FileOutput after 1 hour**
   - All prediction data auto-deletes after 1 hour
   - FileOutput URLs become invalid after expiration
   - Use webhooks to capture data immediately on completion

3. **Assuming status updates in real-time**
   - Prediction status updates are polled (~500ms intervals)
   - Output may appear before status shows "succeeded"
   - Don't trust status == "succeeded" to check for outputs

4. **Parsing error codes incorrectly**
   - Error codes are prefixed with `E` (e.g., "E1001")
   - They appear in `prediction.error` string, not separate field
   - Parse as substring: `if "E1001" in prediction.error`

5. **Forgetting to validate webhook signatures**
   - Webhooks are POST requests anyone can send to your endpoint
   - Always verify webhook signature before processing
   - Check `webhook-timestamp` to prevent replay attacks

6. **Using string size > 256KB as input without URL**
   - Inputs > 256KB MUST be HTTP URLs
   - Data URLs are limited to 256KB maximum
   - Large files must be pre-uploaded somewhere

7. **Hardcoding API tokens in code**
   - Always use environment variables
   - Never commit tokens to version control
   - Rotate tokens periodically

8. **Not handling rate limit 429 responses**
   - `replicate` library throws exception on 429
   - Response includes wait time suggestion in `detail`
   - Implement exponential backoff + jitter for retries

## Version: 1.0.0 (2025-10-29)

**Last updated**: October 29, 2025
**API version**: v1
**Documentation source**: https://replicate.com/docs

### Recent Changes (2025)
- October: Model metadata updates via PATCH, sorting in models.list
- Smaller response objects (~5KB per model removed)
- Search API refinements and pagination improvements
- Webhook signature verification (introduced Feb 2024, documented May 2024)
- Deployment API and auto-scaling (launched March 2024)
