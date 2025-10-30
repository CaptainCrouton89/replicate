# Vercel AI SDK UI - LLM Reference

## Critical Hook Signatures

### useChat (React)

```typescript
useChat({
  // Endpoints & Request Config
  api?: string, // Default: '/api/chat'
  headers?: Record<string, string> | (() => Record<string, string>),
  body?: Record<string, any>, // CAPTURED AT INIT - use sendMessage options for dynamic values
  credentials?: RequestCredentials, // Default: 'same-origin'
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,

  // Initial State
  initialMessages?: UIMessage[], // Must be persistent UIMessages with IDs
  initialInput?: string,

  // Lifecycle Callbacks
  onFinish?: (message: UIMessage, options: { usage?: CompletionTokenUsage }) => void,
  onError?: (error: Error) => void,
  onData?: (data: UIMessageChunk) => void, // For transient data parts only

  // Behavior Options
  streamProtocol?: 'text' | 'data', // Default: 'data'
  experimental_throttle?: number, // Milliseconds between UI updates (React only)
  sendAutomaticallyWhen?: 'lastAssistantMessageIsCompleteWithToolCalls',

  // Message IDs (required for persistence)
  generateId?: () => string, // Custom ID generator
}): {
  // State
  messages: UIMessage[], // Array with .parts structure (NOT .content)
  input: string,
  isLoading: boolean,
  status: 'awaiting_user_input' | 'sending' | 'fetching' | 'handling_function_calls' | 'error',
  error: Error | undefined,

  // Message Functions
  sendMessage: (message: { text: string }, options?: SendMessageOptions) => Promise<void>,
  append: (message: UIMessage) => Promise<void>,
  reload: () => Promise<void>,
  stop: () => void,
  setMessages: (messages: UIMessage[]) => void,
  regenerate: () => Promise<void>, // Resend last request without changing history

  // UI Helpers
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void,
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void,
  setInput: (input: string) => void,

  // Tool/Data Handlers
  onToolCall?: (toolCall: ToolCall<ToolName>) => void | Promise<void>,
}
```

### useCompletion (React)

```typescript
useCompletion({
  api?: string, // Default: '/api/completion'
  headers?: Record<string, string> | (() => Record<string, string>),
  body?: Record<string, any>, // CAPTURED AT INIT - use complete() options for dynamic values
  credentials?: RequestCredentials,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,

  initialInput?: string,
  initialCompletion?: string,

  onFinish?: (completion: string, options?: { usage?: CompletionTokenUsage }) => void,
  onError?: (error: Error) => void,

  streamProtocol?: 'text' | 'data',
  experimental_throttle?: number, // Milliseconds between UI updates

  // REMOVED in v5: maxSteps, data property, onResponse
}): {
  completion: string, // Current streamed text output
  complete: (prompt?: string, options?: CompleteOptions) => Promise<string | undefined>,
  input: string,
  isLoading: boolean,
  error: Error | undefined,
  stop: () => void,

  // Form integration
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void,
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void,
  setInput: (input: string) => void,
}
```

### useAssistant (React)

```typescript
useAssistant({
  api: string, // Required, endpoint accepting { threadId, message } returning AssistantResponse stream
  threadId?: string, // If omitted, new thread created
  credentials?: RequestCredentials, // Default: 'same-origin'
  headers?: Record<string, string>,
  body?: Record<string, any>,
  fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,

  onError?: (error: Error) => void,
}): {
  messages: UIMessage[],
  threadId: string | undefined,
  status: 'awaiting_message' | 'in_progress',
  error: Error | undefined,

  input: string,
  setInput: (input: string) => void,
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void,

  // Message operations
  submitMessage: (e: FormEvent) => Promise<void>, // Preferred over append()
  append: (message: UIMessage) => Promise<void>,
  setMessages: (messages: UIMessage[]) => void,
  setThreadId: (threadId: string) => void,

  stop: () => void,
}
```

### useObject (React) - EXPERIMENTAL

```typescript
useObject<ObjectType>({
  api?: string, // Default: '/api/object'
  schema: z.ZodType<ObjectType>, // Zod schema for type safety
  headers?: Record<string, string> | (() => Record<string, string>),
  body?: Record<string, any>,
  fetch?: Function,

  onFinish?: (object: ObjectType) => void,
  onError?: (error: Error) => void,

  streamProtocol?: 'text' | 'data',
}): {
  object: ObjectType | undefined, // Partial object during streaming
  isLoading: boolean,
  error: Error | undefined,
  stop: () => void,
}
```

## Message Structure (V5+)

### UIMessage Format

```typescript
interface UIMessage {
  id: string, // REQUIRED for persistence, must be server-generated
  role: 'user' | 'assistant',
  createdAt?: Date,
  parts: UIMessagePart[], // NOT .content string
  metadata?: Record<string, any>, // Custom metadata attached at message level
}

type UIMessagePart =
  | { type: 'text', text: string }
  | { type: 'image', data: string | Uint8Array, mimeType: string }
  | { type: 'file', mimeType: string, data: string }
  | { type: `tool-${ToolName}`, toolCallId: string, args: unknown }
  | { type: `tool-result-${ToolName}`, toolUseId: string, result: unknown }
  | { type: 'data', id: string, data: DataUIPart }
  | SourcePart
```

### Key Migration from V4 to V5:

- `.content` string → `.parts` array (breaking change)
- `Message` type renamed to `UIMessage`
- `CoreMessage` type renamed to `ModelMessage`
- Tool parts now use `tool-${ToolName}` instead of generic identifiers
- `data` role removed entirely
- Message IDs are now required for proper state management

## Request-Level Options (Critical for Dynamic Data)

```typescript
// GOTCHA: body passed to useChat/useCompletion is STATIC (captured at init)
// Pass dynamic values at request time instead:

sendMessage({ text: inputValue }, {
  body: {
    temperature: tempValue, // Current value at send time
    userId: currentUserId,  // Current value at send time
    sessionId: sessionRef.current, // Use useRef for current values
  }
})

// OR with useCompletion:
complete(prompt, {
  body: { ... }
})
```

## Utility Functions

### convertToModelMessages

```typescript
convertToModelMessages<T = UIMessage>(
  messages: T[],
  options?: {
    tools?: ToolSet, // For multi-modal tool support
    convertDataPart?: (part: DataUIPart) => TextPart | FilePart | undefined
  }
): ModelMessage[]

// Purpose: Convert UIMessage[] from hooks to ModelMessage[] for server-side streamText()
// Converts tool parts to proper format, filters custom data parts
// Use when sending chat history to language model
```

### pruneMessages

```typescript
pruneMessages(options: {
  messages: ModelMessage[],
  reasoning?: 'all' | 'before-last-message' | 'none', // Default: 'none'
  toolCalls?: 'all' | 'before-last-message' | 'before-last-${number}-messages' | 'none',
  emptyMessages?: 'keep' | 'remove', // Default: 'remove'
}): ModelMessage[]

// Purpose: Reduce token usage before sending to LLM
// Remove intermediate reasoning/tool calls, especially after extended conversations
// Common pattern: reasoning: 'before-last-message', toolCalls: 'before-last-2-messages'
```

### createUIMessageStream

```typescript
createUIMessageStream(
  options?: CreateUIMessageStreamOptions
): UIMessageStream

// Server-side utility: Create stream for writing persistent messages and transient data
// Returns writer for manual message IDs and incremental updates
// Use with toUIMessageStreamResponse() or pipeUIMessageStreamToResponse()
```

### createUIMessageStreamResponse

```typescript
createUIMessageStreamResponse<Metadata>(
  stream: IterableStream<UIMessageChunk>,
  options?: {
    generateId?: () => string,
    messageMetadata?: (options: {
      streamStarted: boolean | undefined
    }) => Metadata | Promise<Metadata>,
  }
): Response

// Server-side: Convert stream to HTTP Response
// Automatically assigns IDs if not provided (optional)
// Attach metadata (usage, timestamps, model info)
```

## Streaming Patterns

### Three Data Types for Streaming

```typescript
// 1. PERSISTENT DATA PARTS - added to message.parts array, stored in history
//    Use for: RAG sources, documents, file attachments
const writer = createUIMessageStream();
await writer.write({
  type: 'data',
  id: 'sources-1', // Same ID = update existing part
  data: { sources: [...], mimeType: 'application/json' }
});

// 2. SOURCES - Special metadata for citations/references
//    Use for: RAG document references
const writer = createUIMessageStream();
await writer.write({
  type: 'source',
  sourceType: 'url',
  id: 'source-1',
  url: 'https://example.com',
  title: 'Document Title'
});

// 3. TRANSIENT DATA PARTS - NOT in message history, onData callback only
//    Use for: Progress updates, status, temporary UI state
const writer = createUIMessageStream();
await writer.write({
  type: 'data',
  id: 'progress', // Still needs ID but won't persist
  dataIsStreamingProgress: true, // Mark as transient
  data: { status: 'processing' }
});
// Client: captured by onData callback, NOT in message.parts
```

## Tool Integration Patterns

### Tool Call Handling

```typescript
// Tool definitions in shared code
const tools = {
  getWeather: {
    description: string,
    parameters: z.object({...}), // v5: parameters field (NOT inputSchema)
  }
}

// Client-side:
const { messages, onToolCall } = useChat({
  // ...
});

// Handler for client-side tool execution
onToolCall = async (toolCall: ToolCall) => {
  if (toolCall.dynamic) {
    // Type-narrowed to known tool names
    if (toolCall.toolName === 'getWeather') {
      const result = await getWeather(toolCall.args);
      return result; // Automatically added to message history
    }
  }
}

// GOTCHA: Check toolCall.dynamic first for proper type narrowing
```

### Tool Execution Types

- **Server-side**: Model returns tool_call, backend executes via `execute` method
- **Client auto-exec**: Model returns tool_call, client onToolCall handles immediately
- **User-interactive**: Display tool_call in UI, require user confirmation before execution

### Automatic Tool Call Submission

```typescript
useChat({
  sendAutomaticallyWhen: 'lastAssistantMessageIsCompleteWithToolCalls',
  // Auto-submits after tool calls complete (reduces manual append() calls)
})
```

## Message Persistence

### Server-Side ID Generation (Required)

```typescript
// Option 1: Using createIdGenerator in toUIMessageStreamResponse
const { createIdGenerator } = await import('ai/ui-utils');
const generateId = createIdGenerator();

toUIMessageStreamResponse(stream, {
  generateId: generateId // Auto-assigns IDs
})

// Option 2: Manual control with createUIMessageStream
const writer = createUIMessageStream();
writer.write({
  type: 'message',
  id: `msg-${crypto.randomUUID()}`, // Server-generated
  role: 'assistant',
  // ...
})
```

### Validation on Load

```typescript
import { validateUIMessages } from 'ai/ui-utils';

// When loading stored messages from database:
try {
  const validMessages = await validateUIMessages(storedMessages);
  setMessages(validMessages);
} catch (error) {
  // TypeValidationError: Messages don't match current schema
  // Implement migration or filtering strategy
}
```

## Configuration Gotchas

### V5 Breaking Changes Summary

1. **Body parameter is static** - captured at hook init, use sendMessage options for dynamic values
2. **maxSteps removed** - use server-side `stopWhen` conditions instead
3. **Message structure** - .content string → .parts array
4. **Tool definitions** - parameters field now required (NOT inputSchema in v5)
5. **No onResponse callback** - use onData instead
6. **No data role** - send data as DataUIPart in .parts array
7. **Input management** - moved to developer (hooks don't manage input state in v5)
8. **Type renames** - CoreMessage→ModelMessage, Message→UIMessage

### Error Recovery Strategies

```typescript
// Strategy 1: Regenerate (resend last request)
const { regenerate } = useChat();
await regenerate();

// Strategy 2: Replace last message (fix input, clear error)
const { messages, setMessages, error } = useChat();
if (error) {
  setMessages(messages.slice(0, -1)); // Remove failed message
  // User fixes input and resubmits
}

// Error callback for global handling:
useChat({
  onError: (error) => {
    console.error(error);
    // Show generic message to user, not server details
  }
})
```

## Performance Optimization

### experimental_throttle for Streaming Text

```typescript
useChat({
  experimental_throttle: 30 // Batch updates every 30ms (React only)
  // Without throttle: re-renders on every token (catastrophic for long conversations)
  // Markdown rendering gets exponentially slower as context grows
  // Throttle prevents full re-render on each incoming chunk
})
```

## UI Message vs Model Message Conversion Flow

```typescript
// Client:
const { messages: uiMessages } = useChat();

// Send to server for processing:
const modelMessages = convertToModelMessages(uiMessages, {
  tools: toolDefinitions,
  convertDataPart: (part) => {
    if (part.mimeType === 'application/json') {
      return { type: 'text', text: JSON.stringify(part.data) };
    }
    return undefined; // Filter out
  }
});

// Optional: Prune before context window issues:
const prunedMessages = pruneMessages({
  messages: modelMessages,
  reasoning: 'before-last-message',
  toolCalls: 'before-last-2-messages'
});

// Send to streamText() or other model functions
streamText({
  model,
  messages: prunedMessages,
  tools: toolDefinitions
})
```

## Message Metadata (V5+)

```typescript
// Server-side: Attach metadata at different stream stages
messageMetadata: async ({ streamStarted }) => ({
  model: 'gpt-4-turbo',
  timestamp: new Date(),
  usage: streamStarted ? undefined : { completion: 150, prompt: 42 },
  finishReason: 'stop'
})

// Client-side: Access metadata
messages.forEach(msg => {
  console.log(msg.metadata);
  // { model: 'gpt-4-turbo', timestamp: Date, usage: {...} }
})
```

## File Attachment Support

```typescript
// useChat supports FileList objects for multi-modal content:
const handleFileSelect = (files: FileList) => {
  sendMessage({ text: input, files })
}

// Files are converted to file parts and included in message
// Auto-supported by convertToModelMessages if model supports images/files
```

## Stream Protocol Options

```typescript
// 'text' - Plain text streaming (simpler, no metadata)
streamProtocol: 'text'

// 'data' - Structured data format (supports parts, metadata, tool calls)
streamProtocol: 'data' // Default and recommended
```

## Version: 5.0+ (as of 2025)

**Key Version Notes:**
- V4 to V5 migration: Major breaking changes (see above)
- V6 Beta available but not production-ready
- Current stable: v5.x
- Package: `@ai-sdk/react` (React hooks)
- Also available: `@ai-sdk/svelte`, `@ai-sdk/vue`, `@ai-sdk/angular`
