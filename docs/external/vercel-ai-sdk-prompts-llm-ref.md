# Vercel AI SDK Prompts LLM Reference

## Critical Function Signatures

### Core Generation Functions

```typescript
generateText(options: {
  model: LanguageModel,
  prompt?: string,          // Text-only prompt
  system?: string,          // Initial behavior instructions
  messages?: ModelMessage[], // Structured message array (alternative to prompt)
  tools?: ToolSet,
  providerOptions?: Record<string, any>,  // Provider-specific metadata
  temperature?: number,      // 0-1, controls variability (default varies by model)
  maxTokens?: number,
  topP?: number,
  topK?: number,
  frequencyPenalty?: number,
  presencePenalty?: number,
  stopSequences?: string[],
  experimental_repairText?: boolean,
  experimental_structuredOutput?: { schema: Schema }
}): Promise<{
  text: string,
  toolCalls?: ToolCall[],
  finishReason: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'other',
  usage: { promptTokens: number, completionTokens: number },
  providerMetadata?: { anthropic?: { cacheCreationInputTokens?: number, ... }, ... },
  response: { id?: string, timestamp?: Date, ... }
}>

streamText(options): AsyncIterable<TextStreamPart> & {
  toReadableStream(): ReadableStream<Uint8Array>,
  pipeThrough(transform): Promise<{ ... }>
}

generateObject(options: {
  model: LanguageModel,
  prompt?: string,
  system?: string,
  messages?: ModelMessage[],
  schema: Schema | Zod | Valibot,  // Zod, Valibot, or JSON schema
  output?: 'object' | 'array' | 'enum',  // Default: 'object'
  outputFormat?: 'json' | 'no-schema',    // Default: 'json'
  schemaDescription?: string,  // Enhances LLM guidance
  schemaName?: string,         // Enhances LLM guidance
  enumValues?: string[],       // Required when output='enum'
  providerOptions?: Record<string, any>,
  maxRetries?: number,         // Retries on validation failure
  experimental_repairText?: boolean,  // Attempts JSON remediation post-generation
  maxTokens?: number,
  temperature?: number
}): Promise<{
  object: T,
  finishReason: 'stop' | 'length' | 'error' | 'other',
  usage: { promptTokens: number, completionTokens: number },
  providerMetadata?: { ... }
}>

streamObject(options): AsyncIterable<ObjectStreamPart<T>> & {
  partialObjectStream: AsyncIterable<Partial<T>>,
  elementStream: AsyncIterable<T>,  // When output='array'
  toReadableStream(): ReadableStream<Uint8Array>
}
```

### Message Composition Functions

```typescript
type ModelMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool',
  content: string | ContentPart[],
  providerOptions?: Record<string, any>  // Message-level provider config
}

type ContentPart =
  | { type: 'text', text: string, providerOptions?: Record<string, any> }
  | { type: 'image', image: string | Buffer | URL, mimeType?: string, providerOptions?: Record<string, any> }
  | { type: 'file', mediaType: string, data: Buffer | string | URL, filename?: string, providerOptions?: Record<string, any> }
  | { type: 'tool-call', toolCallId: string, toolName: string, input: Record<string, any> }
  | { type: 'tool-result', toolCallId: string, toolName: string, output: any | { type: 'content', value: ContentPart[] }, isError?: boolean }

// UI to Model Message Conversion
convertToModelMessages(
  messages: UIMessage[],
  options?: {
    tools?: ToolSet,
    convertDataPart?: (part: DataUIPart) => TextPart | FilePart | undefined
  }
): ModelMessage[]
```

---

## Message Structure Constraints

### Content Part Support by Role

**User messages can contain:**
- text (any provider)
- image (base64 string, data URL, Buffer/Uint8Array/ArrayBuffer, or http(s) URL)
- file (Buffer or URL; **only few providers support**)

**Assistant messages can contain:**
- text
- tool-call (structured with toolCallId, toolName, input)
- file (Buffer; **rarely supported**)

**Tool messages can contain:**
- tool-result (output object OR multi-modal content array - **multi-modal experimental, Anthropic only**)

**System messages:**
- text only (provider-specific handling varies)

### Critical Constraints

- **Image formats**: Base64 string, data URL, binary buffer, or HTTP(S) URL only
- **File support**: "Only a few providers and models currently support file parts"
- **Multi-modal tool results**: Experimental feature, **Anthropic only**
- **Model capability variation**: Not all LLMs support all message/content types
- **Provider option levels**: Can be set at function level, message level, or content part level (specificity increases priority)

---

## Prompt Caching with Anthropic

### Configuration

```typescript
// Enable caching on specific message parts
const result = await generateText({
  model: anthropic('claude-3-5-sonnet-20240620'),
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'System context here...' },
      {
        type: 'text',
        text: 'Long document to cache...',
        providerOptions: {
          anthropic: {
            cacheControl: { type: 'ephemeral' }  // Mark as cacheable
            // ttl: '1h' (optional, extends cache to 1 hour)
          }
        }
      }
    ]
  }]
});

// Access cache metrics
const cacheCreationTokens = result.providerMetadata?.anthropic?.cacheCreationInputTokens;
const cacheReadTokens = result.providerMetadata?.anthropic?.cacheReadInputTokens;
```

### Caching Constraints

- **Minimum cacheable length**: Claude 3.5/3 Sonnet/Opus = **1,024 tokens minimum**, Haiku = **2,048 tokens minimum**
- **Shorter prompts**: Cannot be cached even if marked; processed without caching
- **Cache key**: All content before cache marker + everything within same cache block
- **TTL option**: `{ ttl: '1h' }` extends cache duration to 1 hour (default shorter)
- **Response format**: `providerMetadata?.anthropic?.{ cacheCreationInputTokens, cacheReadInputTokens }`
- **Streaming**: For `streamText`/`streamObject`, access metadata via `onFinish` callback or await promise

### Known Gotchas

- `generateObject` with dynamic schemas breaks caching (schema differs per call due to tool definitions)
- Caching **not supported for tool definitions**, only system messages and message content
- Metadata not visible in `providerMetadata` for all provider/function combinations

---

## System Prompts Design Pattern

### Function Signatures

```typescript
// System prompt via property (preferred)
generateText({
  model: anthropic('claude-3-5-sonnet'),
  system: `You are Steve Jobs in 1984. Respond to modern technology questions...`,
  prompt: 'What do you think about AI?'
})

// OR system message in array (provider-processed differently)
generateText({
  model: anthropic('claude-3-5-sonnet'),
  messages: [
    { role: 'system', content: 'You are Steve Jobs...' },
    { role: 'user', content: 'What do you think about AI?' }
  ]
})

// System + messages together
generateText({
  system: 'Base instructions...',
  messages: [
    { role: 'system', content: 'Additional context...' },  // Appended after initial system
    { role: 'user', content: 'User query' }
  ]
})
```

### Three-Pillar Structure

System prompts should define:
1. **Persona/Tone**: Sets voice consistency across all responses (e.g., formal, casual, witty, brand voice)
2. **Constraints/Boundaries**: What the AI should NOT do (e.g., "Do not offer financial advice", "Only discuss product features")
3. **Context**: Relevant background for consistent decision-making

### Non-Obvious Behaviors

- **Persistence**: System prompts remain constant across ALL turns in conversation; user messages change per turn
- **Model capability matters**: More capable models follow system prompts precisely; fast models may struggle with nuanced personas
- **Provider processing**: Different providers handle system messages differently (some convert `system` property to system message, some handle it specially)
- **Tone consistency**: Personality auto-maintained across multi-turn conversations—no need to reinforce in each response
- **Context window trade-off**: Very long system prompts consume tokens; production systems need concise yet clear instructions

### Best Practices

- **Specificity > vagueness**: "You are Steve Jobs in 1984, responding to modern tech questions" beats "You are helpful"
- **Constraint phrasing**: Gracefully deflect off-topic rather than abruptly refuse; frame positively (what to do) + boundaries (what not to do)
- **Avoid repetition**: Don't reinforce tone/persona in each user response; system prompt handles it
- **Persona testing**: Use Vercel AI Playground to validate system prompt behavior across different models before production

---

## Structured Output Generation

### Function Parameters & Output Strategies

```typescript
generateObject({
  schema: z.object({ name: z.string(), age: z.number() }),  // Zod, Valibot, or JSON Schema
  output: 'object',     // Default: single object
  // OR
  output: 'array',      // Schema defines array element shape; returns T[]
  // OR
  output: 'enum',       // Classification; requires enumValues: ['option1', 'option2']
  enumValues: [...],    // Required when output='enum'

  // Dynamic schemas
  outputFormat: 'no-schema',  // Omit schema, infer output format
  schemaName: 'Product',      // Enhances LLM guidance
  schemaDescription: 'A product with name and price',  // Enhances LLM guidance

  maxRetries: 3,              // Auto-retry on validation failure
  experimental_repairText: true,  // Attempt JSON remediation

  // Streaming
  // NOTE: streamObject returns elementStream when output='array'
})

// Error handling
try {
  const result = await generateObject({...})
} catch (error) {
  if (error instanceof AI_NoObjectGeneratedError) {
    console.log(error.text);        // Raw text generated
    console.log(error.cause);       // JSON parse or validation error
    console.log(error.usage);       // Token counts
    console.log(error.response);    // id, timestamp, model
  }
}
```

### Output Strategy Behavior

| Strategy | Return Type | Key Note |
|----------|------------|----------|
| `'object'` (default) | `T` | Single structured object matching schema |
| `'array'` | `T[]` | Multiple objects; schema defines element; `elementStream` available |
| `'enum'` | Enum value | Classification; requires `enumValues` array; `generateObject` only |
| `'no-schema'` | Dynamic | User-supplied format; omit schema; output inferred |

### Non-Obvious Behaviors

- **Schema name/description**: Improve LLM guidance for some providers
- **Streaming errors**: With `streamObject`, errors become part of stream; use `onError` callback for logging
- **Repair attempt**: `experimental_repairText` tries JSON remediation post-generation (may succeed when validation would fail)
- **Response time**: `generateObject` can be slow; streaming mitigates via `partialObjectStream`
- **Tool integration**: `generateText`/`streamText` support `experimental_structuredOutput` to create structured data while calling tools simultaneously

---

## Anthropic Provider-Specific Configuration

### Initialization

```typescript
import { anthropic } from '@ai-sdk/anthropic';
// or
import { createAnthropic } from '@ai-sdk/anthropic';

const client = anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,  // Default: env var
  baseURL: 'https://api.anthropic.com/v1',  // Default API endpoint
  headers: { 'Custom-Header': 'value' },
  fetch: customFetchFn  // Custom implementation for interception
});
```

### Non-Obvious Constraints

- **API endpoint**: Only official Anthropic API supported; no OpenRouter, together.ai, etc. proxy endpoints
- **Custom fetch**: Useful for throttling, caching, authentication interception
- **Headers**: Passed to all API requests; useful for tracking, custom auth

---

## UIMessage to ModelMessage Conversion

### Function Signature & Behavior

```typescript
convertToModelMessages(
  messages: Message[],  // UIMessage[] from useChat hook
  options?: {
    tools?: ToolSet,
    convertDataPart?: (part: DataUIPart) => TextPart | FilePart | undefined
  }
): ModelMessage[]

// UIMessage is the source of truth; contains:
// - Full message history
// - All metadata
// - Tool results
// - Everything for restoring chat state

// ModelMessage is optimized for LLM (lossy):
// - Stripped-down format
// - Only LLM-relevant content
// - Used for streamText/generateText

// Typical flow:
// useChat hook (state)
//   ↓ UIMessage[]
// convertToModelMessages
//   ↓ ModelMessage[]
// streamText/generateText
//   ↓ response
// toUIMessageStreamResponse (if using helpers)
//   ↓ UIMessage[] (for persistence)
```

### Critical Constraints

- **Data part filtering**: By default, custom data parts in user messages are **excluded** unless `convertDataPart` callback returns TextPart or FilePart
- **Tool output conversion**: Tools can implement `toModelOutput` method to return multi-modal content arrays
- **Selective inclusion**: Only data parts returning valid model-compatible content are included; others silently ignored
- **Type safety**: Accepts generic parameter for custom UIMessage types with specific data part shapes

---

## Temperature & Variability Control

### Function Parameter Semantics

```typescript
generateText({
  temperature: 0.0    // Deterministic; highest confidence predictions
               0.5    // Balanced; moderate variation
               1.0    // Maximum variation; lowest confidence
})
```

### Non-Obvious Behavior

- **Temperature controls confidence**: Governs model's confidence level in predictions, not just randomness
- **0 temperature**: Deterministic output; identical prompts → identical responses
- **Higher temperature**: Model considers lower-probability tokens; dramatic variation at high values
- **Model-dependent defaults**: Different models have different default temperatures
- **Precision vs. creativity**: Use 0 for factual tasks (summaries, classifications); 0.6 for balanced suggestions; 1.0 for creative generation
- **Same prompt, same temperature != same output**: Temperature 0 guarantees consistency, higher temps guarantee variation

---

## Prompt Engineering Best Practices

### Start Simple, Then Iterate

```typescript
// Vague → specific
"Create a slogan"  // Generic
→
"Create a slogan for an organic coffee shop"  // More specific
→
"Create a catchy, memorable slogan for an organic, fair-trade coffee shop targeting millennials"  // Detailed
```

### Demonstrate Expected Output

```typescript
// Examples teach patterns better than instructions
const system = `
You are a JSON extractor. Extract product information.

Example:
Input: "The iPhone 15 costs $999 and is excellent"
Output: { "product": "iPhone 15", "price": 999, "sentiment": "positive" }

Now extract:
Input: ...
`;
```

### Non-Obvious Gotchas

- **Models predict, not reason**: LLMs assign probabilities to sequences; can generate plausible but false information
- **Grounding matters**: Outputs require verification; model cannot guarantee factual accuracy
- **Provider variation**: Performance/cost/speed vary dramatically between models; test before production
- **Fallback patterns**: High-quality system prompts reduce but don't eliminate bad outputs
- **Token efficiency**: Longer prompts consume tokens; balance specificity with cost/latency

### Validation Pattern

```typescript
// Always verify model outputs
const result = await generateText({ ... });

// Check for red flags
if (result.text.includes('I don\'t know') || result.finishReason === 'error') {
  // Retry or fallback
}
```

---

## Version: 6.0.0 (AI SDK Core)

Latest as of October 2025. Prompt caching and structured output features fully supported with Anthropic models.

### Key Feature Timeline

- **AI SDK 5**: Redesigned `useChat` hook, agent abstractions
- **AI SDK 4.2**: Anthropic prompt caching introduced
- **AI SDK 6 (beta)**: Agent abstraction layer for reusable AI agents
