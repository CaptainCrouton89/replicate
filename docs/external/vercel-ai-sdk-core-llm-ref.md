# Vercel AI SDK Core LLM Reference

## Critical Signatures

### streamText
```typescript
streamText(options: StreamTextOptions): StreamTextResult
```

**Required Parameters:**
- `model: LanguageModel` - e.g., `openai('gpt-4o')`, `anthropic('claude-3-5-sonnet')`
- Either `prompt: string` OR `messages: ModelMessage[]`

**Optional Parameters:**
- `system: string` - System prompt, use instead of SystemModelMessage to resist prompt injection
- `tools: ToolSet` - Record of named tools with descriptions, inputSchema, optional execute functions
- `maxOutputTokens: number` - Token generation limit
- `temperature: number` - Sampling randomness (0-1)
- `topP: number` - Nucleus sampling
- `stopSequences: string[]` - Generation terminators
- `maxSteps: number` - Multi-step generation limit (defaults to 1)
- `stopWhen: (options) => boolean` - Custom stop condition, evaluated only when last step contains tool results
- `onStepFinish: (step) => void` - Callback when each step completes
- `prepareStep: (options) => void` - Called before step execution, allows modifying model/tools per step
- `onAbort: () => void` - Called when stream aborted via AbortSignal (onFinish NOT called when aborted)
- `maxRetries: number` - Defaults to 2, set 0 to disable
- `experimental_telemetry: TelemetryOptions` - Optional telemetry configuration

**Return Object:**
```typescript
{
  textStream: AsyncIterableStream<string>,        // Text deltas only
  fullStream: AsyncIterable<TextStreamPart>,      // All events (text, tool calls, errors)
  text: Promise<string>,                          // Final text (auto-consumes stream)
  content: Promise<ContentPart[]>,                // Last step content
  usage: Promise<LanguageModelUsage>,             // Token counts
  toolCalls: Promise<TypedToolCall[]>,            // Executed tools
  finishReason: Promise<FinishReason>,            // 'stop' | 'tool-calls' | 'length' | 'stop-sequence' | 'other'
  steps: Promise<Array<{ ... }>>,                 // All generation steps
  response: Response,                             // Full response headers and body
  toTextStreamResponse(options?: { headers?: Record<string, string> }): Response,
  toDataStreamResponse(options?): Response,       // For tool calls and advanced features
  pipeTextStreamToResponse(res: ServerResponse, options?): void,
}
```

**Critical Behaviors:**
- Tools with `execute` functions run automatically; without execute, results require manual handling
- Multi-step generation defaults to `stepCountIs(1)` for tool results
- Only critical errors throw; tool/content errors appear in `fullStream`
- Backpressure: Stream only generates tokens as consumed (must fully read stream)
- Tool execution errors surface as `tool-error` content parts, not thrown exceptions

---

### generateText
```typescript
generateText(options: GenerateTextOptions): Promise<GenerateTextResult>
```

**Required Parameters:**
- `model: LanguageModel`
- `prompt: string` OR `messages: ModelMessage[]`

**Optional Parameters:**
- `system: string`
- `tools: ToolSet`
- `maxOutputTokens: number`
- `temperature: number`
- `topP: number`
- `stopSequences: string[]`
- `maxSteps: number` - Multi-step limit
- `stopWhen: (options) => boolean`
- `onStepFinish: (step) => void`
- `maxRetries: number`

**Return Type:**
```typescript
{
  text: string,
  content: ContentPart[],                 // Last step content
  reasoning?: string,                     // When model generates reasoning
  finishReason: FinishReason,
  usage: LanguageModelUsage,              // { promptTokens, completionTokens, totalTokens }
  totalUsage: LanguageModelUsage,         // Cumulative across multi-step
  toolCalls: TypedToolCall[],
  steps: Array<{ ... }>,                  // Intermediate steps
  response: Response,
  warnings?: CallWarning[],
}
```

**Critical Behaviors:**
- Non-interactive: waits for complete generation before returning
- Throws errors (use try-catch)
- Tool execution errors are added to steps as `tool-error` parts
- For streaming, use `streamText` instead

---

### streamObject
```typescript
streamObject(options: StreamObjectOptions): StreamObjectResult
```

**Required Parameters:**
- `model: LanguageModel`
- `schema: ZodSchema | JSONSchema` - Describes output structure
- `prompt: string` OR `messages: ModelMessage[]`

**Optional Parameters:**
- `output: 'object' | 'array' | 'enum' | 'no-schema'` - Defaults to 'object'
- `system: string`
- `schemaName: string` - Hint for LLM
- `schemaDescription: string` - Hint for LLM
- `enum: string[]` - For enum output mode
- `maxOutputTokens: number`
- `temperature: number`
- `topP: number`
- `maxRetries: number`
- `abortSignal: AbortSignal`

**Return Object:**
```typescript
{
  partialObjectStream: AsyncIterable<Partial<T>>,  // Not validated, gets more complete
  elementStream: AsyncIterable<T>,                 // Array mode only, complete elements
  textStream: AsyncIterable<string>,               // JSON text chunks
  fullStream: AsyncIterable<ObjectStreamPart>,     // All events including errors
  object: Promise<T>,                              // Final validated object
  usage: Promise<LanguageModelUsage>,
  response: Promise<Response>,
  warnings?: CallWarning[],
}
```

**Critical Behaviors:**
- Partial objects in `partialObjectStream` are NOT validated
- Array mode `elementStream` streams only complete, validated elements (no layout shift)
- JSON text is valid only when stream completes
- Schema validates final object; implement own validation for partials if needed

---

### generateObject
```typescript
generateObject(options: GenerateObjectOptions): Promise<GenerateObjectResult>
```

**Parameters:** Same as `streamObject` (no streaming return)

**Return Type:**
```typescript
{
  object: T,                              // Validated generated object
  finishReason: FinishReason,
  usage: LanguageModelUsage,
  reasoning?: string,
  warnings?: CallWarning[],
  toJsonResponse(): Response,
}
```

---

### Tool Definition
```typescript
tool({
  description: string,                    // When/why model uses this tool
  inputSchema: z.object({ ... }),         // Zod or JSON schema for parameters
  execute?: async (input, options) => any, // Optional auto-execution function
})
```

**Tool Execute Options Parameter:**
```typescript
{
  toolCallId: string,                     // Unique ID for stream updates
  messages: ModelMessage[],               // Full conversation history
  abortSignal: AbortSignal,               // Forwarded from parent
  experimental_context?: unknown,         // Arbitrary data from streamText
}
```

**Dynamic Tools:**
```typescript
dynamicTool({
  description: string,
  inputSchema: z.object({}),  // Usually empty or flexible
  execute: async (input: unknown) => any,
})
```

---

## Configuration Shapes

### LanguageModelUsage
```typescript
{
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
}
```

### ModelMessage (Union Type)
```typescript
type ModelMessage =
  | { role: 'system', content: string }
  | { role: 'user', content: UserContent[] | string }
  | { role: 'assistant', content: AssistantContent[] }
  | { role: 'tool', content: ToolResultPart[] }

type UserContent = TextPart | ImagePart | FilePart
type AssistantContent = TextPart | ToolCallPart
type ToolResultPart = { type: 'tool-result', toolUseId: string, content: string | any | { type: 'error', error: string } }
```

### UIMessage (Customizable Type)
```typescript
interface UIMessage<METADATA = unknown, DATA_PARTS = unknown, TOOLS = unknown> {
  id: string,
  role: 'system' | 'user' | 'assistant',
  metadata?: METADATA,
  parts: UIMessagePart[],  // TextUIPart, ToolUIPart, ReasoningUIPart, FileUIPart, DataUIPart, etc.
}
```

**Critical:** UIMessage is source of truth for persistence; ModelMessage is lossy representation for LLMs.

### ToolSet
```typescript
Record<string, {
  description?: string,
  inputSchema: ZodSchema | JSONSchema,
  execute?: (input: unknown, options: ToolExecuteOptions) => Promise<any>,
}>
```

---

## Non-Obvious Behaviors

### Stream Error Handling
- `streamText.fullStream` contains error chunks (not thrown)
- `streamText.textStream` throws errors if no error chunk support
- `onAbort` callback fires on cancellation, but `onFinish` does NOT
- Tool execution errors appear as `tool-error` content parts in multi-step

### Streaming vs Non-Streaming
- `streamText` returns immediately with streams; must be fully consumed for complete generation
- `streamText` auto-consumes via Promises (`.text`, `.content`, etc.) if not using streams
- `generateText` blocks until complete
- **Backpressure:** streamText only generates as fast as consumed

### Tool Execution Flow
- Tools WITH `execute`: Run automatically when called
- Tools WITHOUT `execute`: Model generates tool call, you handle in `onStepFinish` or via `steps`
- `stopWhen` conditions evaluated ONLY when last step has tool results
- Multi-step defaults to single step; set `maxSteps` or `stopWhen` for agentic loops
- Default `maxSteps: 1` means: "generate once, if tool calls appear, stop"

### Message Conversion
- UI auto-converts `useChat` messages to ModelMessage format
- System prompt as parameter > SystemModelMessage for injection resistance
- ModelMessage is **lossy** (metadata, data parts stripped)
- Always persist UIMessage, never ModelMessage

### Object Generation
- `partialObjectStream` emits incomplete objects (NOT validated against schema)
- Array mode `elementStream` emits only **complete, validated** elements
- `textStream` emits raw JSON chunks (invalid until completion)
- Partial validation needs custom implementation; final object auto-validated

### Finish Reasons
- `'stop'` - Natural completion
- `'tool-calls'` - Model generated tool calls (may have empty text)
- `'length'` - Hit maxOutputTokens
- `'stop-sequence'` - Hit stopSequences
- `'other'` - Provider-specific reason

### Response Conversion
- `.toTextStreamResponse()` creates `text/plain; charset=utf-8` stream
- `.toDataStreamResponse()` (alias: `.toUIMessageStreamResponse()`) for tool calls
- Custom headers via `.toTextStreamResponse({ headers: { ... } })`

---

## Provider Initialization

All providers follow pattern:
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const model = openai('gpt-4o');              // With default env API key
const model = anthropic('claude-3-5-sonnet'); // Env: ANTHROPIC_API_KEY
const model = google('gemini-2-0-flash');    // Env: GOOGLE_GENERATIVE_AI_API_KEY
```

**Global Provider Registry:**
Models can reference providers as strings:
```typescript
streamText({ model: 'openai/gpt-4o' }) // Provider auto-initialized from env
```

---

## Schema Definition

### Zod Schema
```typescript
import { z } from 'zod';

const schema = z.object({
  name: z.string().describe('Full name'),
  age: z.number().min(0).max(150),
  ingredients: z.array(z.string()),
});
```

### JSON Schema
```typescript
const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' },
  },
  required: ['name', 'age'],
};
```

### For Tools
```typescript
const tools = {
  weather: tool({
    description: 'Get weather for a location',
    inputSchema: z.object({
      location: z.string().describe('City name'),
      units: z.enum(['C', 'F']).default('C'),
    }),
    execute: async ({ location, units }) => ({ ... }),
  }),
};
```

---

## FinishReason Type

```typescript
type FinishReason = 'stop' | 'length' | 'tool-calls' | 'stop-sequence' | 'other'
```

**Gotcha:** `finishReason: 'tool-calls'` can occur with empty `text` property.

---

## ContentPart Types

```typescript
type ContentPart =
  | { type: 'text', text: string }
  | { type: 'tool-call', toolUseId: string, toolName: string, args: unknown }
  | { type: 'tool-result', toolUseId: string, result: unknown }
  | { type: 'tool-error', toolUseId: string, error: string }
  | { type: 'image', data: string, mimeType: string }
```

---

## Error Types & Handling

```typescript
try {
  const { text } = await generateText({ ... });
} catch (error) {
  if (error.name === 'NoSuchToolError') { /* tool not defined */ }
  if (error.name === 'InvalidToolInputError') { /* schema validation */ }
  if (error.name === 'ToolCallRepairError') { /* repair failed */ }
  if (error.name === 'InvalidPromptError') { /* invalid prompt */ }
}
```

**In Streams (NOT thrown):**
- Monitor `fullStream` for `error` parts
- Tool execution errors appear as `tool-error` content parts

---

## Step Count Control

### stepCountIs Utility
```typescript
import { stepCountIs } from 'ai';

// Generate up to 5 tool-call loops
streamText({
  model,
  tools: { ... },
  stopWhen: stepCountIs(5),
  prompt: 'answer this question using tools',
})
```

### hasToolCall Utility
```typescript
import { hasToolCall } from 'ai';

streamText({
  stopWhen: hasToolCall(),  // Stop after first tool call (for streaming UIs)
})
```

---

## Response Objects

### toTextStreamResponse()
```typescript
const result = streamText({ ... });
return result.toTextStreamResponse({
  headers: { 'Custom-Header': 'value' },
});
// Returns Response with Content-Type: text/plain; charset=utf-8
// Status: 200 (fixed)
```

### toDataStreamResponse()
```typescript
const result = streamText({ ... });
return result.toDataStreamResponse({
  headers: { ... },
  data: { customKey: 'value' }, // StreamData for client
});
// For tool calls and advanced features
```

---

## Known Gotchas

1. **Streaming Backpressure**: Don't await promise properties if you need to use the stream—promise consumption auto-consumes stream
2. **Partial Object Validation**: `partialObjectStream` objects are INVALID against schema; only final object validated
3. **Tool Call Without Execute**: Model generates call, but tool doesn't run—requires manual step handling
4. **maxSteps Default**: Single step by default; agentic loops need explicit `maxSteps` or `stopWhen`
5. **onAbort vs onFinish**: `onAbort` fires on signal cancellation; `onFinish` does NOT fire on abort
6. **System vs SystemMessage**: Use `system` parameter, not SystemModelMessage, for injection safety
7. **Message Conversion**: UI messages auto-convert, but ModelMessage is lossy (don't persist)
8. **Finish Reason Tool-Calls**: Can occur with empty `text`; check `content` for actual tool calls
9. **maxRetries Default**: 2 retries by default; errors retry automatically unless set to 0
10. **Response Headers**: Default Content-Type is text/plain, not application/json

---

## Version: 5.0+ (July 2025)

**Major Changes from v3-v4:**
- ModelMessage replaces CoreMessage (same structure, different name)
- UIMessage as first-class type for persistence
- Data parts for type-safe streaming custom data
- streamText response methods: `.toTextStreamResponse()`, `.toDataStreamResponse()` (replace legacy StreamingTextResponse)
- Renamed parameters: `parameters` → `inputSchema`, `result` → `output`
- New `onStepFinish` and `prepareStep` callbacks for tool control
- `stepCountIs`, `hasToolCall` utilities added
