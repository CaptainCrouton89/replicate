# Supabase Edge Functions LLM Reference

## Critical Function Signatures

### Handler Pattern (Only Valid Pattern)

```typescript
Deno.serve(async (req: Request) => {
  // req is standard Web API Request object
  return new Response(data, {
    headers: { 'Content-Type': 'application/json' },
    status: 200 // or error code
  })
})
```

**Key Constraint:** Must use `Deno.serve()` - this is the ONLY valid entrypoint. Old `handler` export patterns are deprecated.

### Request Object (Standard Web API)

```typescript
req.method            // "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
req.url              // Full URL with query params: "https://..."
req.headers          // Headers object - check with req.headers.get('header-name')
req.json()           // async () => object - MUST await
req.text()           // async () => string
req.blob()           // async () => Blob
req.clone()          // For reading body multiple times
```

**Non-obvious:** `req.json()`, `req.text()`, `req.blob()` consume the body stream - can only be called once unless you `.clone()` the request first.

### Response Object (Standard Web API)

```typescript
new Response(body, options)
// body: string | Blob | ArrayBuffer | ReadableStream | null
// options: {
//   status?: number,
//   statusText?: string,
//   headers?: HeadersInit
// }
```

**Example:**
```typescript
// JSON with status
return new Response(JSON.stringify({ error: 'Not found' }), {
  status: 404,
  headers: { 'Content-Type': 'application/json' }
})

// CORS headers (if needed)
return new Response('Hello', {
  headers: {
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
})

// Streaming response
const readable = new ReadableStream({ /* ... */ })
return new Response(readable, {
  headers: { 'Content-Type': 'application/octet-stream' }
})
```

## Environment Variables & Secrets Access

### Built-in Available Secrets

```typescript
Deno.env.get('SUPABASE_URL')              // API gateway: https://<project>.supabase.co
Deno.env.get('SUPABASE_ANON_KEY')         // Public key, respects RLS
Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // Admin key, BYPASSES RLS
Deno.env.get('SUPABASE_DB_URL')           // Direct postgres connection

// Production only
Deno.env.get('SB_REGION')                 // Region where function invoked
Deno.env.get('SB_EXECUTION_ID')           // UUID of this invocation
Deno.env.get('DENO_DEPLOYMENT_ID')        // Function code version
```

**Critical:** SERVICE_ROLE_KEY should NEVER be used in code that's accessible from browser - it bypasses Row Level Security entirely.

### Setting Secrets

**Local Development:**
1. Create `supabase/functions/.env` (auto-loaded)
2. Or use flag: `supabase functions serve --env-file ./custom.env`
3. Use in code: `Deno.env.get('MY_SECRET')`

**Production:**
```bash
# Set individually
supabase secrets set STRIPE_API_KEY=sk_live_123

# Set from file
supabase secrets set --env-file .env.production

# List all
supabase secrets list

# Secrets are immediate - no redeeploy needed!
```

**Important:** Secrets set via CLI are immediately available without redeployment. Changes via Dashboard also instant.

### Local Debugging Secrets

```typescript
// Safe partial logging (slice first chars)
console.log(Deno.env.get('STRIPE_KEY')?.slice(0, 15))

// Check if secret exists
if (!Deno.env.get('REQUIRED_SECRET')) {
  throw new Error('Missing REQUIRED_SECRET')
}
```

## HTTP Method Routing Pattern

```typescript
Deno.serve(async (req) => {
  const { pathname, search } = new URL(req.url)

  // Route by method
  if (req.method === 'POST') {
    const body = await req.json()
    // handle POST
  } else if (req.method === 'GET') {
    const params = new URLSearchParams(search)
    // handle GET
  } else if (req.method === 'OPTIONS') {
    // CORS preflight - required for cross-origin requests
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
      }
    })
  }

  return new Response(...)
})
```

## Configuration (supabase/config.toml)

```toml
[functions.my-function]
verify_jwt = false              # DANGEROUS: allows unauthenticated access
import_map = "./import_map.json" # Function-specific dependencies
entrypoint = "./index.ts"       # Can be .ts, .js, .tsx, .jsx, .mjs
```

**Non-obvious:** JWT verification must be explicitly disabled PER FUNCTION if you need webhook endpoints that don't authenticate (Stripe, GitHub, etc).

## Hard Runtime Limits (Critical!)

| Limit | Value | Notes |
|-------|-------|-------|
| Memory | 256 MB | Total heap allocation |
| CPU Time | 2 seconds | Per invocation, excludes async I/O |
| Request Duration | 150 seconds | Free tier; 400 seconds on paid |
| Function Size | 20 MB | After CLI bundling with `eszip` |
| Max Functions/Project | 100 (free), 500 (pro), 1000 (team), ∞ (enterprise) | |
| Log Message Length | 10,000 chars | Single log line limit |
| Logging Rate | 100 events per 10s | Per function |

**Critical Gotchas:**
- CPU time is SEPARATE from wall-clock time - you can idle for 150s but only have 2s of actual CPU work
- Long-running operations will hit the 150s timeout and return 504
- Memory limit is PER ISOLATE, not shared - each concurrent invocation gets its own 256MB
- Functions >20MB won't bundle

## Deployment & Local Development

### Local Workflow

```bash
# Start entire Supabase stack locally
supabase start

# Access at http://localhost:54321/functions/v1/my-function

# Enable hot reload for development
supabase functions serve my-function
# Function at http://localhost:54321/functions/v1/my-function

# Skip JWT for webhook testing
supabase functions serve my-function --no-verify-jwt
```

**Non-obvious:** `supabase start` includes database, auth, storage, AND Edge Functions runtime - it's a complete production-like environment.

### Project Structure Best Practice

```
supabase/
  functions/
    _shared/           # Shared code (underscore = ignored in deployment)
      utils.ts
    my-function/
      index.ts         # Main handler
      deps.ts          # Dependency imports
      import_map.json  # Optional per-function imports
    webhook-handler/
      index.ts
    image-processor-test/    # _test suffix for tests, excluded from deploy
      index.test.ts
```

**Non-obvious:** Underscore-prefixed directories and `-test` suffixed files are NOT deployed. Use `_shared` for shared code.

### Deployment

```bash
# Deploy specific function
supabase functions deploy my-function

# Deploy all functions
supabase functions deploy

# Functions bundled as ESZip and distributed globally
# Accessible at: https://[PROJECT_ID].supabase.co/functions/v1/my-function
```

**Important:** Functions are bundled into ESZip format (Deno's compact module format) before distribution. This enables fast cold starts.

## Authentication & Authorization

### Default Behavior

By default, all Edge Functions require a valid JWT token in the `Authorization: Bearer` header.

```bash
# Valid request
curl -H "Authorization: Bearer eyJ..." \
  https://project.supabase.co/functions/v1/my-function

# Invalid - returns 401
curl https://project.supabase.co/functions/v1/my-function
```

### Extract JWT User Info

```typescript
// Verify the JWT (automatic via verify_jwt = true)
const authHeader = req.headers.get('Authorization')
// Value is "Bearer eyJ..." - you must parse it

// OR use supabase client to verify
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // Use service role for verification
)

const { data: { user }, error } = await supabase.auth.getUser(token)
```

### Disable for Webhooks

```toml
[functions.webhook-handler]
verify_jwt = false  # Allows any request, unguarded
```

**Warning:** This completely disables authentication - only use for external webhook endpoints where you verify signature separately (Stripe signature, GitHub HMAC, etc).

## Common Import Patterns

```typescript
// Standard library (always available)
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'

// Supabase client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Third-party via esm.sh
import { stripe } from 'https://esm.sh/stripe@latest'
import crypto from 'https://esm.sh/tweetnacl'

// Or use import_map.json for version pinning
// import_map.json: { "imports": { "stripe": "https://esm.sh/stripe@13.0.0" } }
```

**Non-obvious:** Deno Edge Runtime doesn't support npm packages directly - everything must be ESM (ES Modules). Use esm.sh for npm compatibility or native Deno modules.

## Error Handling Pattern

```typescript
Deno.serve(async (req) => {
  try {
    const body = await req.json()
    // process
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
})
```

**Important:** Always log errors - they appear in the Edge Function logs dashboard with timestamps and invocation IDs.

## Non-Obvious Behaviors & Gotchas

1. **Body Consumption:** Request body can only be read once. If you need it multiple times, clone the request:
   ```typescript
   const req1 = req.clone()
   const body1 = await req.json()
   const body2 = await req.clone().json()
   ```

2. **Cold Starts:** Initial invocation may be slow (100-500ms) due to isolate initialization. Keep functions warm or accept latency.

3. **No File System:** Functions run in ephemeral isolates - no persistent `/tmp` storage. Use Supabase Storage or database for persistence.

4. **Database Connections:** Postgres connections are pooled at edge locations. Don't try to reuse connections across invocations - create new connection per request.

5. **Unguarded Endpoints:** If `verify_jwt = false`, the function is completely open - implement manual signature verification (Stripe, GitHub webhook HMACs).

6. **Environment Variable Timing:** Secrets set via CLI are available immediately but Dashboard UI has slight delay. Use CLI for production.

7. **CORS Preflight Required:** Browser requests need explicit OPTIONS handler with proper CORS headers.

8. **No Web Workers:** Can't use Web Workers, SharedArrayBuffer, or multithreaded Node libraries (Sharp, libvips, etc). Use streaming or Cloud Run for image processing.

9. **Email Port Blocking:** Outbound connections to SMTP ports (25, 587) are blocked. Use SendGrid, Resend, or other transactional email services with https.

10. **HTML Serving:** Custom domains only - can't serve HTML from default `.supabase.co` domain.

11. **Timeout Behavior:** At 150s wall clock or 2s CPU exhaustion, function returns 504 Gateway Timeout - no graceful shutdown.

12. **Legacy Auth Key Issue:** After API key migration, `SUPABASE_ANON_KEY` env var might still contain old JWT format - verify via `Deno.env.get()` and check header directly if needed.

## Version: 2025-10

Based on Supabase Edge Functions documentation updated 2025-10-29. Deno runtime with TypeScript-first support, deployed globally on Deno Deploy infrastructure.
