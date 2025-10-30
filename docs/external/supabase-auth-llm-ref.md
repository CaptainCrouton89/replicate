# Supabase Authentication LLM Reference

## Critical Non-Obvious Behaviors

### Token Refresh Mechanics
- **Refresh tokens can only be used ONCE.** After exchanging a refresh token for a new access-refresh pair, the old refresh token is invalidated
- Access tokens (JWTs) are short-lived: 5 minutes to 1 hour (configurable, default 1 hour)
- Refresh tokens **NEVER expire** but lose validity after first use or password change
- Token refresh prevents excessive server load vs. traditional session auth where every authenticated request routes through auth server

### Session Termination Events
Sessions auto-terminate on:
- Password change or security-sensitive operations
- User signs in on another device
- `signOut()` called
- Inactivity timeout reached
- Maximum lifetime expires

### HttpOnly Cookie Limitation (CRITICAL)
**If you use HttpOnly cookies, client-side JavaScript cannot access tokens.** This means:
- Only viable for server-rendered apps without rich client-side interactivity
- If app has ANY client-side JavaScript that needs to make authenticated requests, HttpOnly cookies don't work
- Cookie `Expires` or `Max-Age` MUST be set to far future (not browser-managed expiry)—let Supabase Auth control validity

### getSession() vs getUser() Server-Side Behavior
- **`getSession()`**: NOT guaranteed to revalidate Auth token on server—unsafe for protecting pages
- **`getUser()`**: Forces token refresh validation—MUST use for server-side page/data protection
- Never trust `getSession()` inside server code

### Provider Token Management
- Supabase does NOT auto-refresh provider tokens (Google, GitHub refresh tokens)
- Provider tokens deliberately excluded from project database (contains sensitive third-party access)
- Must implement custom provider token refresh on backend
- Some OAuth providers require specific scopes to return refresh tokens (Google requires `access_type: 'offline'` parameter)

### Email Link & OTP Expiry
- Default expiry: 24 hours
- Cannot be configured per-request; global Auth settings only

## Critical Function Signatures

### Client Initialization

```typescript
// Browser Client
createBrowserClient(
  supabaseUrl: string,     // Format: "https://*.supabase.co"
  supabaseKey: string,     // Public anon key (starts with 'eyJ')
  options?: {
    auth: {
      persistSession: boolean,        // Default: true
      detectSessionInUrl: boolean,    // Default: true - BREAKS SSR if true
      storageKey: string,             // Default: "sb-<project-ref>-auth-token"
      storage: Storage,               // localStorage by default
      flowType: "implicit" | "pkce",  // Default: "implicit"
    },
    global: {
      headers: Record<string, string>,
    },
  }
)

// Server Component Client (Next.js)
createServerClient(
  supabaseUrl: string,
  supabaseKey: string,
  options: {
    cookies: {
      getAll: () => { name: string; value: string }[],
      setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => void,
      remove: (name: string, options: CookieOptions) => void,
    },
  }
)
```

### Authentication Methods

```typescript
// Email/Password Sign Up
signUp(credentials: {
  email: string,
  password: string,
  options?: {
    data: Record<string, any>,                    // User metadata
    captchaToken?: string,                        // Bot detection
    emailRedirectTo?: string,                     // Redirect after email confirmation
  }
}): Promise<{
  data: { user: User | null, session: Session | null },
  error: AuthError | null
}>

// Email/Password Sign In
signInWithPassword(credentials: {
  email: string,
  password: string,
}): Promise<{ data: { user: User, session: Session }, error: AuthError | null }>

// OAuth Sign In - PKCE Flow
signInWithOAuth(options: {
  provider: 'google' | 'github' | 'discord' | ... (20+ providers),
  options?: {
    redirectTo: string,                  // Absolute URL for callback
    scopes: string,                      // Provider-specific (space/comma-separated)
    queryParams: Record<string, string>,  // Provider params (e.g. access_type for Google)
  }
}): Promise<{ data?: any, error: AuthError | null }>

// Exchange Auth Code for Session (PKCE)
exchangeCodeForSession(
  code: string,                           // Auth code from redirect URL
  options?: { redirectTo?: string }
): Promise<{ data: { user: User, session: Session }, error: AuthError | null }>

// One-Time Password
signInWithOtp(credentials: {
  email: string,
  options?: {
    emailRedirectTo?: string,
    shouldCreateUser?: boolean,          // Auto-create if not exists (default: true)
    captchaToken?: string,
  }
}): Promise<{ data?: any, error: AuthError | null }>

verifyOtp(credentials: {
  email: string,
  token: string,                         // 6-digit code from email
  type: 'magiclink' | 'email' | 'sms' | 'recovery_code' | 'phone_change' | 'email_change',
}): Promise<{ data: { user: User, session: Session }, error: AuthError | null }>

// Anonymous Sign In
signInAnonymously(options?: {
  data: Record<string, any>,             // Metadata
  captchaToken?: string,
}): Promise<{ data: { user: User, session: Session }, error: AuthError | null }>

// Password Reset
resetPasswordForEmail(
  email: string,
  options?: {
    redirectTo: string,                  // Redirect after reset link
    captchaToken?: string,
  }
): Promise<{ data: {}, error: AuthError | null }>

// Sign Out
signOut(options?: {
  scope: 'local' | 'others' | 'all',    // 'local': current browser, 'others': other devices, 'all': everywhere
}): Promise<{ error: AuthError | null }>
```

### Session Management

```typescript
// Get Current Session
getSession(): Promise<{ data: { session: Session | null }, error: AuthError | null }>

// Get Current User (with token refresh validation)
getUser(): Promise<{ data: { user: User }, error: AuthError | null }>

// Manually Refresh Token
refreshSession(refreshToken?: string): Promise<{
  data: { session: Session | null, user: User | null },
  error: AuthError | null
}>

// Set Session Programmatically
setSession(session: {
  access_token: string,                  // JWT access token
  refresh_token: string,
  options?: { skipBroadcast?: boolean }
}): Promise<{ data: { session: Session }, error: AuthError | null }>

// Get JWT Claims (verifies token)
getClaims(): Promise<{ data: { claims?: JWTPayload }, error: AuthError | null }>

// Subscribe to Auth Events
onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): { data: { subscription: Subscription } }
// Events: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, USER_UPDATED, PASSWORD_RECOVERY, MFA_CHALLENGE_VERIFIED
```

### Identity Linking

```typescript
// Get Linked Identities
getUserIdentities(): Promise<UserIdentity[]>

// Link Social Identity
linkIdentity(credentials: {
  provider: string,
  options?: { redirectTo?: string, scopes?: string }
}): Promise<{ data?: any, error: AuthError | null }>

// Unlink Identity
unlinkIdentity(identity: {
  provider: string,
  identity_id: string,
}): Promise<{ data: {}, error: AuthError | null }>
```

### Multi-Factor Authentication

```typescript
// Register MFA Factor
mfa.enroll(options: {
  factorType: 'totp',                    // Only type supported currently
  issuerName?: string,                   // For authenticator app display
  friendlyName?: string,
}): Promise<{ data: { id: string, totp?: { qr_code: string, secret: string } }, error: AuthError | null }>

// Challenge MFA
mfa.challenge(options: {
  factorId: string,
}): Promise<{ data: { challengeId: string }, error: AuthError | null }>

// Verify MFA Response
mfa.verify(options: {
  factorId: string,
  challengeId: string,
  code: string,                          // TOTP code from authenticator
}): Promise<{ data: { session: Session }, error: AuthError | null }>

// Combined Challenge & Verify
mfa.challengeAndVerify(options: {
  factorId: string,
  code: string,
}): Promise<{ data: { session: Session }, error: AuthError | null }>

// Remove MFA Factor
mfa.unenroll(options: {
  factorId: string,
}): Promise<{ data: {}, error: AuthError | null }>

// Check Auth Assurance Level
mfa.getAuthenticatorAssuranceLevel(): Promise<{
  data: {
    currentLevel: 'aal1' | 'aal2' | 'aal3',
    nextLevel: 'aal1' | 'aal2' | 'aal3',
    currentAuthenticationMethods: string[],
  },
  error: AuthError | null
}>
```

## JWT Structure & Claims

### JWT Format
`<base64-header>.<base64-payload>.<base64-signature>`

### Key Claims in Supabase JWTs

```typescript
{
  iss: "https://<project-ref>.supabase.co/auth/v1",  // Issuer
  exp: 1234567890,                                     // Expiration timestamp
  iat: 1234567800,                                     // Issued-at timestamp
  sub: "user-uuid",                                    // Subject (user ID)
  email: "user@example.com",
  email_confirmed_at: "2024-01-01T00:00:00Z",
  phone: "+1234567890",
  phone_confirmed_at: "2024-01-01T00:00:00Z",
  role: "authenticated",                               // Postgres role for RLS
  aud: "authenticated",                                // Audience
  session_id: "uuid",
  is_super_admin: boolean,
  user_metadata: { custom_claims: any },
  app_metadata: { provider: string, providers: string[] }
}
```

### JWT Verification

```typescript
// Retrieve public keys from issuer
GET https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json

// Keys are cached 10 minutes - wait 20+ minutes before revoking to avoid rejecting valid tokens

// Supabase client method (preferred)
const { data: { claims }, error } = await supabase.auth.getClaims()

// Don't implement JWT verification yourself - use library for your language
```

## Session Storage & Persistence

### Browser Storage Option

```typescript
// Default behavior - localStorage
createBrowserClient(url, key, {
  auth: {
    persistSession: true,                // Sessions survive page reload
    storageKey: "sb-<project-ref>-auth-token",
    storage: localStorage,               // Default
  }
})

// Access tokens stored in localStorage = XSS vulnerability risk
// Don't store sensitive data in localStorage
```

### Custom Storage Implementation

```typescript
// Must implement AsyncStorage interface
const customStorage = {
  getItem: async (key: string) => string | null,
  setItem: async (key: string, value: string) => void,
  removeItem: async (key: string) => void,
}

createServerClient(url, key, {
  cookies: {
    getAll: () => cookies().getAll().map(c => ({ name: c.name, value: c.value })),
    setAll: (cookies: Array<{ name: string; value: string; options: any }>) => {
      cookies.forEach(({ name, value, options }) => cookies().set(name, value, options))
    },
    remove: (name: string) => cookies().delete(name),
  }
})
```

### Cookie Configuration Rules

```typescript
// If storing tokens in cookies:
{
  name: "session-token",
  value: "...",
  options: {
    expires: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000), // Very far future
    sameSite: "lax",                      // Default recommended
    secure: true,                         // HTTPS only (critical)
    httpOnly: true,                       // Blocks client JS access (breaks if app needs JS)
    path: "/",
  }
}
```

## Next.js Server-Side Authentication

### Middleware Pattern (Token Refresh)

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  let supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
      remove: (name) => response.cookies.delete(name),
    },
  })

  // Refresh token (validates and updates)
  const { data: { user } } = await supabase.auth.getUser()

  // Update cookies in response
  // ...
  return response
}

// MUST run on: /route-protection, /auth/callback, etc.
export const config = {
  matcher: ['/protected/:path*', '/auth/:path*']
}
```

### Server Component Initialization

```typescript
// app/layout.tsx or page.tsx
const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => cookies().getAll(),
    setAll: (cookies) => {
      // Can't set cookies in Server Components - only Middleware/Route Handlers
    },
    remove: () => {},
  }
})

// CRITICAL: Call cookies() to opt-out of Next.js caching
const { data: { user } } = await supabase.auth.getUser()
```

### Route Handler Pattern (OAuth Callback)

```typescript
// app/auth/callback/route.ts
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (code) {
    const supabase = createServerClient(url, key, { cookies: { /* ... */ } })

    // Exchange code for session (PKCE flow)
    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Redirect to dashboard
    }
  }
}
```

### Email Confirmation URL Template

Modify email template in Auth settings:
```
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
```

Create route handler at `/auth/confirm/route.ts`:
```typescript
const { token_hash, type } = url.searchParams
const { data: { session }, error } = await supabase.auth.verifyOtp({
  token_hash,
  type: type as EmailOtpType,
})
```

## Google OAuth Setup

### Configuration Requirements

1. **Create OAuth Client at Google Cloud Console**:
   - Type: Web application
   - Authorized JavaScript origins: Your app URL (e.g., `https://example.com`)
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`

2. **Scopes** (configured in Google console):
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - Additional scopes may trigger verification process (can take weeks)

3. **Add to Supabase Dashboard**:
   - Authentication → Providers → Google
   - Paste Client ID and Secret
   - Save

### Client-Side Integration

```typescript
// Basic OAuth redirect
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
})

// With PKCE flow and callback
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://example.com/auth/callback',
  },
})

// Request refresh token (offline access)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    queryParams: {
      access_type: 'offline',            // REQUIRED for refresh token
      prompt: 'consent',                 // Force consent screen (for multi-account)
    },
  },
})
```

### Provider Token Access

```typescript
// After OAuth sign-in
const { data: { session } } = await supabase.auth.getSession()

// Provider tokens available in:
session.user.user_metadata.provider_token    // Google access token
session.user.user_metadata.provider_refresh_token  // Google refresh token (if offline access)

// IMPORTANT: Supabase does NOT auto-refresh these tokens
// Must implement refresh logic yourself on backend
```

## GitHub OAuth Setup

### Configuration Requirements

1. **Create OAuth App on GitHub**:
   - Settings → Developer settings → OAuth apps
   - Authorization callback URL: `https://<project-ref>.supabase.co/auth/v1/callback`
   - Keep Device Flow disabled

2. **Add to Supabase Dashboard**:
   - Copy Client ID and Client Secret
   - Authentication → Providers → GitHub
   - Save

3. **Redirect Allow List**:
   - For PKCE flow, add your callback URL to allow list

### Client-Side Integration

```typescript
// Basic OAuth
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
})

// With PKCE flow
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: 'https://example.com/auth/callback',
  },
})

// Sign out
await supabase.auth.signOut()  // Clears browser session and localStorage
```

### GitHub-Specific Constraints

- OAuth app scopes configured in GitHub settings (not dynamic)
- Refresh tokens only returned if requested during app registration
- No automatic token refresh - must handle on backend

## Local Development Gotchas

### Social Auth in Local Dev

For `http://localhost:3000`:
1. Add `http://localhost:<port>` to OAuth provider's authorized origins
2. Register callback: `http://localhost:3000/auth/v1/callback`
3. Configure in `supabase/config.toml`:
```toml
[auth.external.google]
enabled = true
client_id = "..."
secret = "..."
redirect_uri = "http://localhost:3000/auth/v1/callback"
```

### Session Persistence Considerations

- `persistSession: true` stores tokens in localStorage (XSS risk in dev)
- Set `detectSessionInUrl: false` for SSR apps
- Test cookie-based flows separately from localStorage flows

## Error Handling Patterns

### Common Error Codes

```typescript
// User exists
{ message: "User already registered", status: 422 }

// Invalid credentials
{ message: "Invalid login credentials", status: 400 }

// Email not confirmed
{ message: "Email not confirmed", status: 403 }

// MFA required
{ message: "MFA authentication required", status: 403 }

// OTP expired
{ message: "Token expired or invalid", status: 400 }

// Password too weak
{ message: "Password too weak", status: 422 }
```

## Version Information

- **Documentation retrieved**: October 29, 2025
- **Supabase Auth**: v2.x (GoTrue-based, JWT tokens)
- **Client libraries**: @supabase/supabase-js 2.x, @supabase/ssr 0.x
- **Next.js helpers**: @supabase/ssr package for server-side auth
