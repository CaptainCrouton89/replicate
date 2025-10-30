# Vercel AI SDK UI - Quick Reference Cheat Sheet

## Hook Selection Matrix

| Need | Hook | API Endpoint | Return State |
|------|------|--------------|--------------|
| Chat with streaming | `useChat` | `/api/chat` | `messages`, `sendMessage()` |
| Text completion | `useCompletion` | `/api/completion` | `completion`, `complete()` |
| OpenAI Assistant API | `useAssistant` | custom, returns AssistantResponse | `messages`, `submitMessage()` |
| Streamed JSON objects | `useObject` | custom | `object` (partial during stream) |

## ONE-LINE EXPORTS

```typescript
// From @ai-sdk/react
import {
  useChat,           // Main chat hook
  useCompletion,     // Text completion
  useAssistant,      // OpenAI Assistant
  useObject,         // Streamed objects
} from '@ai-sdk/react';

// From ai/ui-utils
import {
  convertToModelMessages,    // UIMessage[] → ModelMessage[]
  pruneMessages,             // Reduce tokens
  createUIMessageStream,     // Server: manual stream control
  createUIMessageStreamResponse, // Server: convert stream to Response
  validateUIMessages,        // Validate loaded messages
  InferUITool,              // Type-safe tool results
} from 'ai/ui-utils';
```

## Critical Configuration

```typescript
// WRONG: Dynamic values in hook config
const { sendMessage } = useChat({ body: { userId } });

// RIGHT: Dynamic values at request time
await sendMessage({ text }, { body: { userId } });

// RULE: body/headers captured at init - use functions or request options for dynamic values
```

## Message Parts Quick Guide

```typescript
type MessagePart =
  | { type: 'text', text: string }
  | { type: 'image', data: string, mimeType: string }
  | { type: 'file', data: string, mimeType: string }
  | { type: `tool-${ToolName}`, toolCallId: string, args: unknown }
  | { type: `tool-result-${ToolName}`, toolUseId: string, result: unknown }
  | { type: 'data', id: string, data: CustomData }
  | SourcePart; // { type: 'source', sourceType, id, url, title }
```

## Common Code Patterns

### Basic Chat
```typescript
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

<form onSubmit={handleSubmit}>
  <input value={input} onChange={handleInputChange} disabled={isLoading} />
  <button>Send</button>
</form>

{messages.map(msg => (
  <div key={msg.id} className={msg.role}>
    {msg.parts.map((part, i) => (
      <span key={i}>
        {part.type === 'text' ? part.text : `[${part.type}]`}
      </span>
    ))}
  </div>
))}
```

### With Tool Calls
```typescript
const { messages, sendMessage, onToolCall } = useChat();

onToolCall = async (toolCall) => {
  if (toolCall.dynamic && toolCall.toolName === 'getWeather') {
    return await getWeather(toolCall.args);
  }
};
```

### Error Recovery
```typescript
const { error, regenerate } = useChat({
  onError: (e) => console.error(e)
});

{error && <button onClick={regenerate}>Retry</button>}
```

### Persistence
```typescript
const [storedMessages, setStoredMessages] = useState<UIMessage[]>([]);

const { messages, setMessages } = useChat({
  initialMessages: storedMessages
});

// Save on change
useEffect(() => {
  db.messages.save(messages); // Has IDs required for dedup
}, [messages]);
```

### Performance (Long Conversations)
```typescript
useChat({
  experimental_throttle: 30 // Batch updates every 30ms
});
```

### Dynamic Request Options
```typescript
const [temp, setTemp] = useState(0.7);
const [userId] = useAuth();

const { sendMessage } = useChat();

await sendMessage({ text: input }, {
  body: { temperature: temp, userId }, // Current values
  headers: { 'X-Custom': 'value' }
});
```

## Data Streaming Patterns

### Persistent Data (in message.parts)
```typescript
const writer = createUIMessageStream();
await writer.write({
  type: 'data',
  id: 'sources-1', // Update by same ID
  data: { sources: [...] }
});
```

### Transient Data (onData only)
```typescript
const { onData } = useChat();

onData = (chunk: UIMessageChunk) => {
  if (chunk.type === 'data') {
    // Not in message.parts - temporary only
    showProgress(chunk.data);
  }
};
```

## V5 Migration Checklist

- [ ] Replace `.content` with `.parts` array and map by type
- [ ] Move dynamic body values from hook config to request options
- [ ] Add `id` to all messages for persistence
- [ ] Replace `onResponse` with `onFinish`/`onData`
- [ ] Check tool calls for `toolCall.dynamic` before type narrowing
- [ ] Update tool definitions if using custom parameters field

## Version Constraints

- **Current stable:** v5.x
- **Minimum for parts:** v5.0+
- **Message IDs required:** v5.0+
- **onData introduced:** v5.0+
- **V6 Beta available** but unstable

## Endpoint Defaults

```typescript
useChat()                    // POST /api/chat
useCompletion()             // POST /api/completion
useAssistant({ api: ... }) // Custom endpoint required
useObject()                 // POST /api/object (custom usually)
```

## Type Safety Helpers

```typescript
// Define tools once
const tools = {
  getWeather: {
    description: 'Get weather',
    parameters: z.object({ city: z.string() })
  }
} as const;

// Type: extracts result type
type WeatherResult = InferUITool<typeof tools, 'getWeather'>;

// Use in client
onToolCall: async (tc) => {
  if (tc.dynamic && tc.toolName === 'getWeather') {
    const result: WeatherResult = await getWeather(tc.args);
    return result; // Checked by TS
  }
};
```

## Debugging Checklist

**"Hook not calling API"**
- Check endpoint exists and matches hook config
- Verify credentials mode ('same-origin' default)
- Check headers function if using dynamic headers

**"Messages not persisting"**
- Verify all messages have `id` field (required)
- Check `validateUIMessages()` doesn't throw
- Ensure loading stored messages before `setMessages()`

**"Dynamic values not updating"**
- Move from hook `body` to request-level `body` option
- Check using `sendMessage()` not `append()`
- Verify not using stale values in closure

**"Parts array looks wrong"**
- Ensure v5+ (v4 uses `.content` string)
- Check `convertToModelMessages()` before sending to model
- Map parts by `.type` field when rendering

**"Tool calls not appearing"**
- Verify server returns tool calls in message stream
- Check `onToolCall` is defined
- Ensure tool names match definitions

**"Streaming seems slow"**
- Add `experimental_throttle: 30` to batch updates
- Check network response time
- Verify server is streaming (chunked transfer encoding)

## Gotcha Summary

1. Body parameter = static (use request options)
2. Parts array = not .content string
3. Message IDs = required for persistence
4. Transient data = onData only, not in parts
5. Tool narrowing = check .dynamic first
6. convertToModelMessages = required for server usage
7. experimental_throttle = prevents render explosion
8. onData = for streaming progress (transient)
9. onFinish = for completion events
10. validateUIMessages = before loading from storage
