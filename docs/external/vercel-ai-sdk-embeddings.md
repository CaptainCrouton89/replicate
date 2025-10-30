# Vercel AI SDK Embeddings & RAG - LLM Reference

## Critical Function Signatures

### `embed()` - Single Value Embedding
```typescript
embed({
  model: EmbeddingModel,           // Required: e.g., openai.textEmbeddingModel('text-embedding-3-small')
  value: string,                   // Required: the input to embed
  maxRetries?: number,             // Default: 2 (set to 0 to disable retries)
  abortSignal?: AbortSignal,       // Optional: cancel/timeout
  headers?: Record<string, string>,// Optional: custom HTTP headers
  experimental_telemetry?: TelemetrySettings, // Optional: advanced telemetry config
  providerOptions?: object,        // Optional: provider-specific settings
}): Promise<{
  value: string,
  embedding: number[],             // Vector array, dimensions depend on model
  usage: { tokens: number },
  response?: { headers?: Record<string, string>; providerMetadata?: unknown }
}>
```

### `embedMany()` - Batch Embedding
```typescript
embedMany({
  model: EmbeddingModel,           // Required: embedding model instance
  values: string[],                // Required: array of inputs to embed
  maxRetries?: number,             // Default: 2
  abortSignal?: AbortSignal,       // Optional: cancel all parallel requests
  headers?: Record<string, string>,// Optional: custom headers
  experimental_telemetry?: TelemetrySettings, // Optional
  providerOptions?: object,        // Optional: provider-specific settings
}): Promise<{
  values: string[],                // Input values preserved in same order
  embeddings: number[][],          // Array of vectors, order matches input
  usage: { tokens: number },       // Total tokens for all embeddings
  response?: { providerMetadata?: unknown }
}>
```

**Critical Behavior**: embedMany automatically chunks large requests if model has batch limits. Output ordering is ALWAYS guaranteed to match input ordering.

### `cosineSimilarity()` - Vector Comparison
```typescript
cosineSimilarity(
  vector1: number[],               // First embedding vector
  vector2: number[]                // Second embedding vector
): number                           // Range: -1 to 1

// Value interpretation:
// 1.0   = identical direction (highly similar)
// 0.5   = moderate similarity
// 0.0   = orthogonal (no similarity)
// -0.5  = opposite direction
// -1.0  = exact opposite direction
```

---

## Configuration Shapes

### OpenAI Embedding Models
```typescript
// Model creation
openai.textEmbeddingModel(modelName: string)
// Available: 'text-embedding-3-large' | 'text-embedding-3-small' | 'text-embedding-ada-002'

// Provider options (via providerOptions.openai)
{
  dimensions?: number,  // ONLY supported in text-embedding-3 variants, not ada-002
  user?: string,        // End-user identifier for abuse detection
}

// Default dimensions
{
  'text-embedding-3-large': 3072,
  'text-embedding-3-small': 1536,
  'text-embedding-ada-002': 1536 // NO dimension customization
}
```

### Cohere Embedding Models
```typescript
// Model creation
cohere.textEmbeddingModel(modelName: string)
// Available: 'embed-english-v3.0' | 'embed-multilingual-v3.0' |
//            'embed-english-light-v3.0' | 'embed-multilingual-light-v3.0'

// Model dimensions
{
  'embed-english-v3.0': 1024,
  'embed-multilingual-v3.0': 1024,
  'embed-english-light-v3.0': 384,
  'embed-multilingual-light-v3.0': 384,
}

// Provider options (via providerOptions.cohere)
{
  inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering',
    // Default: 'search_query'
    // 'search_document': for stored DB embeddings
    // 'search_query': for query embeddings to match against DB
    // 'classification': for text classifier inputs
    // 'clustering': for clustering algorithm inputs
  truncate?: 'NONE' | 'START' | 'END',
    // Default: 'END'
    // NONE: throw error if input exceeds max tokens
    // START: discard beginning of input to fit
    // END: discard end of input to fit
}
```

### Mistral Embedding Models
```typescript
// Model creation
mistral.textEmbeddingModel('mistral-embed')

// Dimensions
{
  'mistral-embed': 1024
}

// No additional provider options documented
// Max input: 8,000 tokens
```

### Azure OpenAI Embedding Models
```typescript
// Model creation - requires deployment name
azure.textEmbedding('your-embedding-deployment')
// Deployment must exist in Azure OpenAI resource

// Required environment variables or configuration
{
  AZURE_API_KEY: string,       // API key for authentication
  AZURE_RESOURCE_NAME: string, // e.g., "my-resource" → my-resource.openai.azure.com
}

// Provider options (via providerOptions.openai)
{
  dimensions?: number,  // Only for text-embedding-3 variants
  user?: string,        // End-user identifier
}

// URL format constructed as: https://{resourceName}.openai.azure.com/openai/v1{path}
```

---

## Non-Obvious Behaviors & Gotchas

### 1. Embedding Quality vs Input Size
**GOTCHA**: "The larger the input to your embedding, the lower quality the embedding will be"
- Chunk text into smaller pieces before embedding for RAG
- Sentence-level chunking is the documented default
- Larger chunks = degraded semantic quality

### 2. Model Dimension Constraints
- OpenAI: `text-embedding-ada-002` does NOT support custom dimensions; only text-embedding-3+ models do
- If you pass `dimensions` to ada-002, it will fail silently or ignore the parameter
- Cohere light models (384 dims) are significantly smaller than v3.0 (1024 dims)

### 3. Retry Behavior & Timeouts
- Default `maxRetries: 2` means 3 total attempts (initial + 2 retries)
- Setting `maxRetries: 0` disables ALL retries and will fail immediately on network errors
- Use `abortSignal` with timeout to control total wait time (retries will respect the signal)

### 4. Cosine Similarity Range Misinterpretation
- Range is -1 to 1, NOT 0 to 1
- Value 0 means "no relationship" (orthogonal), not "no similarity"
- In RAG filtering, thresholds of 0.5+ are common for relevance cutoffs
- Do NOT use raw cosine similarity for ranking without normalizing to [0, 1] if needed

### 5. embedMany Ordering Guarantee
- Input order is ALWAYS preserved in output
- If you pass `['apple', 'banana', 'cherry']`, embeddings output will match that order
- Safe to use with database operations without resorting

### 6. Cohere inputType Must Match Usage
- If you embed documents with `inputType: 'search_document'`, later queries must use `inputType: 'search_query'`
- Mixing types in similarity comparison will produce misleading scores
- This is NOT enforced by the SDK; you must manually ensure consistency

### 7. Batch Chunking is Transparent
- embedMany may split large requests automatically if model has batch limits
- You do NOT need to manually batch; the SDK handles it
- This means 10,000 items will be transparently chunked by the SDK
- Token usage reported includes all chunks

### 8. Azure OpenAI Deployment Name
- You MUST create the embedding deployment in Azure first
- The deployment name is NOT the same as the model name
- You can have multiple deployments of the same model with different names
- If deployment doesn't exist, you get a 404, not a helpful error message

### 9. Telemetry Defaults (Experimental)
- By default, telemetry is DISABLED (`isEnabled: false`)
- Even when enabled, `recordInputs` and `recordOutputs` are enabled by default
- This means embeddings and their inputs will be recorded if telemetry is enabled
- This is a privacy consideration for sensitive data

### 10. Similarity Thresholds in RAG
- Common production threshold: `similarity > 0.5` (50% match confidence)
- Below 0.3-0.4: mostly noise, high hallucination risk
- Threshold too high (0.9+): too few results, incomplete context
- Must be tuned per dataset and use case

---

## RAG-Specific Patterns

### Vector Storage with Similarity Search
```typescript
// RAG retrieval pattern with PostgreSQL + pgvector
const userQueryEmbedding = await embed({
  model: openai.textEmbeddingModel('text-embedding-3-small'),
  value: userQuery,
});

// Calculate cosine distance (1 - similarity) for database filtering
const similarity = sql<number>`1 - (${cosineDistance(
  documents.embedding,
  userQueryEmbedding.embedding,
)})`;

const relevantDocuments = await db
  .select({ content: documents.content, similarity })
  .from(documents)
  .where(gt(similarity, 0.5))           // Threshold: > 50% similarity
  .orderBy(desc(similarity))
  .limit(4);                             // Retrieve top 4 chunks
```

### Batch Embedding for Ingestion
```typescript
// When loading documents for RAG, use embedMany for efficiency
const chunks = [
  "First chunk of document...",
  "Second chunk of document...",
  "Third chunk of document...",
];

const { embeddings, usage } = await embedMany({
  model: openai.textEmbeddingModel('text-embedding-3-small'),
  values: chunks,
  maxRetries: 1,  // Reduce retries for large batch operations
});

// embeddings[i] corresponds to chunks[i]
// Save to database with usage.tokens for cost tracking
```

### Multi-Step RAG Workflow
```typescript
// RAG agents should support multiple tool calls before generating response
const response = await streamText({
  model: claude,
  prompt: userQuery,
  tools: {
    searchDocuments: {
      description: 'Search knowledge base for relevant documents',
      execute: async (query) => {
        const queryEmbedding = await embed({
          model: openai.textEmbeddingModel('text-embedding-3-small'),
          value: query,
        });
        // Return top 4 results with similarity > 0.5
        return similaritySearch(queryEmbedding.embedding, 0.5, 4);
      }
    }
  },
  stopWhen: stepCountIs(5),  // Allow up to 5 tool calls
});
```

### Chunking Considerations
- Default: sentence-level chunking
- Trade-off: larger chunks = more context but lower embedding quality
- Overlap: consider overlapping chunks (50% overlap common) to maintain context bridges
- Max chunk size: depends on embedding model's token limit
  - OpenAI text-embedding-3: 8191 tokens max
  - Cohere v3: 512 tokens max
  - Mistral: 8000 tokens max

---

## Provider Comparison Matrix

| Feature | OpenAI | Cohere | Mistral | Azure OpenAI |
|---------|--------|--------|---------|--------------|
| Dimension Options | 3072/1536 (customizable with -3) | 1024/384 (fixed) | 1024 (fixed) | 3072/1536 (customizable with -3) |
| Max Token Input | 8191 | 512-2048 | 8000 | 8191 |
| Input Type Options | No | Yes (4 types) | No | No |
| Truncation Control | No | Yes (3 modes) | No | No |
| Custom User ID | Yes | No | No | Yes |
| Supports Batch API | No (yet) | No | No | No |

---

## Version: 5.0+ (Latest as of 2025)

### Recent Changes
- AI SDK 5.0+ provides unified embedding interface across all providers
- embedMany automatically handles batch chunking (no manual batching needed)
- Experimental telemetry support for observability
- cosineSimilarity function is the standard utility for vector comparison

### Deprecations
- No major embedding deprecations in 5.0
- text-embedding-ada-002 still supported but text-embedding-3 recommended
- Legacy Cohere v2.0 models still available but v3.0 recommended

---

## Quick Decision Tree

**Which embedding model to use?**
- Need highest quality + customizable dims → text-embedding-3-large (OpenAI)
- Budget-conscious + still high quality → text-embedding-3-small (OpenAI)
- Need input type context awareness → embed-english-v3.0 (Cohere)
- Fast/lightweight option → text-embedding-3-small or embed-english-light-v3.0

**When to use embedMany vs embed?**
- Single embedding → embed() (simpler)
- 2+ embeddings → embedMany() (automatic batching, parallel, better performance)
- Batch > 1000 items → embedMany() (automatically chunks safely)

**What similarity threshold?**
- Strict relevance (few false positives) → > 0.7
- Balanced (typical RAG) → > 0.5
- Lenient (more context) → > 0.3
- Always test threshold with your specific domain data
