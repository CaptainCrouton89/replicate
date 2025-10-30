# Vercel AI SDK UI - Advanced Patterns & Gotchas

## Critical Gotchas That Break Code

### 1. Body Parameter Staleness (MOST COMMON BUG)

**THE BUG:**
```typescript
const [temperature, setTemperature] = useState(0.7);

// WRONG - temperature is captured at init, won't update
const { sendMessage } = useChat({
  body: { temperature }
});

// Later, user changes temperature to 0.9
// But sendMessage still sends 0.7
```

**THE FIX:**
```typescript
const [temperature, setTemperature] = useState(0.7);

const { sendMessage } = useChat();

// Pass temperature at request time
await sendMessage(
  { text: input },
  { body: { temperature } } // Captured when sendMessage is called
);
```

**WHY:** Hook configuration is captured once at initialization. Request-level options are evaluated on each call. V5 explicitly removed auto-tracking for this reason.

---

### 2. Parts Array Structure (MANDATORY IN V5)

**THE BUG:**
```typescript
// V4 code (BREAKS in V5)
const messages = useChat();
messages.messages[0].content // UNDEFINED - no .content property!
```

**THE FIX:**
```typescript
// V5 code
const { messages } = useChat();
const firstMessage = messages[0];

// Access parts array instead
firstMessage.parts.forEach(part => {
  if (part.type === 'text') {
    console.log(part.text);
  }
});

// Render helper:
function renderMessage(message: UIMessage) {
  return message.parts.map(part => {
    switch (part.type) {
      case 'text': return <div>{part.text}</div>;
      case 'image': return <img src={part.data} />;
      case 'tool-getWeather': return <WeatherTool args={part.args} />;
      case 'tool-result-getWeather': return <WeatherResult result={part.result} />;
      default: return null;
    }
  });
}
```

**WHY:** V5 uses parts-based architecture for multi-modal content. Messages aren't just text anymore.

---

### 3. Tool Call Type Narrowing Requirement

**THE BUG:**
```typescript
useChat({
  onToolCall: (toolCall) => {
    // TypeScript error: toolCall.toolName might not exist
    if (toolCall.toolName === 'getWeather') {
      // This type narrowing is unsafe
    }
  }
})
```

**THE FIX:**
```typescript
useChat({
  onToolCall: (toolCall) => {
    // ALWAYS check dynamic first for proper type narrowing
    if (toolCall.dynamic) {
      // Now toolCall.toolName is type-safe
      if (toolCall.toolName === 'getWeather') {
        return handleWeather(toolCall.args);
      }
    }
  }
})
```

**WHY:** `dynamic` distinguishes between known and unknown tool names at compile time. Skipping it causes unsafe type access.

---

### 4. Transient Data Isn't in message.parts

**THE BUG:**
```typescript
const { messages, onData } = useChat();

// Server sends transient progress data
onData = (data) => {
  // This data is NOT in messages[messages.length-1].parts!
  console.log(data); // Works in onData
}

// Later, accessing from messages:
console.log(messages[messages.length-1].parts); // Progress data is MISSING
```

**THE FIX:**
```typescript
const [transientData, setTransientData] = useState(null);
const { messages, onData } = useChat();

onData = (data) => {
  // Transient data: only available through callback
  setTransientData(data);
}

// Persistent data: in message.parts
messages[messages.length-1].parts.forEach(part => {
  if (part.type === 'data') {
    console.log(part.data); // Only persistent data parts here
  }
})
```

**WHY:** Two separate data streams. Persistent = message history. Transient = real-time only.

---

### 5. Message IDs Required for Persistence

**THE BUG:**
```typescript
// Storing messages without IDs
const storedMessages = messages; // No IDs assigned
await db.messages.insertMany(storedMessages);

// Later, loading:
const loaded = await db.messages.find();
setMessages(loaded); // Some messages might have conflicting/missing IDs
```

**THE FIX:**
```typescript
// Server-side: Assign IDs before writing to stream
const writer = createUIMessageStream();

for (const message of messages) {
  if (!message.id) {
    message.id = generateId(); // Must be unique and server-generated
  }
  await writer.write({
    type: 'message',
    id: message.id,
    role: message.role,
    parts: message.parts,
  });
}

// Or use automatic ID generation:
toUIMessageStreamResponse(stream, {
  generateId: () => `msg-${crypto.randomUUID()}`
})
```

**WHY:** UIMessage.id is required (not optional) for proper state reconciliation and deduplication across sessions.

---

### 6. Input State Management Moved to Developer

**THE BUG:**
```typescript
// V4: hooks managed input
const { input } = useChat();
// Automatically synced with form

// V5: BREAKS - no automatic syncing
const { input } = useChat();
<input value={input} onChange={...} /> // Manual onChange required
```

**THE FIX:**
```typescript
const { input, handleInputChange, handleSubmit, sendMessage } = useChat();

<form onSubmit={handleSubmit}>
  <input
    value={input}
    onChange={handleInputChange} // Use provided handler
  />
</form>

// Or manual control:
const [manualInput, setManualInput] = useState('');

const sendManually = async () => {
  await sendMessage({ text: manualInput });
  setManualInput('');
};
```

**WHY:** V5 separates concerns. Hooks manage communication, you manage form state.

---

### 7. onResponse Callback Removed

**THE BUG:**
```typescript
// V4 code (BREAKS in V5)
useChat({
  onResponse: (response) => {
    // This callback no longer exists!
  }
})
```

**THE FIX:**
```typescript
// V5: Use onFinish and onData instead
useChat({
  onFinish: (message, options) => {
    // Called when message streaming completes
    console.log('Message done:', message);
    console.log('Usage:', options.usage);
  },
  onData: (data: UIMessageChunk) => {
    // Called for each data part during streaming
    console.log('Data chunk:', data);
  }
})
```

**WHY:** Callback architecture refactored for clarity. Separate lifecycle events rather than generic response.

---

### 8. convertToModelMessages with Data Parts

**THE BUG:**
```typescript
const modelMessages = convertToModelMessages(uiMessages);
// Custom data parts are included as-is
// But model can't handle custom DataUIPart objects!
```

**THE FIX:**
```typescript
const modelMessages = convertToModelMessages(uiMessages, {
  convertDataPart: (part) => {
    // MUST convert custom data to text or file parts
    if (part.type === 'data') {
      if (part.data.mimeType === 'application/json') {
        // Convert JSON data to text
        return {
          type: 'text',
          text: `Context: ${JSON.stringify(part.data)}`
        };
      }
    }
    // Return undefined to filter out unconvertible parts
    return undefined;
  }
});
```

**WHY:** Models only understand text, images, files. Custom data parts must be converted or filtered.

---

### 9. Tool Definition Structure Changed

**THE BUG:**
```typescript
// V4 tools (BREAKS in V5)
const tools = {
  getWeather: {
    parameters: z.object({ city: z.string() })
  }
}

// V5 expects:
const tools = {
  getWeather: {
    parameters: z.object({ city: z.string() }) // STILL parameters, not inputSchema
    // But in v5 server tools use inputSchema
  }
}
```

**THE FIX:**
```typescript
// Shared tool definitions (v5)
const tools = {
  getWeather: {
    description: 'Get weather for a city',
    parameters: z.object({
      city: z.string().describe('City name')
    })
  }
};

type ToolName = keyof typeof tools;
type ToolSet = typeof tools;

// Use with useChat
useChat({ /* ... */ });

// Use with server streamText
streamText({
  model,
  tools: tools,
  // ...
})
```

**WHY:** Client and server tools share schema. Parameter names align for client-side execution.

---

### 10. Throttle Can Hide Streaming Start

**THE BUG:**
```typescript
useChat({
  experimental_throttle: 500 // 500ms batch delay
})

// User sees nothing for 500ms while first tokens arrive
// Poor perceived performance (jank)
```

**THE FIX:**
```typescript
// Use smaller throttle or no throttle for time-to-first-byte
useChat({
  experimental_throttle: 30 // 30ms batches reasonable
})

// Or selective throttling:
const [throttle, setThrottle] = useState(0); // No throttle initially

useChat({
  experimental_throttle: throttle
});

// Enable throttle after first token
onFinish: () => {
  setThrottle(30); // Batch subsequent updates
}
```

**WHY:** Throttle reduces re-renders but delays visual feedback. Balance: minimal throttle early, more later.

---

## Advanced Patterns

### Pattern 1: Type-Safe Tool Responses with InferUITool

```typescript
import { InferUITool } from 'ai/ui-utils';

const tools = {
  getWeather: {
    description: 'Get weather',
    parameters: z.object({ city: z.string() }),
    execute: async (args) => ({
      temperature: 72,
      condition: 'sunny'
    })
  }
} as const;

type Tools = typeof tools;
type WeatherToolResult = InferUITool<Tools, 'getWeather'>;
// Type: { temperature: number; condition: string }

const { onToolCall } = useChat();

onToolCall = async (toolCall) => {
  if (toolCall.dynamic && toolCall.toolName === 'getWeather') {
    const result: WeatherToolResult = {
      temperature: 72,
      condition: 'sunny'
    };
    return result; // Type-safe!
  }
};
```

---

### Pattern 2: Custom Fetch with Auth Headers

```typescript
const authToken = useAuthToken();
const sessionId = useSessionId();

useChat({
  headers: () => ({
    // Return function to access current values
    'Authorization': `Bearer ${authToken}`,
    'X-Session-ID': sessionId
  }),
  credentials: 'include' // Include cookies for same-origin
})
```

---

### Pattern 3: Message Persistence with Validation

```typescript
const [messages, setMessages] = useState<UIMessage[]>([]);

useEffect(() => {
  const loadMessages = async () => {
    const stored = await api.getMessages(chatId);

    try {
      // Validate before using
      const validated = await validateUIMessages(stored);
      setMessages(validated);
    } catch (error) {
      if (error instanceof TypeValidationError) {
        console.error('Schema mismatch:', error.details);
        // Migrate or filter messages
        const filtered = stored.filter(msg =>
          msg.parts?.every(p => typeof p === 'object' && 'type' in p)
        );
        setMessages(filtered);
      }
    }
  };

  loadMessages();
}, [chatId]);

const { messages: chatMessages } = useChat({ initialMessages: messages });
```

---

### Pattern 4: Progressive Artifact Updates with Data Parts

```typescript
// Server: Stream updates to same artifact
const writer = createUIMessageStream();

await writer.write({
  type: 'data',
  id: 'artifact-1',
  data: { code: '// starting...', language: 'typescript' }
});

// Stream updates with same ID = update existing part
for (const chunk of codeGenerator) {
  await writer.write({
    type: 'data',
    id: 'artifact-1', // SAME ID
    data: { code: chunk, language: 'typescript' }
  });
}

// Client: No need to handle updates, part auto-updates
const lastMessage = messages[messages.length - 1];
const artifact = lastMessage.parts.find(p =>
  p.type === 'data' && p.id === 'artifact-1'
);
console.log(artifact?.data?.code); // Latest version
```

---

### Pattern 5: Conditional Tool Execution

```typescript
const { messages, onToolCall } = useChat({
  sendAutomaticallyWhen: 'lastAssistantMessageIsCompleteWithToolCalls'
});

const [confirmToolCall, setConfirmToolCall] = useState<ToolCall | null>(null);

onToolCall = async (toolCall) => {
  if (toolCall.dynamic) {
    switch (toolCall.toolName) {
      case 'deleteFile':
        // Dangerous: require confirmation
        setConfirmToolCall(toolCall);
        return; // Don't auto-execute

      case 'getWeather':
        // Safe: auto-execute
        return await getWeather(toolCall.args);
    }
  }
};

// User confirms dangerous action
const handleConfirm = async () => {
  if (confirmToolCall?.dynamic && confirmToolCall.toolName === 'deleteFile') {
    const result = await deleteFile(confirmToolCall.args);
    // Manually add result to messages
    appendToolResult(confirmToolCall.toolCallId, result);
    setConfirmToolCall(null);
  }
};
```

---

### Pattern 6: Message Pruning for Long Conversations

```typescript
const { messages } = useChat();

const handleSendMessage = async (text: string) => {
  // Before sending, prune expensive messages
  const modelMessages = convertToModelMessages(messages);

  const pruned = pruneMessages({
    messages: modelMessages,
    reasoning: 'before-last-message', // Keep last reasoning
    toolCalls: 'before-last-2-messages', // Keep recent tool calls
    emptyMessages: 'remove'
  });

  // Send pruned version to API
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages: pruned,
      newMessage: text
    })
  });
};
```

---

## Common Misunderstandings

### "I can update body dynamically" ❌

Body is captured at hook init. Use request-level options or useRef for current values.

### "message.content works in v5" ❌

Use `message.parts` array instead. Map parts by type for rendering.

### "onData gives me persistent data" ❌

onData is for transient updates only. Persistent data is in message.parts.

### "Tool calls auto-add to history" ✓

Correct for client-side tool execution. Server tools require explicit result submission.

### "I can use any tool name" ❌

Tool names must be in your tools object definition for type safety. Unknown tools cause runtime errors.

### "pruneMessages always reduces tokens" ❌

Depends on config. `reasoning: 'none'` and `toolCalls: 'none'` might prune nothing.

---

## Version Compatibility Matrix

| Feature | V4 | V5 | V6 Beta |
|---------|----|----|---------|
| useChat | ✓ | ✓ | ✓ |
| .content string | ✓ | ✗ | ✗ |
| .parts array | ✗ | ✓ | ✓ |
| body staleness | Tracked | Static | Static |
| onResponse | ✓ | ✗ | ✗ |
| onData | ✗ | ✓ | ✓ |
| Tool parameters | ✓ | ✓ | ✓ |
| useObject | Experimental | Experimental | ✓ |
| Message IDs required | ✗ | ✓ | ✓ |

