# Supabase Realtime LLM Reference

**Version: Latest (October 2025)**

This reference captures non-obvious signatures, constraints, and behaviors essential for correct Realtime implementation. Excludes basic concepts Claude already understands.

---

## Critical Function Signatures

### Channel Creation

```typescript
supabase.channel(
  topic: string,              // Required. Format: "scope:id:entity" or any string
  config?: {
    private: boolean          // Default: false. Changes auth requirements
    broadcast?: {
      self: boolean           // Default: false. Receive own broadcast messages
      ack: boolean            // Default: false. Wait for server confirmation
    }
    presence?: {
      key: string             // Optional. Custom presence identifier
                              // Default: auto-generated UUIDv1 on server
    }
  }
): RealtimeChannel
```

**Critical Gotcha**: Private and public channels sharing the same topic are **completely separate entities**. Messages don't cross between them.

### Subscription & Event Listening

```typescript
channel
  .on(
    event_type: 'broadcast' | 'postgres_changes' | 'presence',
    options: FilterConfig,
    callback: (payload: RealtimePayload) => void
  ): RealtimeChannel

// Must call .subscribe() to activate listeners
channel.subscribe(
  callback?: (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT') => void
): Promise<'ok' | 'error'>
```

**Non-Obvious**: Event listeners registered via `.on()` only activate after `.subscribe()` is called. Multiple `.on()` calls stack listeners.

### Channel Cleanup - CRITICAL

```typescript
// ALWAYS do this to prevent memory leaks
await supabase.removeChannel(channel)

// OR for cleanup in React useEffect
useEffect(() => {
  const channel = supabase.channel('topic:123')
  // ... setup listeners
  return () => { supabase.removeChannel(channel) }
}, [])
```

**Memory Leak Risk**: Not removing channels leaves them in `RealtimeClient.channels` array indefinitely. This causes unbounded memory growth and degraded Realtime performance.

---

## Broadcast Signatures

### Client-Side Send

```typescript
channel.send({
  type: 'broadcast',
  event: string,              // Can be anything EXCEPT 'realtime'
  payload: Record<string, any> // JSONB-serializable only
}): Promise<void>
```

**Constraint**: Event name cannot be `'realtime'` (reserved for system messages).

### REST API Broadcast (Server-Side)

```
POST https://<PROJECT_REF>.supabase.co/realtime/v1/api/broadcast

Headers:
  Authorization: Bearer <SUPABASE_ANON_KEY or SERVICE_ROLE_KEY>
  Content-Type: application/json

Body:
{
  "type": "broadcast",
  "event": string,
  "topic": string,            // Channel topic to broadcast to
  "payload": object
}
```

### Database-Level Broadcast

```sql
-- From trigger function
SELECT realtime.send(
  payload::jsonb,             -- Custom payload object
  event_name,                 -- Event name
  topic,                      -- Channel topic
  is_private_flag             -- true = private channel
)
```

**Behavior**: Messages published to channel without inserting to `realtime.messages` table (ephemeral - not persisted).

---

## Postgres Changes Listener

### Setup Requirements

```sql
-- 1. Create or ensure publication exists
CREATE PUBLICATION supabase_realtime FOR ALL TABLES;

-- 2. Explicitly add tables (won't auto-include tables added later)
ALTER PUBLICATION supabase_realtime ADD TABLE table_name;

-- 3. Create trigger function for broadcasts
CREATE OR REPLACE FUNCTION handle_table_changes()
RETURNS trigger AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    topic := 'topic:' || NEW.id,          -- Topic routing
    event := TG_OP,                       -- INSERT, UPDATE, DELETE
    operation := TG_OP,
    table_name := TG_TABLE_NAME,
    schema := TG_TABLE_SCHEMA,
    new_record := NEW,
    old_record := OLD
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach trigger to table
CREATE TRIGGER on_table_changes
AFTER INSERT OR UPDATE OR DELETE ON table_name
FOR EACH ROW
EXECUTE FUNCTION handle_table_changes();
```

### Client-Side Listener

```typescript
channel
  .on(
    'postgres_changes',
    {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',  // * = all events
      schema: string,                 // Schema name (usually 'public')
      table: string,                  // Table name
      filter?: string                 // Optional: column_name=eq.value
    },
    (payload: PostgresChangePayload) => {
      payload.new                      // New record (INSERT, UPDATE)
      payload.old                      // Old record (DELETE, UPDATE)
      payload.eventType                // 'INSERT' | 'UPDATE' | 'DELETE'
    }
  )
  .subscribe()
```

**Critical**: Tables must be explicitly added to the publication. Adding tables after publication creation requires manual `ALTER PUBLICATION`.

**Non-Obvious**: Postgres Changes publishes changes from **all users**, not just the current session. Filter with RLS policies or application logic.

---

## Presence Tracking

### Track User Presence

```typescript
channel
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      const response = await channel.track({
        user_id: user.id,
        name: user.name,
        cursor: { x: 0, y: 0 },
        // ... any custom state object
      })
      // response: { status: 'ok' | 'error' }
    }
  })

// Get current presence snapshot
const presenceState = channel.presenceState()
// Returns: Record<string, PresenceEntry[]>
// Each key maps to array of users with that presence key

// Stop tracking
await channel.untrack()
```

**Sync Event**: Fires when connection established or state changes. Returns complete channel presence state.

**Join Event**: Fires when new client joins. Access via `newState` property.

**Leave Event**: Fires when client stops tracking. Access via `leftPresences` property.

### Presence Key Configuration

```typescript
supabase.channel('topic', {
  config: {
    presence: {
      key: 'user-123'           // Custom identifier. Default: server-generated UUIDv1
    }
  }
})
```

**Constraint**: Max 10 presence keys per object (Free/Pro). Attempt to track beyond limit fails silently.

**Behavior**: CRDT-based synchronization means presence updates automatically propagate to all connected clients on the same channel.

---

## Authorization & Security

### RLS Policies (Required for Private Channels & Broadcast)

```sql
-- Must create policies on realtime.messages table

-- 1. Allow users to receive broadcasts
CREATE POLICY "users can receive broadcasts"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow if topic matches user's ID
  topic = 'topic:' || auth.uid()::text
);

-- 2. Allow users to send broadcasts
CREATE POLICY "users can send broadcasts"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- Only allow sending to own topics
  topic = 'topic:' || auth.uid()::text
);

-- 3. For presence tracking
CREATE POLICY "users can track presence"
ON realtime.messages
FOR ALL
TO authenticated
USING (
  realtime.topic() LIKE 'room:' || auth.uid()::text || ':%'
);
```

### JWT Token Handling

```typescript
// Set authorization before subscribing to private channels
await supabase.realtime.setAuth(access_token)

// OR pass during client creation
const supabase = createClient(url, key, {
  realtime: {
    headers: {
      Authorization: `Bearer ${access_token}`
    }
  }
})
```

**Critical**: JWT tokens are cached for the connection duration. New tokens only update cache when sent via `access_token` message. Short JWT expiration (30-60 minutes) ensures timely policy refreshes.

**Private Channel Requirement**: At least one read or write permission needed on `realtime.messages` table to join private channel.

---

## Rate Limits & Quotas

### By Pricing Tier

| Metric | Free | Pro | Enterprise |
|--------|------|-----|-----------|
| Concurrent connections | 200 | 500+ | 10,000+ |
| Messages/second | 100 | 500+ | 2,500+ |
| Channel joins/second | 100 | 500+ | 2,500+ |
| Channels per connection | 100 | 100 | 100+ |
| Presence keys per object | 10 | 10 | 10+ |
| Presence messages/second | 20 | 50+ | 1,000+ |
| Broadcast payload | 256 KB | 3,000 KB | 3,000+ KB |
| Postgres change payload | 1,024 KB | 1,024 KB | 1,024+ KB |

### Error Codes

```typescript
// WebSocket error messages when quotas exceeded:

'too_many_channels'     // Joining >100 channels per connection
'too_many_connections'  // Project concurrent connection limit hit
'too_many_joins'        // Channel join rate threshold exceeded
'tenant_events'         // Message throughput exceeded - auto-reconnect when normalized

// Payload truncation (not an error)
// When payload limit hit: new/old record includes only fields <64 bytes
```

### Message Size Limits

- **Broadcast payload**: 256 KB (Free) → 3,000 KB (Pro+)
- **Postgres change payload**: 1,024 KB (all tiers)
- **Byte limit**: 1 MB per message (hard limit)

---

## React Integration Patterns

### Proper useEffect Cleanup

```typescript
useEffect(() => {
  const channel = supabase
    .channel('room:123:messages')
    .on('broadcast', { event: 'message' }, (payload) => {
      console.log('New message:', payload.payload)
    })
    .subscribe()

  // MUST return cleanup function
  return () => {
    supabase.removeChannel(channel)
  }
}, []) // Empty deps = setup once on mount
```

**Non-Obvious**: Returning cleanup function is essential. Direct `unsubscribe()` doesn't remove channel from client's internal array.

### Presence with State Dependency

```typescript
useEffect(() => {
  const channel = supabase.channel(`room:${roomId}`)

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId })

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setUsers(Object.keys(state))
      })
    }
  })

  return () => {
    supabase.removeChannel(channel)
  }
}, [roomId, userId]) // Re-subscribe on room/user change
```

### Avoiding Callback Stale Closures

```typescript
// WRONG - callback references old state
const [messages, setMessages] = useState([])
useEffect(() => {
  const channel = supabase.channel('messages')
    .on('broadcast', { event: 'new' }, (payload) => {
      setMessages([...messages, payload.payload])  // stale closure
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}, []) // missing messages dependency

// RIGHT - use functional setState
const [messages, setMessages] = useState([])
useEffect(() => {
  const channel = supabase.channel('messages')
    .on('broadcast', { event: 'new' }, (payload) => {
      setMessages(prev => [...prev, payload.payload])  // no closure
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}, [])
```

---

## Connection Management

### Pool Sizing by Compute Tier

Supabase maintains separate connection pools for:
- **Auth Pool**: Authorization check validation
- **Subscription Management**: Maintaining subscriptions
- **WAL Pull**: Write-Ahead Log replication for Postgres Changes

| Tier | Auth | Subscr. | WAL |
|------|------|---------|-----|
| Nano-Micro | 2 | 2 | 2 |
| Small-Large | 5 | 4 | 4 |
| XL-2XL | 10 | 7 | 7 |
| 8XL+ | 15 | 9 | 9 |

**Replication Slots**: Up to 2 maintained (database broadcast + Postgres Changes).

### Automatic Cleanup

- Messages table: **3-day retention**, older tables auto-deleted
- Channel disconnect: **30-second automatic cleanup** of stale connections

---

## Non-Obvious Behaviors & Gotchas

### 1. Broadcast Messages Are Ephemeral

Messages sent via `.send()` or `realtime.send()` expire after 3 days and are not persisted for new subscribers. If you need message history, manually persist to a table.

### 2. Private Channel Topic Isolation

```typescript
// These are TWO DIFFERENT channels
supabase.channel('room:123', { private: false })
supabase.channel('room:123', { private: true })
// Messages don't cross between them
```

### 3. Presence Updates Are Not Guaranteed Ordered

CRDT-based synchronization doesn't guarantee message ordering. Multiple rapid presence updates may arrive out of order. Use timestamps in state if ordering matters.

### 4. Authorization Cache Duration

Authorization is cached for the connection lifetime. Changing permissions requires:
1. Client disconnects and reconnects
2. OR explicitly call `supabase.realtime.setAuth(newToken)`

**Security Issue**: Users with recently-revoked permissions can still access channel until reconnect.

### 5. Postgres Changes Requires Explicit Publication Membership

Tables added to database **after** publication creation are not automatically added. Must manually:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE new_table;
```

### 6. Self-Send Behavior

```typescript
channel.send({...}) // By default, client doesn't receive own message
channel.send({...}) // Enable with config.broadcast.self = true
```

### 7. Acknowledgment Pattern

```typescript
// Without ack: promise resolves when message sent to server
channel.send({...})

// With ack: promise resolves when server confirms
channel.send({...}, { ack: true })
// More reliable but slightly higher latency
```

### 8. Max Channels per Connection

Hitting the 100-channel limit per connection returns `too_many_channels` error. Design topics to minimize per-connection subscriptions.

### 9. Payload Field Truncation

When total payload exceeds limits, Postgres change payloads only include fields with values **≤64 bytes**. Very large fields are silently dropped. Monitor for missing data in listeners.

### 10. RLS Policy Performance Impact

Complex RLS policies on `realtime.messages` table increase connection latency and reduce join rates. Keep policies simple.

---

## Summary of Must-Know Constraints

| Constraint | Impact | Solution |
|-----------|--------|----------|
| No automatic channel cleanup | Memory leaks | Always call `removeChannel()` in cleanup |
| Private/public topic isolation | Lost messages | Be explicit about channel privacy |
| Authorization cached | Security lag | Call `setAuth()` for permission updates |
| Publication membership manual | Missed changes | Add tables explicitly to publication |
| Payload truncation on large rows | Silent data loss | Monitor for missing fields in payloads |
| 100-channel per-connection limit | Connection rejected | Design topic hierarchy to reduce subscriptions |
| 3-day message retention | No history | Persist broadcast messages manually |

---

## Critical API Methods Summary

```typescript
// Channel management
supabase.channel(topic, config?)           // Create channel
channel.subscribe(callback?)               // Activate listeners
supabase.removeChannel(channel)            // CRITICAL: cleanup
supabase.removeAllChannels()               // Clean all at once

// Event handling
channel.on(event, filters, callback)       // Register listener
channel.send(data)                         // Send broadcast/presence

// Presence
channel.track(state)                       // Start tracking
channel.untrack()                          // Stop tracking
channel.presenceState()                    // Get snapshot

// Authorization
supabase.realtime.setAuth(token)           // Update JWT token
```

