# Supabase Row Level Security LLM Reference

## Critical Policy Signatures

### Core Policy Syntax
```sql
CREATE POLICY "policy_name"
ON table_name
FOR operation
TO role
USING (condition)
WITH CHECK (condition);
```

**Key Parameter Constraints:**
- `operation`: SELECT, INSERT, UPDATE, DELETE
- `role`: authenticated, anon, service_role, or comma-separated list (omit to apply to all)
- `USING`: Required for SELECT/DELETE; defines which rows users can read
- `WITH CHECK`: Required for INSERT/UPDATE; defines valid modified row state
- Policies are implicit WHERE clauses that combine with explicit WHERE conditions

### Operation-Specific Patterns

**SELECT** (USING only):
```sql
CREATE POLICY "view_own"
ON profiles
FOR SELECT
USING ((SELECT auth.uid()) = user_id);
```

**INSERT** (WITH CHECK only):
```sql
CREATE POLICY "create_own"
ON profiles
FOR INSERT
WITH CHECK ((SELECT auth.uid()) = user_id);
```

**UPDATE** (USING + WITH CHECK):
- `USING`: Determines which existing rows can be updated
- `WITH CHECK`: Validates modified row state
- Both must pass for operation to succeed
- If `WITH CHECK` omitted, `USING` applies to both conditions

```sql
CREATE POLICY "update_own"
ON profiles
FOR UPDATE
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);
```

**DELETE** (USING only):
```sql
CREATE POLICY "delete_own"
ON profiles
FOR DELETE
USING ((SELECT auth.uid()) = user_id);
```

## Core Auth Functions

### auth.uid()
- **Returns**: UUID of currently authenticated user, or NULL if anonymous
- **Critical behavior**: Conditions fail silently when auth.uid() = NULL
- **Performance trick**: Wrap in SELECT: `(SELECT auth.uid())` triggers initPlan optimization (up to 99% performance gain)
- **When to use**: User ownership checks, direct user ID comparisons

### auth.jwt()
- **Returns**: Complete JWT claims object (jsonb)
- **Access pattern**: `auth.jwt() ->> 'field'` for text or `auth.jwt() -> 'nested' -> 'field'` for json
- **Critical distinction**:
  - `raw_user_meta_data`: Mutable by users—avoid for authorization
  - `raw_app_meta_data`: Immutable—SAFE for authorization logic
- **Common claims**:
  - `sub`: User ID (UUID)
  - `email`: User email
  - `phone`: User phone
  - `role`: 'authenticated', 'anon', or 'service_role'
  - `aal`: Authentication assurance level ('aal1' or 'aal2')
  - `is_anonymous`: Boolean
  - `app_metadata`: Custom immutable claims (object)
  - `user_metadata`: Custom mutable data (object)

### current_setting('request.jwt.claims')
- **Returns**: Raw JWT claims as JSON string
- **Use case**: Direct claim access in complex policy logic
- **Pattern**: Cast to jsonb and extract nested claims
- **Performance benefit**: Zero disk I/O, eliminates thousands of database queries

## Critical Behaviors

### Enabling RLS
```sql
ALTER TABLE schema.table_name ENABLE ROW LEVEL SECURITY;
```
- **Critical**: Once enabled, NO data accessible via anon key until policies created
- **Default**: RLS enabled by default on new tables created via dashboard
- **Must-do**: Policies on ALL public schema tables that expose via API

### SELECT Policy Requirement for Updates
- UPDATE operations require a corresponding SELECT policy to function
- If SELECT policy denies a row, UPDATE cannot modify it even if UPDATE policy allows
- Policy denial is silently enforced—no error messages

### Role Targeting Best Practices
- **Always specify**: `TO authenticated` instead of omitting TO clause
- **Benefit**: Eliminates unnecessary policy evaluation for anon users, improves query performance
- **Pattern**: Never leave TO clause blank on production policies

### Service Keys Bypass RLS Entirely
- Service role keys ignore all RLS policies
- **CRITICAL**: Never expose in browser or to clients
- Use case: Trusted backend servers, migrations, admin operations
- Authorization header: `Authorization: Bearer {service_key}`

## Performance Patterns

### 1. Wrap Functions in SELECT (Critical)
**WRONG (slow):**
```sql
USING (is_admin() OR auth.uid() = user_id)
```

**CORRECT (fast—up to 99% improvement):**
```sql
USING ((SELECT is_admin()) OR (SELECT auth.uid()) = user_id)
```

**Why**: Forces Postgres optimizer to create initPlan, caching result per statement instead of per-row evaluation.

### 2. Index Policy Filter Columns
- Add B-tree indexes to non-PK columns used in RLS conditions
- Example: `CREATE INDEX idx_user_id ON profiles USING BTREE (user_id);`
- **Performance gain**: 171ms → <0.1ms on 100K-row tables (100x+)
- **Critical**: Without indexes, sequential scans evaluate policy for every row

### 3. Restrict Queries with Explicit WHERE
- RLS is implicit WHERE—combine with explicit filters for better query planning
- **Pattern**: Replicate policy logic in application WHERE clauses
- **Benefit**: Allows Postgres to construct optimal query plan earlier

### 4. Optimize Join Direction in Policies
**WRONG (slow - cascading joins):**
```sql
USING (auth.uid() IN (SELECT user_id FROM team_users WHERE team_users.team_id = table.team_id))
```

**CORRECT (fast - pre-compute teams):**
```sql
USING (team_id IN (SELECT team_id FROM team_users WHERE user_id = (SELECT auth.uid())))
```

**Why**: Inverted pattern reduces rows scanned per evaluation.

### 5. Use Security Definer Functions for Cascading Lookups
- Bypass RLS on lookup tables in policies via `SECURITY DEFINER`
- **Pattern**: Create function wrapping join logic, call from policy
- **Benefit**: Prevents cascading RLS evaluation across multiple tables

### 6. Avoid B-Tree Indexes on Array Fields
- B-tree indexes may not be used during RLS array operations
- **Problem**: Results in sequential scans instead of index scans on large tables
- **Solution**: Use `GIN` indexes for array columns if used in RLS

### Anti-Pattern
- Cascading RLS evaluation across 3+ tables without security definer functions
- **Risk**: Timeouts on 1M+ row tables due to exponential row evaluation

## Multi-Tenant Patterns

### Pattern: tenant_id in app_metadata
```sql
-- Create helper function
CREATE OR REPLACE FUNCTION auth.tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(
    ((current_setting('request.jwt.claims')::jsonb ->> 'app_metadata')::jsonb ->> 'tenant_id'),
    '')::uuid
$$ LANGUAGE sql;

-- Use in policies
CREATE POLICY "tenant_isolation"
ON shared_table
FOR SELECT
USING (tenant_id = (SELECT auth.tenant_id()));
```

**Critical**: Use `app_metadata`, NOT `user_metadata` (immutable vs mutable)

### Shared vs Isolated Tables
- **Shared tables**: Single table with tenant_id column, RLS policies filter by tenant
- **Isolated tables**: Separate schema per tenant
- **Recommendation**: Shared tables reduce maintenance overhead, requires careful indexing

### Performance with Multi-Tenancy
- **Index recommendation**: Add index on both user_id and tenant_id columns used in policies
- **Common pitfall**: Omitting tenant_id index causes sequential scan across entire tenant's data
- **Anti-pattern**: Using join to `tenants_to_users` table—adds SELECT per query

## Custom Claims & JWT Patterns

### JWT Field Reference
**Always Present:**
- `sub`: User ID (UUID)
- `email`: Email address
- `phone`: Phone number
- `role`: Role type (authenticated, anon, service_role)
- `aal`: Authenticator assurance level (aal1, aal2)
- `session_id`: Unique session ID
- `iat`: Issued at (Unix timestamp)
- `exp`: Expiration (Unix timestamp)
- `iss`: Issuer URL
- `aud`: Audience (project reference)

**Optional:**
- `jti`: JWT ID (unique identifier)
- `nbf`: Not before (Unix timestamp)
- `app_metadata`: Custom immutable claims (object)
- `user_metadata`: Custom mutable claims (object)
- `is_anonymous`: Boolean flag
- `amr`: Authentication methods used (array of strings)

### Custom Access Token Hook Pattern
- Runs pre-token issuance to inject custom claims
- Modifies `event.claims` object before return
- Hook payload includes user row data

**Example: Adding user_role**
```sql
CREATE OR REPLACE FUNCTION custom_claims_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role FROM public.user_roles
  WHERE user_id = (event ->> 'user_id')::uuid;

  event := jsonb_set(
    event,
    '{claims,user_role}',
    to_jsonb(COALESCE(user_role, 'user'))
  );
  RETURN event;
END;
$$ LANGUAGE plpgsql;
```

### Accessing Custom Claims in RLS
```sql
-- Extract from auth.jwt()
(SELECT auth.jwt() ->> 'user_role')

-- Extract from current_setting
((current_setting('request.jwt.claims')::jsonb ->> 'app_metadata')::jsonb ->> 'organization_id')

-- Array access pattern for team claims
team_id IN (SELECT auth.jwt() -> 'app_metadata' -> 'teams')
```

## Storage RLS Patterns

### Storage Requires RLS on storage.objects
```sql
-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Grant INSERT (required for uploads)
CREATE POLICY "allow_authenticated_uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'my_bucket');

-- Grant SELECT (required for downloads)
CREATE POLICY "allow_downloads"
ON storage.objects
FOR SELECT
USING (bucket_id = 'my_bucket');
```

**Critical**: By default, storage allows NO uploads without RLS policies on storage.objects table

### User-Scoped Storage Access
```sql
CREATE POLICY "users_own_files"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
```

### Folder-Based Restrictions
- Use `storage.foldername(name)` to parse path hierarchy
- Example: `/user-123/avatar.jpg` → `['user-123', 'avatar.jpg']`
- **Pattern**: `(storage.foldername(name))[1] = user_identifier`

### Bypassing Storage RLS
- Service role keys ignore storage RLS policies completely
- Use service_key in Authorization header for trusted backends
- **Risk**: Exposes all files if key leaked

## Realtime RLS Authorization

### Core Pattern
Realtime channels enforce RLS on `realtime.messages` table via policies tied to topic.

```sql
CREATE POLICY "broadcast_auth"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.extension = 'broadcast'
  AND topic = (SELECT auth.jwt() ->> 'custom_topic')
);
```

### Helper Functions
- **`realtime.topic()`**: Returns the channel topic being accessed
- **`realtime.extension`**: 'broadcast', 'presence', or other extension type

### Broadcast vs Presence
- **Broadcast**: `realtime.extension = 'broadcast'`—one-way messaging
- **Presence**: `realtime.extension = 'presence'`—user online status

### Critical: Enable Private Channels
- Set `private: true` in channel instantiation on client
- Disable 'Allow public access' in Realtime Settings
- Without this, policies don't enforce (channels public by default)

### Performance Note
Realtime caches authorization during connection; updates only on JWT refresh or reconnect. Complex RLS policies increase connection latency.

## Debugging & Testing

### Check if RLS Enabled
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE rowsecurity = true;
```

### List All Policies
```sql
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'your_table';
```

### Test Policy as Specific User (PostgreSQL Only)
```sql
-- Set role context
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "user-uuid-here"}';

-- Execute query—will be filtered by RLS
SELECT * FROM your_table;
```

### Using PostgREST `.explain()`
```javascript
// Get execution plan for RLS query
const { data, error } = await supabase
  .from('table')
  .select('*')
  .explain();
```

### Enable Query Explain in PostgREST
```sql
ALTER ROLE authenticator SET pgrst.db_plan_enabled TO true;
```

### Common Test Pattern
1. Create test user with known UUID
2. Insert rows owned by that user
3. Set JWT context to test user
4. Verify only owned rows returned
5. Test with different user/anonymous—should return nothing

### Silent Failures to Expect
- `auth.uid()` returns NULL when unauthenticated—policy silently rejects
- UPDATE with only WITH CHECK failure—no error, just 0 rows updated
- DELETE by anonymous user—0 rows affected, no error
- **Gotcha**: Can't distinguish "denied by RLS" from "no matching rows" from client

## Edge Cases & Gotchas

### Views and RLS
- Views bypass RLS by default unless created with `SECURITY_INVOKER = true` (Postgres 15+)
- **Gotcha**: Querying table directly applies RLS; querying view skips it
- **Fix**: Add `SECURITY INVOKER` to view definition for RLS to apply

### Functions and RLS
- Functions execute with `SECURITY DEFINER` by default (use function owner's permissions)
- RLS applies only if function runs `SECURITY INVOKER`
- **Use case**: Security definer lookup functions bypass RLS on helper tables

### NULL Handling
- `NULL = NULL` returns NULL, not true
- RLS condition `column = NULL` will always fail
- **Fix**: Use `IS NULL` for null comparisons

### Anonymous Users
- `auth.uid()` returns NULL—conditions fail
- `auth.jwt()` returns JWT with `"role": "anon"` and `"is_anonymous": true`
- Still need policies for anon access—default is deny-all

### Policy Precedence
- Multiple policies on same table are OR'd together
- If ANY policy allows, row is returned
- At least one policy must allow operation
- **Gotcha**: Can accidentally over-permit with multiple policies

### Case Sensitivity
- Column names case-sensitive in policies (SQL identifier rules)
- String comparisons case-sensitive by default
- Use `ILIKE` or `LOWER()` for case-insensitive comparisons

### JWT Expiration
- Custom claims only in current JWT
- Claims don't persist in database
- Must use auth hooks to re-inject claims on each token refresh
- **Gotcha**: Old tokens still have old claims until they expire

## Configuration Objects

### RLS Enable/Disable
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

### Realtime Channel Config
```javascript
const channel = supabase.channel('channel_name', {
  config: {
    broadcast: { self: true },  // Allow own broadcasts
    presence: { key: 'online' },
    private: true  // CRITICAL: Enforce RLS on messages table
  }
});
```

### Custom Access Token Hook Config (Supabase Dashboard)
- Navigate to Auth → Hooks → Custom Access Token Hook
- SQL function must accept `event jsonb` and return modified `event jsonb`
- Function runs on every token issued (signup, login, refresh)

## Version Information
- **Latest**: Supabase 2025 (ongoing)
- **Postgres**: 12+ (RLS feature)
- **Realtime RLS**: Requires `private: true` on channels
- **Security Definer**: Standard Postgres feature
- **Auth.jwt()**: Supabase extension, stable
- **Custom Access Token Hook**: Available in all Supabase versions with Postgres

## Non-Obvious Performance Metrics

### Typical Bottlenecks
- Missing index on policy filter column: Sequential scan, 100-1000ms queries
- Not wrapping auth.uid() in SELECT: Function call per row, 10-50x slowdown
- Cascading RLS without security definer: Exponential complexity, timeouts on 1M+ rows
- Using tenants_to_users join: Extra SELECT per query, 2-10x overhead

### Quick Wins
1. Index all policy filter columns (100x improvement)
2. Wrap auth.uid() in SELECT (99% improvement)
3. Use security definer for lookup tables (eliminate cascading evaluation)
4. Restrict TO authenticated (eliminate anon policy checks)
5. Explicit WHERE in queries (better query planning)

## Critical Anti-Patterns

**DON'T:**
- Store authorization data in `user_metadata` (mutable by users)
- Create cascading RLS across 3+ tables without security definer
- Omit indexes on policy filter columns
- Use direct `auth.uid()` calls without SELECT wrapper
- Leave RLS disabled on public schema tables
- Expose service_role key to frontend
- Assume "no rows returned" means "denied by RLS" (could be legitimate empty result)
- Modify jwt claims without auth hooks (changes don't persist)

**DO:**
- Store authorization data in `app_metadata` (immutable)
- Use security definer functions for cascading lookups
- Index every non-PK column in policy conditions
- Wrap all auth functions in SELECT statements
- Enable RLS on all exposed tables
- Rotate service keys regularly, never share
- Test policies with explicit JWT context
- Use auth hooks for custom claims on every token
