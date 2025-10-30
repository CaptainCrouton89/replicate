# Vercel AI SDK UI - Documentation Index

This directory contains three complementary LLM-optimized reference documents for Vercel AI SDK UI React hooks.

## Document Overview

### 1. **vercel-ai-sdk-ui-llm-ref.md** (Main Reference)
**Purpose:** Comprehensive API signatures and configuration specifications
**Best for:** Looking up exact function parameters, return types, callbacks, configuration options

**Contents:**
- Critical hook signatures (useChat, useCompletion, useAssistant, useObject)
- Message structure and UIMessage format (v5+ parts array)
- Request-level options for dynamic configuration
- Utility functions (convertToModelMessages, pruneMessages, createUIMessageStream)
- Streaming patterns (persistent vs transient data)
- Tool integration patterns
- Message persistence and validation
- Configuration gotchas
- Message metadata patterns
- Version 5.0+ specifications

**Key Sections:**
```
Critical Hook Signatures
Message Structure (V5+)
Request-Level Options
Utility Functions
Streaming Patterns
Tool Integration Patterns
Configuration Gotchas
Performance Optimization
Message Metadata (V5+)
```

---

### 2. **vercel-ai-sdk-ui-advanced-patterns.md** (Patterns & Anti-patterns)
**Purpose:** Common bugs, breaking changes, and advanced usage patterns
**Best for:** Understanding what breaks code and how to fix it, advanced implementations

**Contents:**
- 10 critical gotchas with bug/fix pairs:
  1. Body parameter staleness
  2. Parts array structure (mandatory in v5)
  3. Tool call type narrowing requirement
  4. Transient data not in message.parts
  5. Message IDs required for persistence
  6. Input state management moved to developer
  7. onResponse callback removed
  8. convertToModelMessages with data parts
  9. Tool definition structure changes
  10. Throttle performance implications

- 6 advanced implementation patterns:
  - Type-safe tool responses with InferUITool
  - Custom fetch with auth headers
  - Message persistence with validation
  - Progressive artifact updates with data parts
  - Conditional tool execution
  - Message pruning for long conversations

- Common misunderstandings clarified
- V4 to V5 compatibility matrix

**Key Sections:**
```
Critical Gotchas That Break Code
Advanced Patterns
Common Misunderstandings
Version Compatibility Matrix
```

---

### 3. **vercel-ai-sdk-ui-quick-ref.md** (Cheat Sheet)
**Purpose:** Quick lookup reference for common tasks and decisions
**Best for:** Fast answers, code snippets, debugging checklist, selecting right hook

**Contents:**
- Hook selection matrix (when to use which hook)
- One-line imports/exports
- Critical configuration patterns
- Message parts quick guide
- Common code patterns:
  - Basic chat
  - With tool calls
  - Error recovery
  - Persistence
  - Performance optimization
  - Dynamic request options
- Data streaming patterns
- V5 migration checklist
- Version constraints
- Endpoint defaults
- Type safety helpers
- Debugging checklist
- Gotcha summary

**Key Sections:**
```
Hook Selection Matrix
ONE-LINE EXPORTS
Critical Configuration
Message Parts Quick Guide
Common Code Patterns
Data Streaming Patterns
V5 Migration Checklist
Debugging Checklist
Gotcha Summary
```

---

## How to Use These Documents

### "I need to know the exact API signature for useChat"
→ **vercel-ai-sdk-ui-llm-ref.md** - See "Critical Hook Signatures"

### "My code is broken, what went wrong?"
→ **vercel-ai-sdk-ui-advanced-patterns.md** - Search for your symptom in "Critical Gotchas"

### "I need to quickly build a chat component"
→ **vercel-ai-sdk-ui-quick-ref.md** - Copy pattern from "Common Code Patterns"

### "I'm migrating from V4 to V5"
→ **vercel-ai-sdk-ui-advanced-patterns.md** - See "V4 to V5 Breaking Changes" section

### "What data types does sendMessage accept?"
→ **vercel-ai-sdk-ui-llm-ref.md** - See "Message Structure (V5+)"

### "How do I handle tool calls?"
→ **vercel-ai-sdk-ui-llm-ref.md** or **vercel-ai-sdk-ui-quick-ref.md** - Search "Tool"

### "Why isn't my temperature setting changing?"
→ **vercel-ai-sdk-ui-advanced-patterns.md** - See Gotcha #1 "Body Parameter Staleness"

---

## Cross-Reference Map

| Topic | Primary Doc | Secondary |
|-------|-------------|-----------|
| Hook signatures | llm-ref | quick-ref |
| Configuration | llm-ref | advanced-patterns |
| Breaking changes | advanced-patterns | llm-ref |
| Code examples | quick-ref | advanced-patterns |
| Debugging | quick-ref | advanced-patterns |
| Message format | llm-ref | advanced-patterns |
| Tool integration | llm-ref | quick-ref |
| Streaming data | llm-ref | advanced-patterns |
| Persistence | llm-ref | advanced-patterns |
| Type safety | llm-ref | advanced-patterns |
| Performance | llm-ref | quick-ref |
| Error handling | quick-ref | advanced-patterns |

---

## Key Concepts at a Glance

### The Three Main Hooks

1. **useChat** - For conversation interfaces
   - State: `messages`, `input`, `isLoading`, `error`
   - Functions: `sendMessage()`, `regenerate()`, `stop()`
   - Best for: Chatbots, conversational AI

2. **useCompletion** - For text generation
   - State: `completion`, `input`, `isLoading`, `error`
   - Functions: `complete()`, `stop()`
   - Best for: Auto-complete, text generation

3. **useAssistant** - For OpenAI Assistant API
   - State: `messages`, `threadId`, `status`, `error`
   - Functions: `submitMessage()`, `setThreadId()`, `stop()`
   - Best for: Persistent thread-based conversations

### Message Structure (Critical)

**V4 (Old):**
```typescript
message.content // ✗ Doesn't exist in V5
```

**V5+ (Current):**
```typescript
message.parts // ✓ Array of typed content
message.parts[0].type // 'text' | 'image' | 'tool-*' | 'data' | 'source'
```

### Configuration Rule

**Static** (captured at hook init):
- `body` parameter
- `headers` object

**Dynamic** (evaluated at request time):
- Request-level options in `sendMessage()`
- `headers` function
- `useRef` for current component state

### The V4→V5 Breaking Changes

1. Message `.content` string → `.parts` array
2. Body parameter becomes static
3. Message IDs now required
4. `onResponse` removed → use `onData` + `onFinish`
5. Input state management moved to developer
6. Tool definition structure aligned

---

## Quick Command Reference

### "I'm using body parameter wrong"
```typescript
// WRONG (v5)
const { sendMessage } = useChat({ body: { userId } });

// RIGHT (v5)
await sendMessage({ text }, { body: { userId } });
```

### "How do I render a message?"
```typescript
message.parts.map(part => {
  switch (part.type) {
    case 'text': return <p>{part.text}</p>;
    case 'image': return <img src={part.data} />;
    case 'tool-getWeather': return <Weather args={part.args} />;
    default: return null;
  }
});
```

### "How do I handle tool calls?"
```typescript
if (toolCall.dynamic && toolCall.toolName === 'getWeather') {
  return await getWeather(toolCall.args);
}
```

### "How do I save/load messages?"
```typescript
// Save (messages already have IDs)
await db.save(messages);

// Load
const stored = await db.load(chatId);
const validated = await validateUIMessages(stored);
setMessages(validated);
```

### "Why is everything so slow?"
```typescript
useChat({ experimental_throttle: 30 })
```

---

## Version Information

- **Current Stable:** v5.x
- **Documented For:** v5.0 and later
- **Breaking Changes:** v4 → v5 are significant
- **Package:** `@ai-sdk/react`
- **Also Available:** `@ai-sdk/svelte`, `@ai-sdk/vue`, `@ai-sdk/angular`

---

## Most Common Mistakes

1. **Body parameter dynamism** - Passes stale values
2. **Accessing .content** - Doesn't exist in v5
3. **Missing message IDs** - Breaks persistence
4. **Skipping toolCall.dynamic check** - Type errors
5. **Ignoring transient data lifecycle** - Expects wrong data in parts
6. **Not validating loaded messages** - Silent failures
7. **Using onResponse** - Callback removed in v5
8. **convertToModelMessages without data handling** - Models can't process custom data
9. **Tool names not in definitions** - Runtime errors
10. **No throttle on long conversations** - Performance death

---

## File Statistics

- **vercel-ai-sdk-ui-llm-ref.md** - 512 lines, comprehensive API reference
- **vercel-ai-sdk-ui-advanced-patterns.md** - 602 lines, patterns and anti-patterns
- **vercel-ai-sdk-ui-quick-ref.md** - 298 lines, quick lookup and cheat sheet

**Total:** ~1,412 lines of LLM-optimized reference documentation

---

## Updates & Maintenance

These documents are current as of:
- **Latest API version:** 5.x (stable)
- **Documentation source:** ai-sdk.dev (October 2025)
- **Created:** October 29, 2025

For updates, refer to official docs at https://ai-sdk.dev/docs/ai-sdk-ui

