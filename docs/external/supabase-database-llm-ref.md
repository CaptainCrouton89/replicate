# Supabase Database LLM Reference

## Critical Signatures

### Query Building Chain
All database operations return `Promise<{ data: T | null, error: PostgrestError | null }>`. Chain operations before awaiting:

```typescript
const { data, error } = await supabase
  .from('table_name')
  .select(...)
  .filter(...)
  .order(...)
  .limit(...)
  .single()  // or .maybeSingle()
```

### SELECT
```typescript
.select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean })
```
- **columns**: CSV format, supports renaming: `'id, name:user_name, col:othercol'`
- **count: 'exact'**: Returns `count` property with total matching rows (slow on large tables)
- **count: 'planned'**: PostgreSQL query planner estimate (faster, approximate)
- **count: 'estimated'**: Uses table statistics (fastest, least accurate)
- **head: true**: Fetch headers only (for metadata/existence checks)
- **Default row limit**: 1,000 rows (configurable in API settings)

### INSERT
```typescript
.insert(values: object | object[], options?: { count?: 'exact' | 'planned' | 'estimated' })
```
- **values**: Single object OR array of objects
- **No return by default**: Chain `.select()` to retrieve inserted records
- **Bulk inserts**: Pass array for multiple records in single request
- Returns inserted data only if `.select()` chained

```typescript
// Single insert without return
await supabase.from('users').insert({ name: 'Alice' })

// Bulk insert with return
const { data } = await supabase
  .from('users')
  .insert([
    { name: 'Alice' },
    { name: 'Bob' }
  ])
  .select()
```

### UPDATE
```typescript
.update(values: object, options?: { count?: 'exact' | 'planned' | 'estimated' })
```
- **REQUIRES filter**: Must chain `.eq()`, `.in()`, etc. or operation fails silently
- **No return by default**: Chain `.select()` after filter to retrieve updated records
- Works on multiple records with single filter

```typescript
// WRONG - no effect, no error
await supabase.from('users').update({ status: 'active' })

// CORRECT
await supabase
  .from('users')
  .update({ status: 'active' })
  .eq('id', 1)
  .select()
```

### DELETE
```typescript
.delete(options?: { count?: 'exact' | 'planned' | 'estimated' })
```
- **REQUIRES filter**: Must chain filters or operation fails silently
- **No return by default**: Chain `.select()` after filter to get deleted records
- Respects RLS policies: Only deletes visible rows

```typescript
// Delete single
await supabase.from('users').delete().eq('id', 1)

// Batch delete
await supabase.from('users').delete().in('id', [1, 2, 3])

// Get deleted rows
const { data } = await supabase
  .from('users')
  .delete()
  .eq('id', 1)
  .select()
```

### UPSERT
```typescript
.upsert(values: object | object[], options?: { onConflict?: string, count?: 'exact' | 'planned' | 'estimated' })
```
- **Primary key required**: Must include primary key in values (usually `id`)
- **onConflict**: Alternative column to detect duplicates (default: primary key)
- **Insert if missing, update if exists**: Automatic behavior
- Returns inserted/updated records

```typescript
// Upsert by primary key
await supabase
  .from('users')
  .upsert({ id: 1, name: 'Alice', updated_at: new Date() })
  .select()

// Upsert by custom column
await supabase
  .from('users')
  .upsert(
    { email: 'alice@example.com', name: 'Alice' },
    { onConflict: 'email' }
  )
  .select()
```

## Filter Operators

All filters can be chained. Multiple filters are AND'ed together:

```typescript
.eq('column', value)          // Column = value
.neq('column', value)         // Column != value
.gt('column', value)          // Column > value
.gte('column', value)         // Column >= value
.lt('column', value)          // Column < value
.lte('column', value)         // Column <= value
.like('column', pattern)      // ILIKE pattern (case-insensitive substring)
.ilike('column', pattern)     // ILIKE pattern with % wildcards
.in('column', [val1, val2])   // Column in (val1, val2, ...)
.contains('column', value)    // JSONB contains (for arrays/objects)
.containedBy('column', value) // Contained by value (for arrays)
.overlaps('column', value)    // Arrays overlap (have common elements)
.is('column', null)           // Column IS NULL (use for null checks!)
.filter(column, operator, PostgRestSyntax) // Raw PostgREST syntax
```

### Filter Examples
```typescript
// NULL checks (use .is(), not .eq())
.is('deleted_at', null)       // Correct
.eq('deleted_at', null)       // Wrong - doesn't work!

// Arrays and ranges
.in('status', ['active', 'pending'])
.filter('id', 'in', '(1,2,3)') // Raw PostgREST syntax with parens

// JSONB
.contains('metadata', { admin: true })

// Patterns
.like('name', '%alice%')       // Contains "alice"
.ilike('email', 'alice@%.com') // Case-insensitive domain

// Text search (see Full-Text Search section)
.textSearch('content', 'search terms', { config: 'english' })
```

## Ordering & Pagination

### ORDER
```typescript
.order(column: string, options?: { ascending?: boolean, nullsFirst?: boolean, referencedTable?: string })
```
- **ascending: false** → descending order (default: true)
- **nullsFirst: true** → nulls come first (default varies by DB config)
- **referencedTable**: Order by related table column
- Can be chained multiple times for multi-column sort

```typescript
// Single column, descending
.order('created_at', { ascending: false })

// Multi-column
.order('status').order('created_at', { ascending: false })

// On related table
.order('user(name)', { referencedTable: 'user' })
```

### LIMIT & RANGE (Pagination)
```typescript
.limit(count: number, options?: { referencedTable?: string })
.range(from: number, to: number, options?: { referencedTable?: string })
```
- **limit**: Max rows to return
- **range**: 0-based inclusive indices: `range(0, 9)` returns 10 rows (0-9)
- **from/to values are inclusive**: `range(1, 3)` = rows at positions 1, 2, 3
- **Without explicit order, results unpredictable**: Always `.order()` before `.range()`
- **referencedTable**: Limit on related table, not primary table

```typescript
// Pagination pattern
const pageSize = 10
const page = 2
const from = (page - 1) * pageSize  // 10
const to = from + pageSize - 1      // 19
.order('id').range(from, to)        // Rows 10-19 (20th row is first on page 2)

// Get total count with pagination
.select('*', { count: 'exact' })
.range(from, to)
// Returns { data: [...], count: totalRows }
```

## Single Row Operations

### SINGLE
```typescript
.single()
```
- **Converts array to object**: `data` is `T` not `T[]`
- **MUST match exactly 1 row**: Errors if 0 or >1 rows match
- Chain with `.limit(1)` for safety
- **Common pattern**: `.limit(1).single()` to get one record or error

```typescript
const { data: user } = await supabase
  .from('users')
  .select()
  .eq('id', 1)
  .single()  // If no rows match: error
```

### MAYBESINGLE
```typescript
.maybeSingle()
```
- **Like `.single()` but returns null if no rows**: `data: T | null`
- **Still errors if >1 rows match**
- Preferred when record may not exist

```typescript
const { data: user } = await supabase
  .from('users')
  .select()
  .eq('id', 999)
  .maybeSingle()  // Returns null if not found
```

## Complex Queries

### Full-Text Search
```typescript
.textSearch(column: string, query: string, options?: { config?: string, type?: 'plain' | 'phrase' | 'websearch' })
```
- **type: 'plain'**: Converts spaces to AND operators automatically
- **type: 'phrase'**: Exact phrase matching with proximity operators
- **type: 'websearch'**: Web search syntax (quotes, "or", negation with -)
- **config**: Language (e.g., 'english', 'french', 'spanish')
- **Performance**: Index `tsvector` columns with generated columns for speed

```typescript
// Web search style - most user-friendly
.textSearch('content', '"harry potter" or "percy jackson" -vampires', { type: 'websearch', config: 'english' })

// Plain text - automatic AND
.textSearch('title', 'solaris andromeda', { type: 'plain' })  // Finds "solaris AND andromeda"

// Manual operators
.textSearch('content', "'eggs' & 'ham'", { type: 'phrase' })
```

### Joins via Foreign Keys
Supabase automatically handles foreign key relationships:

```typescript
// Select related data (implicit left join)
.select(`
  id,
  name,
  user:user_id(id, email, name)
`)

// Inner join (only match if related record exists)
.select(`
  id,
  name,
  user:user_id!inner(id, email, name)
`)
.not('user_id', 'is', null)  // Redundant with !inner but explicit

// Multiple relations
.select(`
  id,
  title,
  author:user_id(name),
  comments:post_id(id, text)
`)
```

**Key constraints**:
- Foreign key must exist in database schema
- Related table alias syntax: `localColumn:fkColumn(fields)` or `relationName(fields)`
- Use `!inner` for inner joins (require matching related record)
- Array relations nest as arrays: `comments:post_id()` returns array if one-to-many

### Filtering on Related Tables
```typescript
// Filter by related table field
.select(`id, name, user:user_id(*)`)
.filter('user.email', 'like', '%@gmail.com')

// Combine with local filters
.eq('status', 'active')
.filter('user.name', 'ilike', 'alice')
```

## Transactions & Batch Operations

### Batch Inserts
```typescript
await supabase
  .from('table')
  .insert([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' }
  ])
  .select()
```

### Batch Updates
```typescript
await supabase
  .from('table')
  .update({ status: 'archived' })
  .in('id', [1, 2, 3])
  .select()
```

### Batch Deletes
```typescript
await supabase
  .from('table')
  .delete()
  .in('id', [1, 2, 3])
```

### Transactions (SQL Functions Required)
**No client-side transactions available.** Create PostgreSQL function and call via RPC:

```typescript
// In PostgreSQL (create this function):
CREATE OR REPLACE FUNCTION transfer_funds(
  source_id INT,
  dest_id INT,
  amount DECIMAL
) RETURNS VOID AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = source_id;
  UPDATE accounts SET balance = balance + amount WHERE id = dest_id;
END;
$$ LANGUAGE plpgsql;

// In JavaScript - function is transactional automatically
const { error } = await supabase.rpc('transfer_funds', {
  source_id: 1,
  dest_id: 2,
  amount: 100
})
```

**Why**: All SQL in PostgreSQL function executes atomically (transaction-like). Either all statements succeed or all roll back.

## Remote Procedure Calls (RPC)

```typescript
.rpc(functionName: string, params?: object, options?: { get?: boolean })
```
- **Calls PostgreSQL function**: Must exist in database
- **params**: Object keys match function parameter names
- **get: true**: Execute on read-only replica instead of primary
- **Returns function output**: Shape depends on `RETURNS` type in function definition

```typescript
// Simple function with no parameters
const { data } = await supabase.rpc('get_user_count')

// Function with parameters
const { data } = await supabase.rpc('get_user_by_email', {
  email: 'alice@example.com'
})

// On read replica
const { data } = await supabase.rpc('expensive_aggregation', undefined, { get: true })

// Chain filters on function that returns table rows
const { data } = await supabase
  .rpc('list_active_users')
  .eq('status', 'premium')
  .select()
```

## TypeScript Type Safety

### Generate Types from Schema
```bash
# Install CLI
npm install supabase@">=1.8.1" --save-dev

# Generate types
npx supabase gen types typescript --project-id "$PROJECT_REF" > database.types.ts

# For local development
npx supabase gen types typescript --local > database.types.ts
```

### Use Generated Types
```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
)

// Now fully typed:
const { data } = await supabase
  .from('users')
  .select()
  .eq('id', 1)
  .single()
// data is inferred as Database['public']['Tables']['users']['Row']
```

### Helper Types
```typescript
import type { Database } from './database.types'

// Get table row type
type User = Database['public']['Tables']['users']['Row']

// Get insert type (no id, timestamps)
type UserInsert = Database['public']['Tables']['users']['Insert']

// Get update type (all fields optional)
type UserUpdate = Database['public']['Tables']['users']['Update']
```

### Custom JSON/JSONB Types (v2.48.0+)
Supabase can infer JSON field structure. Define `Json` types in your database schema for better type inference:

```typescript
// If you have a custom JSON field in database:
type Metadata = Database['public']['Tables']['posts']['Row']['metadata']
// Now metadata is properly typed, not just 'any'
```

## Non-Obvious Behaviors & Gotchas

### Update & Delete Without Filters
- ❌ `await supabase.from('table').update({...})` → **Silent no-op, no error**
- ❌ `await supabase.from('table').delete()` → **Silent no-op, no error**
- ✅ Always chain filter: `.eq()`, `.in()`, `.filter()`, etc.

### NULL Checks
- ❌ `.eq('column', null)` → **Doesn't work** (SQL IS NULL != comparison)
- ✅ `.is('column', null)` → **Correct**

### Default Row Limit
- **1,000 rows maximum** returned by default
- Change in API settings for your project
- Paginate with `.range()` for larger result sets

### select() Must Come First in Chain
```typescript
// WRONG - might not work
.filter('status', 'eq', 'active').select()

// RIGHT - select() first
.select().filter('status', 'eq', 'active')
```

### range() is Inclusive on Both Ends
- `range(0, 9)` returns 10 rows (indices 0, 1, 2, ..., 9)
- Off-by-one errors common: `range(from, from + limit - 1)`

### Realtime Subscriptions Need Initial Load
Real-time listeners don't load existing data—subscribe AFTER fetching current state:

```typescript
// Load current state first
const { data: messages } = await supabase
  .from('messages')
  .select()
  .order('created_at')

// Then listen for changes
const channel = supabase
  .channel('messages')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
    console.log(payload)
  })
  .subscribe()
```

### Ordering Before range() is Critical
Without explicit `.order()`, `range()` returns unpredictable rows:

```typescript
// Unpredictable order
.range(0, 9)

// Predictable
.order('id').range(0, 9)
```

### count: 'exact' is Slow
- Scans entire result set for exact count
- Use `count: 'planned'` or `count: 'estimated'` for large tables
- Consider caching pagination metadata

### Foreign Key Syntax is Non-intuitive
```typescript
// Correct relationship syntax
.select(`id, name, user:user_id(email, name)`)

// NOT .select(`id, name, user(email, name)`)
// Foreign key column name (user_id) is used as alias, not table name
```

### !inner Requires Specific Syntax
```typescript
// Correct inner join
.select(`id, title, user:user_id!inner(name)`)

// NOT .select(`id, title, !inner user:user_id(name)`)
// !inner goes AFTER the relationship definition
```

### Realtime Filter Limit
- Maximum 100 values in realtime filter: `filter: 'id=in.(1,2,3,...,100)'`
- Exceeding 100 values silently fails to filter

### head: true Returns No Data
```typescript
// Returns empty data array, but count is populated
.select('*', { head: true, count: 'exact' })
// Returns { data: [], count: totalRows }
```

## Row-Level Security (RLS) Interactions

- RLS policies automatically applied to all queries
- DELETE respects DELETE policies (only deletes visible rows)
- UPDATE respects SELECT (see existing) + UPDATE policies
- Cannot bypass RLS from JavaScript client
- Service Role key bypasses RLS (backend only, never client)

## Version

**Current as of 2025-10-29**
- supabase-js: v2.48.0+ (JSON type inference)
- PostgreSQL: 15.x (latest in Supabase projects)
- Realtime: PostgREST v11+
