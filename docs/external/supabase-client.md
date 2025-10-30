# Supabase Client Libraries LLM Reference

## Critical Signatures

### Browser Client Initialization
```typescript
// Package: @supabase/supabase-js
createClient<Database>(
  url: string, // Must be https://[project-ref].supabase.co format
  anonKey: string, // Public anon key, NOT service role key
  options?: {
    global?: {
      fetch?: typeof fetch, // Custom fetch implementation
      headers?: Record<string, string>, // Custom headers (e.g., Authorization)
    },
  }
): SupabaseClient<Database>
```

### Server-Side Client (Node.js/Edge Functions)
```typescript
// Package: @supabase/supabase-js (same for server)
createClient<Database>(url, key, options)
// Server clients use same signature but:
// - No session persistence without explicit storage implementation
// - Often used with service_role key for elevated permissions
// - Cookie-based storage via custom provider required for SSR
```

### Next.js SSR Client (App Router)
```typescript
// Package: @supabase/ssr
createBrowserClient<Database>(
  url: string,
  anonKey: string,
  options?: ClientOptions
): SupabaseClient<Database>
// Only for browser code (client components)
```

### Next.js Server Component/Action Client
```typescript
// Package: @supabase/ssr
createServerClient<Database>(
  url: string,
  serviceRoleKey: string, // Service role key for server access
  options: {
    cookies: CookieOptions, // Required: cookie getter/setter
  }
): SupabaseClient<Database>
```

### Middleware Client (Next.js)
```typescript
// Package: @supabase/ssr
createServerClient<Database>(
  url: string,
  serviceRoleKey: string,
  options: {
    cookies: {
      getAll(): Promise<Array<{ name: string; value: string }>>
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>): Promise<void>
    }
  }
)
// Refreshes cookies before request continues to protected routes
```

### TypeScript Type Initialization
```typescript
import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types' // Generated via CLI

const supabase = createClient<Database>(url, key)
// Now all queries have full type safety
```

## Configuration Shapes

### Client Options (Global Configuration)
```typescript
{
  global?: {
    fetch?: typeof fetch, // Custom fetch (required for some edge runtimes)
    headers?: Record<string, string>, // Applied to ALL requests
  },
  auth?: {
    persistSession?: boolean, // Default: true
    storageKey?: string, // Default: "sb-<project-ref>-auth-token"
    storage?: Storage | AsyncStorage, // Required for React Native
    detectSessionInUrl?: boolean, // Default: true, BREAKS SSR if true (disable in server clients)
    flowType?: 'implicit' | 'pkce', // Default: pkce
    autoRefreshToken?: boolean, // Default: true
    isSSR?: boolean, // Default: false (set true for server environments)
  },
  db?: {
    schema?: string, // Default: "public"
  },
  realtime?: {
    params?: {
      eventsPerSecond?: number, // Default: 100
    },
  },
}
```

### Auth Session Object
```typescript
{
  access_token: string, // JWT, expires in 1 hour by default
  token_type: 'bearer',
  expires_in: number, // Seconds until expiration
  expires_at?: number, // Unix timestamp
  refresh_token: string, // Used to refresh access token
  user: {
    id: string,
    email?: string,
    phone?: string,
    user_metadata?: Record<string, unknown>,
    app_metadata?: Record<string, unknown>,
    // ... other fields
  }
}
```

### Database Type Generation Output
```typescript
// Generated from: npx supabase gen types typescript --project-id [ID] > database.types.ts

export type Database = {
  public: {
    Tables: {
      movies: {
        Row: { /* columns as read from select() */ }
        Insert: { /* fields for insert(), generated columns are never */ }
        Update: { /* fields for update(), non-null become optional */ }
        Relationships: [ /* ... */ ]
      }
      // ... other tables
    }
    Views: { /* ... */ }
    Functions: { /* ... */ }
  }
  // ... other schemas
}

// Helper types available:
Tables<'movies'> // Shortcut for Database['public']['Tables']['movies']['Row']
TablesInsert<'movies'> // For insert type
TablesUpdate<'movies'> // For update type
QueryData<typeof query> // Extract type from complex .select() query
```

### Realtime Channel Configuration
```typescript
channel = supabase.channel('channel-name', {
  config: {
    broadcast: { ack: boolean }, // Require broadcast ack (default: false)
    presence: { key: string }, // For presence tracking
    private: boolean, // Private channel (default: false)
  },
})

channel.on('postgres_changes', {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  schema: 'public',
  table: 'messages',
  filter: 'id=eq.1', // Optional filter
}, (payload) => {})

channel.on('broadcast', { event: 'custom-event' }, (payload) => {})

channel.on('presence', { event: 'sync' | 'join' | 'leave' }, (state) => {})
```

## Non-Obvious Behaviors & Gotchas

### Client Initialization
- `createClient()` is **NOT a singleton** — each call creates a new client instance. This is intentional for testing and independent contexts
- Creating a new client is extremely lightweight (just object initialization)
- **Best practice**: Create client instance where needed or store in context/module scope, not in global singleton
- Custom `fetch` is **required** for Cloudflare Workers, Deno, and other non-standard Node.js environments

### Authentication & Sessions

**detectSessionInUrl gotcha**: Default is `true` for browser clients, which causes problems in SSR:
- Supabase reads `#access_token=...` from URL fragment during client initialization
- In SSR, this happens on server (invalid), causing session state corruption
- **MUST set `detectSessionInUrl: false` in server clients**

**Session storage differences**:
- Browser: Uses localStorage by default (auto-persisted across page reloads)
- Server: No persistence without custom storage implementation
- React Native: **REQUIRES** AsyncStorage in options, or sessions are lost on app restart

**Key types (anon vs service role)**:
- Anon key: Public, scoped by Row-Level Security (RLS) policies, respects auth state
- Service role key: **NEVER expose to client**, bypasses RLS, use only on server
- Mixing keys: Service role key in browser = security vulnerability; anon key on server = insufficient permissions

**Session Refresh**:
- Access tokens expire in ~1 hour (configurable)
- Refresh tokens last 7 days (or custom duration)
- `autoRefreshToken: true` auto-refreshes before requests IF storage available
- Server clients must manually refresh using `refreshSession()` if using refresh tokens

### Connection Pooling

**Port-based routing** (critical for Prisma/ORM users):
- Port 5432: Direct Postgres connection (no pooling)
- Port 6543: Connection pooler (pgBouncer/Supavisor in transaction mode)
- Transaction mode: **Cannot use prepared statements**, required for pooling
- **pgBouncer is deprecated** → transitioning to Supavisor (similar interface)

**Pool size constraints**:
- `max_client_conn`: Max clients connecting to pooler simultaneously
- `default_pool_size`: Number of connections pooler opens to Postgres per mode
- If pooling filled, new connections queue/timeout
- **Note**: Both Supavisor and pgBouncer reference same pool size setting

### TypeScript Types

**Generated types are database-driven**, not implementation-driven:
- `.select()` returns `Row` type (exactly what's in Postgres)
- `.insert()` accepts `Insert` type (generated columns marked as `never` — inserting throws TS error)
- `.update()` accepts `Update` type (non-null columns become optional)
- Nullable columns always typed as `T | null`

**Type safety requires Database parameter**:
```typescript
// ✅ Full type safety
const supabase = createClient<Database>(url, key)
const { data } = await supabase.from('movies').select()
// data is Movie[] with full intellisense

// ❌ No type safety (loses all type benefits)
const supabase = createClient(url, key)
const { data } = await supabase.from('movies').select()
// data is unknown
```

**Complex query types** (joins, nested selections):
- Use `QueryData<typeof query>` helper type to extract result shape
- Manually constructing join types is error-prone; let inference do it
- `QueryData` evaluates at compile-time, 100% type-safe if query compiles

### Error Handling

**Auth errors use `.code` property, NOT error message strings**:
```typescript
// ✅ Correct
if (error.code === 'email_exists') { /* ... */ }

// ❌ Wrong (message text varies by locale/version)
if (error.message.includes('already')) { /* ... */ }
```

**Common auth error codes**:
- `email_exists`: User already registered
- `invalid_credentials`: Wrong password
- `over_email_send_rate_limit`: Too many emails sent (rate limited)
- `session_not_found`: Session token expired/invalid
- `weak_password`: Password doesn't meet complexity rules

**Database API errors (PostgREST)**:
- 401/403 with code 42501: RLS policy denied access (user lacks permission)
- Check RLS policy, not code
- Anon role cannot access auth/vault schemas by default
- 400: Invalid query syntax or malformed request

**Realtime errors**:
- Subscriptions automatically reconnect on disconnect
- `CHANNEL_ERROR`: Lost websocket connection (temporary, will retry)
- `TIMED_OUT`: Subscription failed to reconnect after 30+ seconds
- If `disconnectOnNoSubscriptions: true` (default), client auto-disconnects when no channels exist
- Mobile apps: Background/screen-lock causes disconnection; manual `realtime.disconnect()` sometimes needed to prevent reconnect loops

### Realtime Subscriptions

**Automatic cleanup**:
- Client auto-disconnects from websocket when ALL channels removed (if `disconnectOnNoSubscriptions: true`)
- Cleanup happens ~30 seconds after final channel removed
- Prevents zombie connections, but may briefly spike reconnection if immediately resubscribing

**Subscription status states**:
- `SUBSCRIBED`: Connected and listening
- `CHANNEL_ERROR`: Disconnected (temporary, will auto-reconnect)
- `TIMED_OUT`: Failed to reconnect within timeout (permanent, must manually unsubscribe/resubscribe)
- `CLOSED`: Intentionally closed

**Broadcast pattern**:
```typescript
// Send: Other clients receive in SAME order as sent (ordered delivery)
channel.send({
  type: 'broadcast',
  event: 'cursor',
  payload: { x: 100, y: 200 },
})

// Receive: Payload contains exact structure sent
// No metadata added — what you send is what you receive
```

**Postgres Changes subscription**:
- Requires authenticated user (session) or RLS policy allowing anon access
- Fires AFTER change committed to database
- Includes `old_record` (pre-update state) in UPDATE/DELETE events
- Events processed in same order as database commits

## Common Patterns

### Browser Client Lifecycle
```typescript
import { createClient } from '@supabase/supabase-js'

// Create once, reuse throughout app (or in context)
const supabase = createClient<Database>(
  process.env.REACT_APP_SUPABASE_URL!,
  process.env.REACT_APP_SUPABASE_ANON_KEY!
)

// Session auto-persists to localStorage, auto-refreshes
// No additional setup needed for auth state management
```

### Server-Side (Node.js/Edge Functions)
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-only key
  {
    auth: {
      isSSR: true,
      detectSessionInUrl: false, // CRITICAL for SSR
    },
  }
)

// No session persistence — each request is independent
// Can use service role key for elevated access
```

### Next.js with Middleware Authentication
```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(c => ({ name: c.name, value: c.value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // This refresh updates cookies if token expired
  await supabase.auth.getSession()

  return supabaseResponse
}
```

### Type-Safe Query with Joins
```typescript
// Use QueryData to extract nested result type
const query = supabase
  .from('movies')
  .select(`
    id,
    title,
    actors (
      id,
      name
    )
  `)

type Movie = Database.Tables['movies'].Row & {
  actors: Database.Tables['actors'].Row[]
}

// OR use helper:
type MovieWithActors = Awaited<ReturnType<typeof query>>['data'][number]
```

## Non-Obvious Implementation Details

**Anon key scope & RLS**:
- Anon key identifies user as unauthenticated, NOT as a specific user
- RLS policies access `auth.uid()` (current user ID) — is NULL for anon users
- To allow anon access, RLS policy must explicitly allow rows without auth.uid() check
- Common mistake: Policy `auth.uid() = user_id` blocks ALL anon access

**Generated column behavior**:
- Inserting/updating generated columns causes TypeScript error (correctly prevents attempt)
- Generated columns auto-populate on insert (don't include in data)
- Refresh/refetch to see generated values after insert

**Relationship inference**:
- Supabase infers one-to-many from foreign key direction
- One-to-many `actor -> movies`: Returns `movies[]` in select
- Many-to-one `movie -> actors`: Returns `actor | null` in select
- If foreign key exists but relationship not inferred, check schema definition

**Race condition in session refresh**:
- Multiple concurrent `.select()` calls might each trigger refresh
- Library prevents multiple concurrent refresh attempts (queued internally)
- Safe, but may briefly increase latency on first request after token expiration

## Version: 2.45.0 (2025)

### CLI Commands

```bash
# Generate types from remote project
npx supabase gen types typescript --project-id [PROJECT_ID] > database.types.ts

# Generate types from local Postgres
npx supabase gen types typescript --local > database.types.ts

# Minimum CLI version: v1.8.1
```

### Environment Variables Convention

```
# Browser (public, safe to expose)
REACT_APP_SUPABASE_URL=https://[project].supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGc...

# Server (secret, never expose)
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co  # For browser code in SSR frameworks
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Server only, secret

# Realtime connection pooling
# Port 5432: Direct connection (for migrations, admin)
# Port 6543: Pooled connection (for application, transaction mode)
```

### Breaking Changes from Older Versions

- `@supabase/ssr` package now required for SSR environments (replaces manual cookie handling)
- pgBouncer deprecated in favor of Supavisor (same interface, different implementation)
- `detectSessionInUrl` default changed to `true` to support hash-based auth flows (breaks SSR)
