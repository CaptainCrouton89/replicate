# Vercel AI SDK Model Providers - LLM Reference

## Critical Provider Setup Signatures

### Default Provider Imports
```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';
import { groq } from '@ai-sdk/groq';
import { gateway } from 'ai'; // AI SDK 5.0.36+
```

### Custom Provider Configuration
```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const customOpenAI = createOpenAI({
  apiKey: string,           // Defaults: OPENAI_API_KEY env var
  baseURL: string,          // Default: https://api.openai.com/v1
  organization: string,     // Optional OpenAI organization ID
  project: string,          // Optional OpenAI project ID
  headers: Record<string, string> | () => Record<string, string>,
  fetch: (url, options) => Promise<Response>,
});
```

## Provider-Specific Configuration

### OpenAI Provider

**Environment Variables:**
- `OPENAI_API_KEY` - Required for authentication

**Model Access Methods:**
```typescript
openai(modelId)           // Responses API (default in AI SDK 5)
openai.chat(modelId)      // Chat API (legacy)
openai.completion(modelId) // Completions API (gpt-3.5-turbo-instruct only)
```

**Provider-Specific Options** (`providerOptions.openai`):
```typescript
interface OpenAIResponsesProviderOptions {
  parallelToolCalls: boolean;      // Default: true
  store: boolean;                   // Default: true - enable prompt caching
  reasoningSummary: 'auto' | 'detailed';  // Default: 'auto'
  textVerbosity: 'low' | 'medium' | 'high';
  serviceTier: 'auto' | 'flex' | 'priority' | 'default';
  maxToolCalls: number;             // Limit concurrent tool calls
  metadata: Record<string, string>;
  user: string;                     // End-user identifier for monitoring
  instructions: string;             // System instructions override
}

interface OpenAIChatLanguageModelOptions {
  logitBias: Record<number, number>;     // Token ID bias weights
  logprobs: boolean | number;            // Return log probabilities
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high';
  structuredOutputs: boolean;            // Default: true (Responses API only)
  maxCompletionTokens: number;
}
```

**Built-in Tools:**
```typescript
openai.tools.webSearch()      // Web search integration
openai.tools.fileSearch()     // File search in uploaded documents
openai.tools.imageGeneration() // DALL-E 3/2 generation
openai.tools.codeInterpreter() // Code execution
openai.tools.localShell()     // Local shell (Codex only)
```

**Embedding & Specialized Models:**
```typescript
openai.textEmbedding('text-embedding-3-large' | 'text-embedding-3-small')
openai.image('dall-e-3' | 'dall-e-2')
openai.transcription('whisper-1')
openai.speech('tts-1' | 'tts-1-hd')
```

### Anthropic Provider

**Environment Variables:**
- `ANTHROPIC_API_KEY` - Required for authentication

**Provider-Specific Options** (`providerOptions.anthropic`):
```typescript
interface AnthropicProviderOptions {
  disableParallelToolUse: boolean;  // Force sequential tool calls
  sendReasoning: boolean;           // Include reasoning in requests
  thinking: {
    type: 'enabled' | 'disabled';
    budgetTokens: number;           // Token budget for thinking
  };
  cacheControl: 'ephemeral';        // Mark breakpoints for prompt caching
}
```

**Thinking/Reasoning Configuration:**
- Available for: `claude-opus-4-20250514`, `claude-sonnet-4-20250514`, `claude-3-7-sonnet-20250219`
- Set via `thinking` provider option with token budget
- Enable structured reasoning output with `sendReasoning: true`

**Streaming Enhancement:**
```typescript
// Enable fine-grained tool streaming (required header)
headers: {
  'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14'
}
```

**Provider-Defined Tools** (first-class support):
```typescript
anthropic.tools.webSearch()       // Web search
anthropic.tools.webFetch()        // Fetch webpage content
anthropic.tools.codeExecution()   // Execute code
anthropic.tools.computerUse()     // Keyboard/mouse automation
anthropic.tools.documentProcessing({
  // Supports PPTX, DOCX, PDF, XLSX
  type: 'file_content',
  source: { type: 'base64', media_type, data }
})
```

**Prompt Caching Syntax:**
```typescript
// Mark cache breakpoints in message content
providerOptions: {
  anthropic: {
    cacheControl: 'ephemeral' // Only on blocks that should be cached
  }
}
```

### Google Generative AI Provider

**Environment Variables:**
- `GOOGLE_GENERATIVE_AI_API_KEY` - Required for authentication

**Model Access:**
```typescript
google('gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash-exp')
google.textEmbedding('text-embedding-004' | 'embedding-001')
```

**Configuration:**
```typescript
const googleConfig = createGoogleGenerativeAI({
  apiKey: string,                   // Default: GOOGLE_GENERATIVE_AI_API_KEY
  baseURL: string,                  // Default: https://generativelanguage.googleapis.com/v1beta
  headers: Record<string, string> | () => Record<string, string>,
  fetch: (url, options) => Promise<Response>,
});
```

**Provider-Specific Options:**
```typescript
interface GoogleGenerativeAIProviderOptions {
  thinking: {
    type: 'enabled' | 'disabled';
    budget_tokens: number;
  };
  caching: {
    ttl: string;  // Cache time-to-live
  };
  safetySettings: [{
    category: string;
    threshold: 'BLOCK_NONE' | 'BLOCK_ONLY_HIGH' | 'BLOCK_MEDIUM_AND_ABOVE' | 'BLOCK_LOW_AND_ABOVE';
  }];
  systemInstruction: string;  // System prompt (auto-prepended for Gemma)
  topK: number;
  topP: number;
}
```

**Special Behaviors:**
- System instructions auto-prepended as first user message for Gemma models
- File inputs support PDFs, YouTube URLs, and cached content
- Thinking configuration requires compatible models

### Google Vertex AI Provider

**Environment Variables:**
- `GOOGLE_VERTEX_LOCATION` - Cloud region (defaults to `us-central1`)

**Authentication:**
```typescript
interface GoogleVertexAuthOptions {
  credentials?: {
    client_email: string;
    private_key: string;
  } | ExternalAccountClientOptions;
  clientOptions?: ClientOptions;
  scopes?: string | string[];  // Cloud API scopes
}
```

**Configuration:**
```typescript
createGoogleVertexAI({
  project: string,            // Google Cloud project ID (required)
  location: string,           // Default: GOOGLE_VERTEX_LOCATION env var
  apiKey?: string,            // Alternative to credential-based auth
  headers: Record<string, string> | () => Record<string, string>,
  fetch: (url, options) => Promise<Response>,
})
```

### Azure OpenAI Provider

**Environment Variables:**
- `AZURE_RESOURCE_NAME` - Azure resource identifier
- `AZURE_API_KEY` - API key for authentication

**URL Construction Pattern:**
```
https://{resourceName}.openai.azure.com/openai/v1{path}
```

**Non-Obvious Configuration:**
```typescript
const azureConfig = createAzureOpenAI({
  resourceName: string,             // Azure resource ID (AZURE_RESOURCE_NAME)
  apiKey: string,                   // AZURE_API_KEY
  apiVersion: string,               // Default: 'v1', use '2025-04-01-preview' for transcription
  useDeploymentBasedUrls: boolean;  // Required for legacy deployments with /deployments/ path
  baseURL?: string,                 // Override full base URL
  headers: Record<string, string>,
});
```

**Critical Constraints:**
- **Transcription Deployment Error**: If `DeploymentNotFound` with transcription, set:
  - `useDeploymentBasedUrls: true`
  - `apiVersion: '2025-04-01-preview'` or earlier
- **Image Generation**: Requires `x-ms-oai-image-generation-deployment` header specifying deployment name; both responses API and image models must exist in same resource
- **Deployment URLs**: Legacy deployments require `useDeploymentBasedUrls: true` for URL format `/deployments/{deploymentId}{path}?api-version={apiVersion}`

### Mistral Provider

**Environment Variables:**
- `MISTRAL_API_KEY` - Required for authentication

**Configuration:**
```typescript
createMistral({
  apiKey: string,           // Default: MISTRAL_API_KEY
  baseURL: string,          // Default: https://api.mistral.ai/v1
  headers: Record<string, string>,
  fetch: (url, options) => Promise<Response>,
});
```

**Reasoning Models** (`magistral-*`):
- Access reasoning via `<think>` tags in output
- Use `extractReasoningMiddleware` to separate reasoning from response
- Models: `magistral-small-2506`, `magistral-medium-2506`

**Structured Output Configuration:**
```typescript
providerOptions: {
  mistral: {
    strictJsonSchema: boolean;  // Enforce strict JSON Schema validation
  }
}
```

**OCR Capability:**
```typescript
// Process PDFs with optional limits
providerOptions: {
  mistral: {
    imageMaxProcessingImages: number;  // Limit image pages for OCR
  }
}
```

### Groq Provider

**Environment Variables:**
- `GROQ_API_KEY` - Required for authentication

**Configuration:**
```typescript
createGroq({
  apiKey: string,           // Default: GROQ_API_KEY
  baseURL: string,          // Default: https://api.groq.com/openai/v1
  headers: Record<string, string>,
  fetch: (url, options) => Promise<Response>,
});
```

**Reasoning Model Options** (`providerOptions.groq`):
```typescript
interface GroqReasoningOptions {
  reasoningFormat: 'parsed' | 'hidden' | 'raw';  // How reasoning appears
  reasoningEffort: {
    'qwen/qwen3-32b': 'none' | 'default';
    'deepseek/deepseek-r1-distill-llama-70b': 'none' | 'default';
    'gpt-oss/gpt-oss20b' | 'gpt-oss120b': 'low' | 'medium' | 'high';
  };
  structuredOutputs: boolean;  // JSON schema format (default: true)
  parallelToolCalls: boolean;  // Concurrent tool calls (default: true)
  serviceTier: 'on_demand' | 'flex' | 'auto';  // 'flex' = 10x rate limits
}
```

**Non-Obvious Behavior:** `reasoningEffort` values vary by model; incorrect value silently reverts to defaults.

### Vercel AI Gateway

**Authentication Methods:**
1. **API Key**: `AI_GATEWAY_API_KEY` environment variable
2. **OIDC (Vercel Projects)**: Automatic during `vercel dev` with token refresh
3. **BYOK (Bring Your Own Key)**: Configure in Vercel team settings

**Configuration:**
```typescript
import { gateway } from 'ai'; // AI SDK 5.0.36+

createGateway({
  apiKey: string,              // Default: AI_GATEWAY_API_KEY
  baseURL: string,             // Default: https://ai-gateway.vercel.sh/v1/ai
  headers: Record<string, string>,
  metadataCacheRefreshMillis: number,  // Default: 5 minutes
});
```

**Routing & Fallback Options** (`providerOptions.gateway`):
```typescript
interface GatewayOptions {
  order: string[];            // Provider sequence for fallback attempts
  only: string[];             // Restrict to specific providers
  models: Record<string, string>;  // Alternative models when primary fails
  user: string;               // End-user ID for spend attribution
  tags: Record<string, string>;    // Analytics categorization
}
```

**Dynamic Model Discovery:**
```typescript
gateway.getAvailableModels()  // Array of supported models with pricing
gateway.getCredits()          // { current: number, total: number }
```

## Custom Provider Creation

### `customProvider()` Function Signature
```typescript
customProvider({
  languageModels?: Record<string, LanguageModel>,
  textEmbeddingModels?: Record<string, EmbeddingModel<string>>,
  imageModels?: Record<string, ImageModel>,
  fallbackProvider?: Provider,  // Used when model ID not found
}): Provider
```

**Return Type Methods:**
- `languageModel(id: string): LanguageModel`
- `textEmbeddingModel(id: string): EmbeddingModel<string>`
- `imageModel(id: string): ImageModel`

### Provider Registry Pattern
```typescript
import { createProviderRegistry } from 'ai';

const registry = createProviderRegistry({
  anthropic: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
  openai: createOpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  custom: createOpenAICompatible({ baseURL: 'https://api.custom.com/v1' })
});

// Access with namespace: {providerId}:{modelId}
registry.languageModel('openai:gpt-4o')
registry.textEmbeddingModel('openai:text-embedding-3-small')
```

**Non-Obvious:** Colon (`:`) is the default separator; models without prefix use fallback provider.

### Global Provider Configuration
```typescript
// Set default provider globally
globalThis.AI_SDK_DEFAULT_PROVIDER = openai;

// Now model strings don't require provider prefix
await streamText({
  model: 'gpt-4o',  // Automatically uses globalThis.AI_SDK_DEFAULT_PROVIDER
  prompt: 'Your prompt'
});
```

## Language Model Middleware Patterns

### `wrapLanguageModel()` Signature
```typescript
wrapLanguageModel({
  model: LanguageModelV2,
  middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[]
}): LanguageModel
```

**Middleware Application Order:**
- Multiple middlewares: first transforms input, last wraps model directly
- Each middleware intercepts before/after model call

### `LanguageModelV2Middleware` Interface
```typescript
interface LanguageModelV2Middleware {
  transformParams?: (params: LanguageModelV2CallOptions) =>
    Awaitable<LanguageModelV2CallOptions>;

  wrapGenerate?: (doGenerate: (options) => Promise<LanguageModelV2Result>) =>
    (options) => Promise<LanguageModelV2Result>;

  wrapStream?: (doStream: (options) => AsyncIterable<LanguageModelV2StreamPart>) =>
    (options) => AsyncIterable<LanguageModelV2StreamPart>;
}
```

### `defaultSettingsMiddleware()` Configuration
```typescript
defaultSettingsMiddleware({
  settings: {
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: number;
    presencePenalty: number;
    frequencyPenalty: number;
    stopSequences: string[];
    seed: number;
    providerOptions: {
      openai: { ... },
      anthropic: { ... },
      // provider-specific overrides
    }
  }
})
```

**Behavior:** Explicitly provided parameters override defaults in each call.

### Built-in Middleware
```typescript
extractReasoningMiddleware  // Separate reasoning tags (<think>) as reasoningText
simulateStreamingMiddleware // Enable streaming for non-streaming models
defaultSettingsMiddleware   // Apply consistent defaults across calls
```

## Structured Output Generation

### Model Compatibility Matrix
```typescript
// Not all models support all features
// Check: image input, object generation, tool usage, tool streaming

// Full support (OpenAI gpt-5, gpt-4o):
// ✓ Image input, ✓ Object generation, ✓ Tool usage, ✓ Tool streaming

// Anthropic claude-opus/sonnet/haiku:
// ✓ Image input, ✓ Object generation, ✓ Tool usage, ✓ Tool streaming

// Google Gemini 2.0 Flash:
// ✓ Image input, ✓ Object generation, ✓ Tool usage, ✓ Tool streaming
```

### `generateObject()` / `streamObject()` Patterns
```typescript
// Three schema formats supported:
interface ObjectGenerationOptions {
  schema: ZodSchema | ValibotSchema | JSONSchema;  // All three supported
  mode: 'object' | 'array' | 'enum' | 'no-schema'; // Default: 'object'
  schemaName: string;      // Alias for tool/schema naming
  schemaDescription: string;  // LLM guidance for schema
}

// Mode Details:
// 'object' → Single validated object (default)
// 'array' → Array elements via elementStream callback
// 'enum' → Classification with predefined values (generateObject only)
// 'no-schema' → Dynamic schema-less generation
```

### Provider-Specific Constraints
```typescript
// Check configuration flag for structured output support
interface LanguageModelV2 {
  supportsStructuredOutputs?: boolean;
  // If not set, defaults to true for major providers
}

// For custom/OpenAI-compatible providers:
createOpenAICompatible({
  supportsStructuredOutputs: true  // Must explicitly enable
})
```

### Error Handling
```typescript
// AI_NoObjectGeneratedError contains:
{
  text: string;             // Failed generation text
  response: {
    id: string;             // Provider response ID
    model: string;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  cause?: {
    name: string;           // 'JsonParseError' | 'ValidationError'
    message: string;
  };
}

// Optional recovery:
experimental_repairText?: (text: string, error: Error) => Awaitable<string>;
```

## Provider Switching Patterns

### Pattern 1: Conditional Provider Selection
```typescript
// Select provider based on feature requirements
function getModelForTask(task: 'reasoning' | 'fast' | 'cheap') {
  switch(task) {
    case 'reasoning':
      return anthropic('claude-opus-4-20250514');  // Extended thinking
    case 'fast':
      return groq('llama-3.1-70b-versatile');      // Optimized for speed
    case 'cheap':
      return mistral('mistral-7b-instruct');       // Smallest model
  }
}
```

### Pattern 2: Fallback Chain with Registry
```typescript
// Create registry with fallback sequence
const models = createProviderRegistry({
  primary: anthropic,
  secondary: openai,
  tertiary: mistral
});

// Use with gateway fallback routing
streamText({
  model: 'primary:claude-3-5-sonnet-20241022',
  providerOptions: {
    gateway: {
      order: ['anthropic', 'openai', 'mistral'],
      models: {
        'primary:claude-3-5-sonnet-20241022': 'secondary:gpt-4o'  // Fallback mapping
      }
    }
  }
});
```

### Pattern 3: Pre-configured Aliases
```typescript
export const models = customProvider({
  languageModels: {
    'reasoning': wrapLanguageModel({
      model: anthropic('claude-opus-4-20250514'),
      middleware: defaultSettingsMiddleware({
        settings: {
          temperature: 0.2,
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 10000 }
            }
          }
        }
      })
    }),
    'streaming': mistral('mistral-large-latest'),
    'cheap': groq('mixtral-8x7b-32768'),
  },
  fallbackProvider: openai  // Fallback for unknown model IDs
});

// Usage: model: 'reasoning' automatically uses configured version
```

## Non-Obvious Behaviors & Gotchas

### AI SDK 5 Breaking Changes
- **Responses API Default**: `openai()` now uses Responses API by default, not Chat API
- Use `openai.chat()` explicitly if Chat API required
- Responses API: `parallelToolCalls: true` by default (Chat API was false)

### Environment Variable Defaults
```typescript
// All providers attempt env var first, then require explicit apiKey
OPENAI_API_KEY → createOpenAI({ apiKey: ... })
ANTHROPIC_API_KEY → createAnthropic({ apiKey: ... })
GOOGLE_GENERATIVE_AI_API_KEY → createGoogleGenerativeAI({ apiKey: ... })
MISTRAL_API_KEY → createMistral({ apiKey: ... })
GROQ_API_KEY → createGroq({ apiKey: ... })
COHERE_API_KEY → createCohere({ apiKey: ... })
AZURE_RESOURCE_NAME + AZURE_API_KEY → createAzureOpenAI({ ... })
AI_GATEWAY_API_KEY → createGateway({ ... })
```

### Provider Registry Delimiter
- Default separator is `:` (colon), not `/` or `|`
- `'openai:gpt-4o'` works; `'openai/gpt-4o'` does not

### Structured Output Mode Defaults
```typescript
// Default mode selection (important for schema validation):
generateObject({ schema: mySchema })
  // → defaults to mode: 'object'
generateObject({ schema: mySchema, mode: 'no-schema' })
  // → no schema validation, dynamic output

streamObject({ })
  // → mode defaults based on context
  // → 'object' for schema-first, 'no-schema' for schema-less
```

### Anthropic Parallel Tool Calls
- **Default**: Enabled (`disableParallelToolUse: false`)
- Setting `true` forces sequential execution—can slow multi-tool calls
- No partial tool results; all tools complete before response

### Groq `reasoningEffort` Silent Fallback
- Incorrect `reasoningEffort` value for model doesn't error
- Silently reverts to model's default effort level
- Always validate model supports requested effort value

### Azure Deployment-Based URLs
- Legacy deployments require both resource name AND `useDeploymentBasedUrls: true`
- URL becomes: `https://{resource}.openai.azure.com/openai/deployments/{deploymentId}/{path}?api-version={version}`
- Transcription has special requirements; use `apiVersion: '2025-04-01-preview'` or earlier

### Gemini System Instructions
- For Gemma models: system instruction automatically prepended as first user message
- Other Gemini models accept systemInstruction directly
- Affects token counting and message structure

### Streaming Simulation Behavior
```typescript
// simulateStreamingMiddleware converts non-streaming to streaming
// Entire response generated, then chunked into stream
// Does NOT provide true streaming latency improvements
// Useful for: API compatibility, testing
```

### Google Vertex Caching TTL Format
```typescript
// TTL must be string format:
caching: {
  ttl: '3600s'    // Valid: with 's' suffix
  ttl: '3600'     // Invalid: missing suffix
}
```

### OpenAI Structured Output Availability
```typescript
// structuredOutputs: true only works with Responses API, not Chat API
openai('gpt-4o', {
  structuredOutputs: true  // ✓ Works with openai()
})

openai.chat('gpt-4o', {
  structuredOutputs: true  // ✗ Ignored; Chat API doesn't support
})
```

## Version: 5.0.40+ (Latest 2025)

**Key Features in AI SDK 5:**
- Global provider system with automatic setup
- Responses API as OpenAI default
- Experimental speech/transcription APIs
- Fine-grained tool streaming (Anthropic)
- Extended thinking/reasoning support across providers
- Multi-modal message handling standardized
- Gateway fallback routing with spend tracking

**Breaking Changes from AI SDK 4:**
- OpenAI default changed from Chat to Responses API
- Provider instance imports simplified (no `openai.default`, just `openai`)
- Message format standardization for consistency
- Tool result streaming behavior changes
