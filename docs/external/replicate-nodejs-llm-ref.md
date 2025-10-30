# Replicate Node.js Client - LLM Reference

## Critical Setup & Configuration

### Installation
```bash
npm install replicate
```
Requires Node.js >= 18, Bun >= 1.0, or Deno >= 1.28. Uses globalThis.fetch (available by default in Node.js 18+).

### Constructor Signature
```typescript
new Replicate(options?: {
  auth?: string;              // API token; defaults to process.env.REPLICATE_API_TOKEN
  userAgent?: string;         // Custom identifier; defaults to "replicate-javascript/{version}"
  baseUrl?: string;           // API endpoint; defaults to "https://api.replicate.com/v1"
  fetch?: (url, options) => Promise<Response>; // Custom fetch implementation
  fileEncodingStrategy?: "default" | "upload" | "data-uri"; // File handling mode
  useFileOutput?: boolean;    // Default: true; converts files to FileOutput objects
})
```

### TypeScript Configuration
Set `esModuleInterop: true` in tsconfig.json for proper module compatibility.

## Critical Signatures & Return Types

### replicate.run()
```typescript
replicate.run(
  model: string,  // Format: "{owner}/{name}" or "{owner}/{name}:{version_id}"
  options: {
    input: Record<string, any>;          // Model-specific inputs
    signal?: AbortSignal;                // For request cancellation
    wait?: {
      interval?: number;  // Polling interval in ms (default: 500)
      maxAttempts?: number;
    };
  },
  onProgress?: (prediction: Prediction) => void
): Promise<unknown>  // WARNING: Returns primitives, arrays, objects, OR FileOutput!
```

**Non-obvious Behaviors:**
- Returns only the model output, NOT the full Prediction object
- TypeScript return type is `Promise<object>` but actually returns `Promise<unknown>` (misleading typing)
- Can return string, number, boolean, array, object, or FileOutput depending on model
- Holds HTTP connection open by default (using "block" strategy) until completion or timeout
- Falls back to polling after 60 seconds with default polling interval of 500ms
- Supports AbortSignal cancellation: `replicate.run(..., { signal: AbortSignal.timeout(30000) })`

### replicate.predictions.create()
```typescript
replicate.predictions.create(options: {
  version: string;            // Model version ID (required)
  input: Record<string, any>; // Model inputs
  webhook?: string;           // Callback URL (must be HTTPS)
  webhook_events_filter?: ("start" | "output" | "logs" | "completed")[]; // Events to send
  stream?: boolean;           // Enable real-time streaming (if model supports)
}): Promise<Prediction>
```

**Non-obvious Behaviors:**
- Returns immediately with Prediction object (status likely "starting")
- Does NOT wait for completion (use `replicate.wait()` or polling)
- webhook_events_filter default is all events if not specified
- File outputs handled based on `useFileOutput` constructor option

### replicate.predictions.get()
```typescript
replicate.predictions.get(id: string): Promise<Prediction>
```
Fetches current prediction state. Status values: "starting", "processing", "succeeded", "failed", "canceled".

### replicate.wait()
```typescript
replicate.wait(
  prediction: Prediction,
  options?: {
    interval?: number;     // Polling interval in ms (default: 500)
    maxAttempts?: number;
  }
): Promise<Prediction>
```
Polls until prediction completes. Throws if prediction fails or is canceled.

## Prediction Object Shape

```typescript
interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  created_at: string;          // ISO 8601 timestamp
  started_at: string | null;
  completed_at: string | null;
  source: "web" | "api";
  output: unknown;             // Model output (null if not yet succeeded)
  error: string | null;        // Error message if failed
  logs: string | null;         // Model stdout/stderr
  metrics: {
    predict_time?: number;     // Milliseconds to run
  };
  webhook?: string;
  webhook_events_filter: string[];
  version: string;             // Version ID
  urls: {
    get: string;               // GET prediction URL
    cancel: string;            // POST to cancel
  };
}
```

## FileOutput (File Streaming)

Returned by default when models output files (unless `useFileOutput: false`).

```typescript
interface FileOutput extends ReadableStream<Uint8Array> {
  url(): URL;                  // Returns underlying file URL
  blob(): Promise<Blob>;       // Convert to Blob
  // Implements ReadableStream for direct streaming
}
```

**Usage Patterns:**
```typescript
// Stream to disk
const output = await replicate.run("model", { input });
await fs.promises.writeFile("output.png", output); // Works if output is FileOutput

// Get blob
const blob = await output.blob();
const buffer = Buffer.from(await blob.arrayBuffer());

// Get URL (NOT recommended - may break in future versions)
const url = output.url().href;

// Streaming response
return new Response(output);

// Opt out of FileOutput
const replicate = new Replicate({ useFileOutput: false });
const urlString = await replicate.run("model", { input }); // Returns URL string
```

## File Input Handling

```typescript
const input = {
  image: await fs.promises.readFile("image.png") // Auto-uploads to Replicate
};
const output = await replicate.run("model", { input });
```

**Constraints:**
- Auto-uploaded files have 100MiB max
- For larger files: upload separately, pass public HTTPS URL
- File encoding strategy controlled by `fileEncodingStrategy` constructor option

## Webhook Integration

### Creating with Webhook
```typescript
const prediction = await replicate.predictions.create({
  version: "model-version-id",
  input: { /* ... */ },
  webhook: "https://my.app/api/webhooks/replicate",
  webhook_events_filter: ["completed"] // Only receive on completion
});
```

**Webhook Event Types:** "start", "output", "logs", "completed"

### Webhook Validation
```typescript
import { validateWebhook } from 'replicate';

// With Next.js Request object
const isValid = await validateWebhook(request.clone(), process.env.REPLICATE_WEBHOOK_SIGNING_SECRET);

// With manual data
const isValid = await validateWebhook({
  id: request.headers.get("webhook-id"),
  timestamp: request.headers.get("webhook-timestamp"),
  signature: request.headers.get("webhook-signature"),
  body: await request.text(),
  secret: process.env.REPLICATE_WEBHOOK_SIGNING_SECRET
});
```

**Node.js <= 18:** Requires explicit crypto import:
```typescript
const crypto = require("node:crypto").webcrypto;
const isValid = await validateWebhook(requestData, crypto);
```

## Request Cancellation & Timeouts

### Using AbortSignal.timeout()
```typescript
try {
  const output = await replicate.run("model", {
    input: { prompt: "..." },
    signal: AbortSignal.timeout(30000) // 30 second timeout
  });
} catch (err) {
  if (err.name === "TimeoutError") {
    console.error("Request timed out");
  }
}
```

### Combining Multiple Signals
```typescript
const controller = new AbortController();
const timeoutSignal = AbortSignal.timeout(60000);

const output = await replicate.run("model", {
  input: { /* ... */ },
  signal: AbortSignal.any([controller.signal, timeoutSignal])
});
```

### Canceling Background Predictions
```typescript
const prediction = await replicate.predictions.create({
  version: "model-id",
  input: { /* ... */ }
});

await replicate.predictions.cancel(prediction.id);
```

## Custom Fetch Implementation

```typescript
const customFetch = (url: string, options?: RequestInit) => {
  const headers = { ...options?.headers };
  headers["X-Custom-Header"] = "value";
  headers["Authorization"] = `Bearer ${process.env.CUSTOM_AUTH}`;
  return fetch(url, { ...options, headers });
};

const replicate = new Replicate({ fetch: customFetch });
```

## TypeScript Type Imports

```typescript
import Replicate, {
  type Prediction,
  type FileOutput
} from 'replicate';
```

## Non-Obvious Constraints & Gotchas

1. **Cannot run from browser:** This library requires Node.js/Bun/Deno backend. Use API routes in Next.js, not browser code.

2. **API token must be private:** Default uses `process.env.REPLICATE_API_TOKEN`. NEVER expose in client-side code.

3. **FileOutput is default behavior:** New projects get FileOutput objects. Existing code might expect URLs. Set `useFileOutput: false` if needed.

4. **HTTP connection blocking:** `replicate.run()` holds connection open (blocks) for up to 60 seconds by default. Falls back to polling afterward. Long-running models benefit from webhooks instead.

5. **Polling defaults:** Both `run()` and `wait()` poll at 500ms intervals by default. Can be customized but no explicit limit; AWS Lambda/Vercel have execution timeout constraints.

6. **Webhook validation requires crypto API:** Node.js 19+ includes crypto by default. Node.js 18 requires manual import for `validateWebhook()`.

7. **Return type typing is misleading:** TypeScript says `Promise<object>` but actually returns `Promise<unknown>`. Models can return primitives, arrays, FileOutput objects, or nested structures.

8. **Model identifier format matters:** Use `{owner}/{name}` to get latest version, or `{owner}/{name}:{version_id}` for specific version. Version ID is a long SHA, not semantic version.

9. **File uploads have limits:** Auto-uploaded files max 100MiB. For larger files, upload separately and pass HTTPS URL in input.

10. **Webhook URL must be HTTPS:** Cannot use HTTP or localhost. Replicate servers must be able to reach your callback endpoint.

11. **`useFileOutput` affects all file outputs:** This constructor option changes behavior globally. All models returning files will return FileOutput or URLs consistently.

12. **Progress callback for synchronous run only:** The third parameter to `replicate.run()` (onProgress callback) only works with sync API. For background predictions, poll manually or use webhooks.

## Platform Compatibility

- Node.js >= 18 (globalThis.fetch available)
- Bun >= 1.0
- Deno >= 1.28
- Cloudflare Workers
- Vercel Functions
- AWS Lambda
- Any environment with globalThis.fetch

For Node.js < 18 without fetch, install cross-fetch and pass via `fetch` constructor option.

## Version: 1.3.1+

Latest version supports async file streaming, webhook validation, and AbortSignal integration.
