# Vercel AI SDK Tools & Function Calling - LLM Reference

## Critical Signatures

### Static Tool Definition
```typescript
tool({
  description?: string,                    // Influences model's tool selection decision
  inputSchema: ZodSchema | JSONSchema,     // REQUIRED: defines expected input; model uses to generate args
  execute?: async (args: INPUT, options: ToolCallOptions) => RESULT | AsyncIterable<RESULT>,
  outputSchema?: ZodSchema | JSONSchema,   // NEW in SDK 5: validates tool output, enables type safety
  id?: string,                             // Tool identifier (generated if omitted)
  providerOptions?: Record<string, any>    // Provider-specific config (e.g., Anthropic caching)
})
```

### Dynamic Tool Definition
```typescript
dynamicTool({
  description: string,
  inputSchema: FlexibleSchema<unknown>,    // MUST be present even for dynamic inputs; use z.unknown() or z.any()
  execute: async (args: unknown, options: ToolCallOptions) => unknown | AsyncIterable<unknown>
})
```
**Critical**: Dynamic tools return `Tool<unknown, unknown>` with `type: 'dynamic'`. When processing, check `toolCall.dynamic` flag for type narrowing.

## ToolCallOptions - Second Parameter to Execute

```typescript
{
  toolCallId: string,                      // Unique ID for this tool invocation; use for tracking/annotations
  messages: ModelMessage[],                // Full conversation history (excludes system prompt, assistant response)
  abortSignal?: AbortSignal,               // Cancellation signal from parent request
  experimental_context?: unknown           // Arbitrary context passed via generateText/streamText
}
```

## Multi-Step Tool Calling

### streamText with maxSteps
```typescript
const { textStream, steps } = await streamText({
  model,
  prompt: "What's the weather in London and Paris?",
  tools: { getWeather: tool1, getLocation: tool2 },
  maxSteps: 5,              // Number of reasoning steps; default: 1
  stopWhen?: (step) => boolean,  // NEW SDK 5: condition to stop iteration
  prepareStep?: (step) => any    // NEW SDK 5: callback before each step (for compression/overrides)
});
```

**Non-obvious**: Model decides WHETHER to use tools; you define WHAT'S available. `maxSteps` doesn't force tool calls—model may respond with text instead.

### generateText Multi-Step
```typescript
const { text, steps } = await generateText({
  model,
  tools: { getWeather },
  maxSteps: 5,
  // ... other options
});
// steps is array of tool calls and results in sequence
```

## Tool Execution Result Patterns

### Single Result (Default)
```typescript
execute: async ({ param }) => ({ status: 'success', data: value })
```

### Streaming Results (AsyncIterable)
```typescript
async *execute({ location }) {
  yield { status: 'loading', text: 'Fetching weather...' };
  await delay(3000);
  yield { status: 'success', weather: 72, humidity: 65 };
  // All yields except last are preliminary; last is tool result sent to model
}
```

## Tool Selection Control

```typescript
{
  toolChoice: 'auto'                  // Default: model chooses whether/which tool
           | 'required'               // Model MUST call a tool
           | 'none'                   // Model cannot use tools
           | { type: 'tool', toolName: string },  // Force specific tool
  activeTools?: string[]              // Whitelist of available tools by name; undefined = all active
}
```

**Constraint**: Model can only handle limited tool count (provider-dependent); use `activeTools` to stay within limits.

## Schema Definition Patterns

### Input Schema with Zod
```typescript
inputSchema: z.object({
  city: z.string().describe('City name for lookup'),
  units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  timeframe: z.number().min(1).max(7).describe('Days ahead')  // Non-obvious constraints
})
```

### JSON Schema (Alternative)
```typescript
inputSchema: jsonSchema({
  type: 'object',
  properties: {
    city: { type: 'string', description: '...' }
  },
  required: ['city']
})
```

## Tool Call Result Handling

### In generateText
```typescript
const result = await generateText({ tools: { getTool } });
// result.steps: Step[] containing tool calls and results
// result.toolCalls: Only the tool calls themselves

steps.forEach(step => {
  if (step.type === 'tool-call') {
    console.log(step.toolName, step.args);
  } else if (step.type === 'tool-result') {
    console.log(step.result);
  } else if (step.type === 'text') {
    console.log(step.text);
  }
});
```

### Tool Errors in Steps
```typescript
// generateText: errors appear as step.type === 'tool-error'
// streamText: errors appear as 'tool-error' parts in stream
// Schema validation errors throw exceptions (not returned as errors)
```

**Non-obvious**: Invalid tool input against schema throws exception immediately; execution errors return as `tool-error` in steps.

## Tool Call Repair (Experimental)

```typescript
// Enable automatic repair in multi-step scenarios:
const { text, steps } = await generateText({
  maxSteps: 3,
  tools: { getTool }
  // Failed tool calls auto-repair in next step
});

// Manual repair with experimental_repairToolCall:
// TBD - feature exists but specific API undocumented
```

**Constraint**: Repair adds extra steps to message history. Consider cost/latency tradeoff.

## Provider-Specific Tool Caching (AI SDK 5)

### Anthropic Prompt Caching
```typescript
tools: {
  getTool: tool({
    description: 'Heavy tool definition',
    inputSchema: z.object({ /* ... */ }),
    execute: async (args) => { /* ... */ },
    providerOptions: {
      anthropic: {
        cacheControl: { type: 'ephemeral' }
      }
    }
  })
}
```

**Non-obvious**: Tool-level caching reduces token usage for multi-step agents (AI SDK 5+). Only supported on Anthropic provider currently.

## Dynamic Tools vs Static

| Feature | Static Tool | Dynamic Tool |
|---------|------------|--------------|
| Type inference | Full (INPUT → OUTPUT) | None (unknown → unknown) |
| Compile-time safety | Yes | No |
| Schema required | Yes | Yes (even for unknown) |
| Use case | Known interfaces | MCP tools, runtime-loaded functions |
| Runtime validation | Automatic via Zod | Manual casting required |

```typescript
// Type narrowing pattern:
for (const toolCall of toolCalls) {
  if (toolCall.dynamic) {
    // Must cast and validate at runtime
    const input = toolCall.args as any;
    // Validate input before using
  } else {
    // Full type safety
    switch (toolCall.toolName) {
      case 'getTool': console.log(toolCall.args.param); break;
    }
  }
}
```

## Configuration Gotchas

1. **inputSchema descriptions matter**: Model reads descriptions to understand parameter purpose. Vague descriptions = poor tool invocation.

2. **execute is optional**: Tool can be defined without execute function (useful for client-side validation). Model generates call but nothing runs server-side.

3. **Output typing**: Set `outputSchema` for type safety in streaming scenarios where client processes tool results.

4. **maxSteps default is 1**: Without setting maxSteps, tool calls halt after first response. No automatic looping.

5. **Messages parameter in execute**: Doesn't include system prompt or final assistant response—useful for context but not complete conversation.

6. **abortSignal forwarding**: Parent request cancellation propagates to tool execution. Tools should listen and clean up resources.

7. **AsyncIterable yields**: All yields except the final one are "preliminary." Don't treat intermediate yields as tool results to the model—only the last yield becomes the actual result.

8. **activeTools with undefined**: `undefined` means ALL tools active. Empty array `[]` means NO tools active (rare edge case).

9. **toolChoice: 'required' doesn't specify which tool**: Model must choose, but might fail with ambiguous schemas.

10. **UIMessage type limitation**: Vercel AI SDK UI hooks (useChat) don't support `providerOptions`—convert to model messages first if caching needed.

## Common Patterns

### Error Handling in Multi-Step
```typescript
const { text, steps } = await generateText({
  maxSteps: 5,
  tools: { getTool }
});

// Check for tool errors in steps
const hasErrors = steps.some(s => s.type === 'tool-error');
if (hasErrors) {
  const errors = steps.filter(s => s.type === 'tool-error');
  // Handle gracefully—model may have recovered in subsequent steps
}
```

### Passing Context to Tools
```typescript
const { text } = await generateText({
  tools: { getTool },
  experimental_context: { userId: 'user-123', apiKey: 'secret' },
  // ... other options
});

// In tool execute:
execute: async (args, { experimental_context }) => {
  const { userId, apiKey } = experimental_context;
  // Use context for database lookups, auth, etc.
}
```

### Tool Limiting Due to Context
```typescript
// Model can handle ~20-30 tools depending on provider
// Use activeTools to swap tool sets across steps:

let currentTools = getInitialTools();
const { steps } = await generateText({
  maxSteps: 3,
  tools: currentTools,
  activeTools: Object.keys(currentTools),
  // After first step, model might need different tools
});
```

## Version: 5.0.0+

**Key Changes from Earlier Versions:**
- `parameters` renamed to `inputSchema` (SDK 5)
- `result` renamed to `output` (SDK 5)
- `outputSchema` introduced (SDK 5)
- Tool-level `providerOptions` added (SDK 5)
- `stopWhen` and `prepareStep` callbacks added (SDK 5)
- Tool call repair experimental feature stabilizing (SDK 4.1+)
- `experimental_context` availability expanded (SDK 4.1+)
