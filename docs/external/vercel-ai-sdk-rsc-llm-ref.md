# Vercel AI SDK RSC LLM Reference

## CRITICAL STATUS

⚠️ **AI SDK RSC is currently experimental and development is PAUSED**. Official guidance: migrate to AI SDK UI for production. This document covers RSC for reference/legacy support only.

## State Architecture: The Core Innovation

AI SDK RSC solves React component non-serializability through **split state**:

- **AI State** (JSON-serializable): Conversation history, tool parameters, metadata sent to LLM each request
  - Accessed via `getAIState()` (read-only) / `getMutableAIState()` (mutable)
  - Server-accessible in Server Actions
  - Gets sent to model for context

- **UI State** (client-only): Rendered React components, JavaScript functions, loading states
  - Accessed via `useUIState()` hook (client-side only)
  - React components and non-serializable values
  - Ephemeral, never sent to LLM

**Critical:** UI State and AI State are intentionally separate. Don't conflate them.

---

## Critical Signatures

### streamUI

```typescript
streamUI(options: StreamUIOptions): Promise<StreamUIResult>
```

**Required Parameters:**
- `model: LanguageModel` - e.g., `openai("gpt-4-turbo")`
- `prompt: string` - Input prompt for generation
- `system: string` - System prompt defining model behavior
- `messages: Array<CoreSystemMessage | CoreUserMessage | CoreAssistantMessage | CoreToolMessage>` - Conversation history

**Optional Generation Parameters:**
- `maxOutputTokens?: number`
- `temperature?: number`
- `topP?: number`
- `topK?: number`
- `presencePenalty?: number`
- `frequencyPenalty?: number`
- `stopSequences?: string[]`
- `seed?: number`

**Tool Integration:**
- `tools?: ToolSet` - Object mapping tool names to tool definitions
  - Each tool MUST have: `description` (string), `inputSchema` (Zod schema), `generate` (async generator function returning ReactNode)
  - `generate` yields ReactNode progressively (can yield multiple times)
  - GOTCHA: Once generator completes its final `return`, no more updates transmit. Plan accordingly
- `toolChoice?: "auto" | "none" | "required" | { type: "tool"; toolName: string }`

**Callbacks:**
- `text?: (textData: Text) => ReactNode` - Handles non-tool text responses (MUST be provided to handle text-only outputs)
- `onFinish?: (result: OnFinishResult) => void` - Called when generation completes

**HTTP Configuration:**
- `maxRetries?: number` (default: 2)
- `abortSignal?: AbortSignal`
- `headers?: Record<string, string>`
- `providerOptions?: Record<string, any>` - Provider-specific options

**Return Type:**
```typescript
{
  value: ReactNode                    // Streamed UI component(s)
  response?: Response                 // HTTP response metadata
  warnings?: Warning[]                // Provider warnings
  stream: AsyncIterable<StreamPart> & ReadableStream<StreamPart>
}
```

**StreamPart types:**
- `{ type: 'text-delta', textDelta: string }`
- `{ type: 'tool-call', toolCallId: string, toolName: string, args: any }`
- `{ type: 'error', error: Error }`
- `{ type: 'finish', finishReason: string, usage: TokenUsage }`

### createStreamableUI

```typescript
createStreamableUI(initialValue?: ReactNode): StreamableUI
```

**Parameters:**
- `initialValue?: ReactNode` - Optional starting UI component

**Return Type:**
```typescript
{
  value: ReactNode              // Current UI node (return this from Server Action)
  update: (ReactNode) => void   // Replace entire UI
  append: (ReactNode) => void   // Add to existing UI (blocks further updates)
  done: (ReactNode | null) => void  // REQUIRED - finalize stream
  error: (Error) => void        // Signal error (caught by nearest error boundary)
}
```

**CRITICAL Constraints:**
- `.done()` MUST be called or response hangs in loading state forever
- After `.append()` is called, previous nodes cannot be updated (append is one-way)
- `.done(null)` closes without final update; `.done(node)` does final update then closes
- `.error()` throws exception on client side—caught by React error boundary

### createStreamableValue

```typescript
createStreamableValue<T>(initialValue?: T): StreamableValue<T>
```

**Return Type:**
```typescript
{
  value: T                      // Serializable reference for client
  update: (T) => void          // Update streamed value
  done: (T | Error) => void    // Finalize (can pass Error for failure)
}
```

**Constraints:**
- Values MUST be JSON-serializable (strings, numbers, objects, arrays, buffers)
- No React components or functions in values (use `createStreamableUI` for components)
- Client receives values via `readStreamableValue()` async iterable

---

## Hooks: State Synchronization

### useAIState

```typescript
const [aiState] = useAIState(): [AIStateType, (newState: AIStateType) => void]
```

**Behavior:**
- Hook returns only a single-element array (unusual pattern)
- Reads/writes state defined in `createAI` type parameter
- Shared globally across all `useAIState` hooks under same `<AI/>` provider
- Client-side access to server-synchronized state
- GOTCHA: Updates here are LOCAL—must call server actions to persist to actual AI state

**Import:**
```typescript
import { useAIState } from "@ai-sdk/rsc"
```

### useUIState

```typescript
const [uiState, setUIState] = useUIState(): [UIStateType, (value: UIStateType) => void]
```

**Behavior:**
- Standard React `useState` pattern
- Client-side ONLY (no server access)
- Can hold React components, functions, any JavaScript value
- Must manually call `setUIState()` after server actions (NO automatic synchronization)
- CRITICAL GOTCHA: Don't forget to update UI State after calling Server Action—streamed component won't show otherwise

**Import:**
```typescript
import { useUIState } from "@ai-sdk/rsc"
```

### useActions

```typescript
const actions = useActions(): { [actionName: string]: (...args) => Promise<any> }
```

**Behavior:**
- Returns all Server Actions registered in `createAI({ actions: {...} })`
- Calls dispatch server actions from client components
- These are NOT automatic—you must manually handle returned values and update UI state
- Async functions that return whatever the server action returns

---

## Server-Side Utilities

### getAIState

```typescript
getAIState(): AIStateType
```

**Usage:** Read-only access to AI state within Server Actions
- Returns current conversation history and metadata as JSON
- Use when you need to read (not modify) conversation state

### getMutableAIState

```typescript
getMutableAIState(): MutableAIState
```

**Return Type:**
```typescript
{
  get: () => AIStateType              // Read current state
  update: (newState: AIStateType) => void
  done: (finalState: AIStateType) => void
}
```

**Usage:** Modify AI state during streaming in Server Actions
- `.update()` is for intermediate updates during async operations
- `.done()` finalizes and closes the stream (MUST be called or hangs)
- PATTERN: Call within `streamUI()` to track conversation history during tool execution

---

## Context Provider: Application Setup

### createAI

```typescript
createAI<AIStateType, UIStateType>(config: {
  initialAIState: AIStateType
  initialUIState: UIStateType
  actions: { [actionName: string]: ServerAction }
})
```

**Behavior:**
- Wraps entire application in context provider (use at layout level)
- `actions` object defines which Server Actions are accessible to client
- Actions NOT in this object are inaccessible via `useActions()`
- Types flow through context—`useAIState<>` and `useUIState<>` inherit types from provider

**CRITICAL:** All Server Actions used by client MUST be registered in `actions` object. This is the enforcer.

---

## Server Actions Integration Pattern

### Typical Flow

```typescript
// 1. Server Action calls streamUI with tools
export const sendMessage = async (input: string) => {
  const history = getMutableAIState()

  return streamUI({
    model,
    prompt: input,
    system: "...",
    messages: history.get(),
    tools: {
      myTool: {
        description: "...",
        inputSchema: z.object({...}),
        generate: async function* (params) {
          // Async generator: yields progressive updates
          yield <LoadingComponent />
          const data = await expensiveOperation()
          return <DataComponent data={data} />
        }
      }
    },
    text: ({ content }) => <TextComponent>{content}</TextComponent>,
    onFinish: async () => {
      // Update server-side state
      history.done([...history.get(), { role: "assistant", content }])
    }
  })
}

// 2. Client calls Server Action
const handleSubmit = async (input) => {
  const result = await sendMessage(input)
  setUIState([...uiState, result.value])  // CRITICAL: manually update UI state
}
```

### Generator Function Patterns (in tool `generate`)

**Progressive Loading:**
```typescript
generate: async function* () {
  yield <Skeleton />
  const data = await fetchData()
  yield <Preview data={data} />
  const moreData = await fetchMore()
  return <Full data={{...data, moreData}} />
}
```

- Each `yield` sends update to client immediately
- Final `return` sends last component and ends stream
- After `return`, no more yields will transmit

**Error Handling in Generators:**
```typescript
generate: async function* () {
  try {
    yield <Processing />
    const result = await operation()
    return <Success result={result} />
  } catch (error) {
    return <Error error={error.message} />
  }
}
```

- Errors in generator should return error component
- Use `streamUI().onFinish()` error callback for LLM-level errors

---

## Non-Obvious Behaviors & Gotchas

### 1. Type Safety Gap at State Boundaries

Messages in AI state use `content: string`, but UI state renders `ReactNode`. You must manually serialize/deserialize at boundaries:

```typescript
// BAD: React components aren't JSON-serializable
const aiState = [{ role: "assistant", content: <Component /> }]

// GOOD: Keep content as string in AI state
const aiState = [{ role: "assistant", content: "..." }]
// Then separately in UI state
const [uiState, setUIState] = useState([<Component />])
```

### 2. useUIState Updates Are Manual, Not Automatic

Unlike typical framework state management:

```typescript
// Wrong: Assumes state auto-updates after server action
const [uiState, setUIState] = useUIState()
const result = await sendMessage(input)
// result.value is NOT automatically in uiState

// Right: Manually update after server action returns
const result = await sendMessage(input)
setUIState([...uiState, result.value])
```

This is intentional—the framework doesn't assume what UI you want to render.

### 3. Append Prevents Updates to Previous Nodes

Once you call `.append()` on StreamableUI, the previous content becomes immutable:

```typescript
const ui = createStreamableUI(<Initial />)
ui.append(<Second />)      // OK
ui.update(<NewSecond />)   // ERROR: can't update after append
ui.done()                  // OK
```

Pattern: Use `.update()` for in-place changes, `.append()` when adding new content.

### 4. Generator Exhaustion

Tool generators must call `.done()` explicitly in `streamUI.onFinish()` or state hangs:

```typescript
// WRONG: Generator completes but .done() never called
streamUI({
  tools: { ... },
  // Missing onFinish callback
})

// RIGHT: Ensure .done() called
streamUI({
  tools: { ... },
  onFinish: () => {
    mutableState.done(finalState)  // Must call this
  }
})
```

### 5. Messages Array Type Requirement

Messages passed to `streamUI()` must match exact core message types:

```typescript
// These are the exact types expected:
type CoreSystemMessage = { role: 'system'; content: string }
type CoreUserMessage = { role: 'user'; content: string }
type CoreAssistantMessage = { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
type CoreToolMessage = { role: 'tool'; tool_use_id: string; content: string }

// Not MessageParam from @ai-sdk/openai—must be Core* types
```

### 6. Tool Choice Constraints

```typescript
// Default behavior
toolChoice: 'auto'  // Model decides when to call tools

// Force tool usage
toolChoice: 'required'  // Model MUST call a tool

// Disable tools
toolChoice: 'none'  // Model cannot call tools

// Specific tool
toolChoice: { type: 'tool', toolName: 'myTool' }  // Force this specific tool
```

Specifying wrong tool name or invalid format throws error.

### 7. createStreamableValue vs createStreamableUI

- **createStreamableUI**: For React components—can yield/update multiple times
- **createStreamableValue**: For serializable data—strings, numbers, objects

Don't mix them:
```typescript
// WRONG
const value = createStreamableValue(<Component />)  // Components aren't serializable

// RIGHT
const value = createStreamableValue({ status: "loading" })
const ui = createStreamableUI(<Component />)
```

### 8. Response Hangs If .done() Never Called

No error thrown. Stream just waits forever. If client gets stuck in loading:
- Check `onFinish` callback actually calls `.done()`
- Check generator's final `return` statement executes
- Check for unhandled promise rejections in tool execution

### 9. Text Handler Is NOT Optional If Model Responds with Text

If model can respond without calling tools:

```typescript
// WRONG: If model outputs text, nothing renders
streamUI({
  tools: { ...toolDefs },
  // Missing text handler
})

// RIGHT: Always provide text handler for safety
streamUI({
  tools: { ...toolDefs },
  text: ({ content }) => <p>{content}</p>
})
```

### 10. Experiment/Production Gap

This API is experimental. Key limitations:
- No built-in error recovery
- Limited streaming status introspection
- State synchronization is manual
- No automatic client-server consistency checks
- Production recommendation: use AI SDK UI instead

---

## Version: 4.0+ (Latest)

**Documentation Source:** https://ai-sdk.dev/docs/ai-sdk-rsc (2025)

**Key Recent Changes:**
- RSC development paused; framework in maintenance mode
- Recommendation to migrate to AI SDK UI for new projects
- No breaking changes in stable 4.x versions

---

## Quick Reference Table

| API | Type | Server/Client | Returns | Key Constraint |
|-----|------|---------------|---------|---|
| `streamUI()` | Function | Server | `Promise<StreamUIResult>` | Must handle all message/tool types |
| `createStreamableUI()` | Function | Server | `StreamableUI` | `.done()` MUST be called |
| `createStreamableValue()` | Function | Server | `StreamableValue<T>` | Values must be JSON-serializable |
| `useAIState()` | Hook | Client | `[state, setter]` | Updates are local until server action |
| `useUIState()` | Hook | Client | `[state, setter]` | Manual update after server actions |
| `useActions()` | Hook | Client | `ActionMap` | Only registered actions accessible |
| `getAIState()` | Function | Server Action | `AIStateType` | Read-only access |
| `getMutableAIState()` | Function | Server Action | `MutableAIState` | Use `.done()` to finalize |
| `createAI()` | Function | Setup | `Provider` | Enforces action registration |

---

## Import Statement Template

```typescript
// Core streaming
import { streamUI, createStreamableUI, createStreamableValue } from "@ai-sdk/rsc"

// State management
import { useAIState, useUIState, useActions } from "@ai-sdk/rsc"
import { getAIState, getMutableAIState } from "@ai-sdk/rsc"

// Setup
import { createAI } from "@ai-sdk/rsc"
```

---

## When to Use Each Primitive

- **streamUI()** — Model call with tool support; for Server Actions handling user messages
- **createStreamableUI()** — Progressive UI updates with fine-grained control
- **createStreamableValue()** — Streaming non-component data (JSON objects, status updates)
- **useUIState()** — Rendering streamed UI; client-side component state
- **useAIState()** — Accessing conversation history/context on client
- **getMutableAIState()** — Persisting conversation updates during streaming
- **createAI()** — Application setup; enforces action registry and types
