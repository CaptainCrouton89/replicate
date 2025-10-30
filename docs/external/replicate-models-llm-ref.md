# Replicate Popular Models - LLM Reference

Critical non-obvious information for consuming Replicate's most popular model APIs. Focus on signatures, constraints, and gotchas that cause mistakes.

---

## Image Generation Models

### Stable Diffusion (stability-ai/stable-diffusion)

```python
# CRITICAL: Width × Height MUST be <= 786,432 pixels (max ~1024×768)
# CRITICAL: Both dimensions MUST be multiples of 64
# CRITICAL: Best quality at 512×512 (SD 1.5) or 1024×1024 (SDXL)

create_prediction({
  "prompt": str,                # Required, 60-75 words optimal (~75 tokens max)
  "negative_prompt": str,        # Optional, unwanted elements
  "width": int,                  # 64-1024, multiple of 64, default 768
  "height": int,                 # 64-1024, multiple of 64, default 768
  "num_outputs": int,            # 1-4, default 1 (SDXL: batch limit 4)
  "num_inference_steps": int,    # 1-500, default 50 (effective max: ~50, diminishing returns)
  "guidance_scale": float,       # 1-20, default 7.5 (start 7-7.5)
  "scheduler": str,              # DDIM | K_EULER | DPMSolverMultistep | K_EULER_ANCESTRAL | PNDM | KLMS
  "seed": int,                   # Optional, affects reproducibility
})
```

**Non-obvious constraints:**
- Prompt strength (img2img): 0.5-0.75 optimal, 1.0 ignores input image
- Changing dimensions with same seed = inconsistent results (seed requires fixed resolution)
- Guidance scale 0 = maximum creativity, 20 = maximum prompt adherence
- LCM LoRAs: lower quality but very fast (1-8 steps)
- Turbo models: 1 step only, use guidance_scale 0 or 1-2

**Model-specific params:**
- Vanilla SDXL: starts at ~20 steps, 1024×1024 optimal
- SDXL Turbo: exactly 1 step, guidance_scale disabled
- Stable Diffusion 3: 26-36 steps optimal, resolution divisible by 64

---

### FLUX.1 [dev] (black-forest-labs/flux-dev)

```python
# CRITICAL: Only supports specific aspect ratios
# CRITICAL: go_fast=true performs optimizations but still valid

create_prediction({
  "prompt": str,                 # Required
  "seed": int,                   # Optional, enables reproducible generation
  "image": str,                  # Optional URI, activates img2img, aspect ratio auto-matches input
  "go_fast": bool,               # true (default), runs with optimizations
  "guidance": float,             # 0-10, default 3.5 (lower = more realistic)
  "num_outputs": int,            # 1-4, default 1
  "megapixels": str,             # "1" (default) or "0.25"
  "aspect_ratio": str,           # 1:1 | 16:9 | 21:9 | 3:2 | 2:3 | 4:5 | 5:4 | 3:4 | 4:3 | 9:16 | 9:21
  "output_format": str,          # webp | jpg | png (default webp)
  "output_quality": int,         # 0-100, default 80 (ignored for png)
  "prompt_strength": float,      # 0-1, default 0.8 (img2img only, 1.0 = full destruction)
  "num_inference_steps": int,    # 1-50, default 28 (recommended 28-50)
  "disable_safety_checker": bool # default false
})
```

**Non-obvious behaviors:**
- Guidance 3.5 or lower → photorealistic images
- Guidance 3.5-6 → drawings/paintings
- megapixels "1" = 1 megapixel (varies by aspect), "0.25" = quarter resolution
- img2img: image aspect ratio auto-matches output, prompt_strength 1.0 ignores reference entirely
- go_fast=true uses valid optimizations (not a quality compromise on this model)

**Best practices:**
- Guidance 2.5-3 for photorealism
- 28-50 steps, diminishing returns beyond
- Lower guidance = more creative, higher = more prompt-adherent
- Aspect ratio mismatch with img2img input wastes computation

---

## Language Models

### Meta Llama 3.1 405B Instruct (meta/meta-llama-3.1-405b-instruct)

```python
create_prediction({
  "prompt": str,                 # Required, text input
  "max_tokens": int,             # default 512 (output length limit)
  "min_tokens": int,             # default 0
  "temperature": float,          # default 0.6 (0-2 typical range)
  "top_k": int,                  # default 50, filters highest probability tokens (>0 applies)
  "top_p": float,                # default 0.9, nucleus filtering threshold (<1.0 applies)
  "system_prompt": str,          # default "You are a helpful assistant."
  "stop_sequences": str,         # comma-separated list to halt generation
  "prompt_template": str,        # custom formatting template
  "presence_penalty": float,     # default 0, penalizes token repetition
  "frequency_penalty": float,    # default 0, reduces frequent token usage
})
```

**Critical specs:**
- Context window: 8,000 tokens
- Parameters: 405 billion
- Training cutoff: December 2023
- Multilingual: English, German, French, Italian, Portuguese, Hindi, Spanish, Thai
- Best for: Dialogue, instruction-following, multilingual tasks

**Non-obvious constraints:**
- top_k > 0 filters to only top k tokens (default 50)
- top_p < 1.0 applies nucleus sampling (default 0.9 enables)
- stop_sequences must be comma-separated (critical for parsing)
- temperature 0 = deterministic, 1.0+ = more random

---

### Mistral 7B v0.1 (mistralai/mistral-7b-v0.1)

```python
create_prediction({
  "prompt": str,                 # Required, text input
  "max_tokens": int,             # default 512, min 1 (word = 2-3 tokens)
  "min_tokens": int,             # default -1 (disable with -1)
  "temperature": float,          # 0-5, default 0.7 (>1 = random, 0 = deterministic)
  "top_p": float,                # 0-1, default 0.95 (nucleus sampling threshold)
  "top_k": int,                  # default 0, min -1
  "stop_sequences": str,         # comma-separated halt sequences
  "length_penalty": float,       # 0-5, default 1 (<1 shorter, >1 longer)
  "presence_penalty": float,     # default 0, penalizes repeated tokens
  "seed": int,                   # Optional, randomizes if blank
  "prompt_template": str,        # default "{prompt}", MUST contain {prompt}
  "log_performance_metrics": bool # default false
})
```

**Critical specs:**
- Parameters: 7 billion
- Best for: Fast inference, low latency, lightweight deployments
- Word encoding: ~2-3 tokens per word (critical for max_tokens calculation)

**Non-obvious behaviors:**
- length_penalty < 1 = shorter outputs, > 1 = longer outputs
- top_k = 0 (default) = sampling disabled, only nucleus sampling (top_p) applies
- prompt_template MUST contain literal "{prompt}" placeholder
- min_tokens = -1 disables minimum length constraint
- temperature > 1 increasingly random, 0 = deterministic repetition

---

## Speech & Audio Models

### Whisper (openai/whisper)

```python
create_prediction({
  "audio": str,                  # Required, valid file/data URL
  "language": str,               # default "auto", 90+ ISO 639-1 codes or full names
  "transcription": str,          # default "plain text" (options: plain text | srt | vtt)
  "translate": bool,             # default false, translates to English if enabled
  "temperature": float,          # default 0
  "patience": float,             # Optional, beam decoding patience per arXiv:2204.05424
  "suppress_tokens": str,        # default "-1", comma-separated token IDs ("-1" = suppress special chars except punctuation)
  "initial_prompt": str,         # Optional, text for first processing window
  "condition_on_previous_text": bool, # default true, uses previous output as prompt for next window
  "temperature_increment_on_fallback": float, # default 0.2, increases on decode failure
  "compression_ratio_threshold": float, # default 2.4, gzip ratio failure threshold
  "logprob_threshold": float,    # default -1, average log probability failure threshold
  "no_speech_threshold": float,  # default 0.6, silence detection probability threshold
})
```

**Critical specs:**
- Processes audio in 30-second sliding windows
- Supports 90+ languages with auto-detection
- Multilingual: recognizes and transcribes any language
- Translation: outputs English regardless of input language
- Supports multiple output formats: plain text, SRT (subtitles), VTT

**Non-obvious behaviors:**
- suppress_tokens "-1" (default) = suppress special chars but keep punctuation
- condition_on_previous_text = true (default) = context bleeds across windows (hallucination risk)
- Whisper can hallucinate non-spoken text, especially with condition_on_previous_text=true
- Beam search only when temperature=0
- Turbo model: no translation support, use tiny/base/small/medium/large for translation

**Best practices:**
- Set condition_on_previous_text=false if hallucination occurs
- Use initial_prompt for domain-specific terms (medical, legal)
- temperature_increment_on_fallback prevents hard failures
- Task "translate" outputs English; task "transcribe" outputs source language

---

## Video Generation Models

### Google Veo 3 (google/veo-3)

```python
create_prediction({
  "prompt": str,                 # Required, detailed text description
  "duration_seconds": int,       # 4 | 6 | 8 (default 8)
  "aspect_ratio": str,           # 16:9 (horizontal) or 9:16 (vertical), only these supported
  "negative_prompt": str,        # Optional, prevent unwanted content
  "seed": int,                   # Optional, numeric value for reproducibility
  "resolution": str,             # 720p | 1080p (default 1080p for Veo 3)
  "sample_count": int,           # 1-4, number of videos to generate
  "generate_audio": bool,        # true/false, enable/disable native audio generation
})
```

**Critical constraints:**
- Only native aspect ratios: 16:9 (1280×720) or 9:16 (720×1280)
- Duration: exactly 4, 6, or 8 seconds
- Default resolution: 1280×720 at 24fps
- Output: video WITH audio (voices, effects, music auto-generated)

**Non-obvious behaviors:**
- Veo 3 includes audio generation by default (voices, SFX, music from prompt)
- Only 16:9 and 9:16 natively supported (no 1:1, 4:3, etc.)
- 8 seconds = maximum duration
- Aspect ratio mismatch will error (no auto-scaling)
- generate_audio=false disables audio synthesis (uncommon)

**Best practices:**
- Describe voices, sound effects, music in prompt for control
- 8-second max suitable for short clips, trailers, demos
- 9:16 vertical for social media (TikTok, Reels)
- Reference images/first frame control via separate params (check schema)

---

## Critical API Behaviors & Gotchas

### Async vs Sync Mode

- **Default: ASYNC** - Returns immediately with prediction ID, poll for status
- **Sync mode**: Blocks until complete, best for <10 second models only
- **Streams**: Available for LLMs (streaming output as tokens arrive)
- Streaming is per-model; not all support it (check model schema)

### Webhooks & Polling

```python
# Rate limits
# POST /predictions: 600 req/min
# All other endpoints: 3000 req/min

# Webhook retry behavior:
# - "output" and "logs" events: throttled, max 1 per 500ms
# - "start" and "completed": always sent, no throttle
# - Network errors = automatic retries (design for idempotency)
# - Replicate doesn't follow redirects (use direct URLs only)
```

**Critical webhook constraints:**
- No redirect following (endpoint must resolve directly)
- Retry-safe design required (multiple calls possible)
- Throttled events (output/logs) batch up to 500ms intervals
- Completed events = guaranteed delivery

### Model Schemas

Every model has OpenAPI schema in `openapi_schema` property:
- Parameter names, types, constraints
- Enum values (allowed options)
- Min/max numeric values
- Default values
- Required vs optional
- Access via `/api` endpoint or `openapi_schema` property

### Prediction Status States

```
"starting" → "processing" → ("succeeded" | "failed" | "canceled")
```

- Intermediate states: only "starting" and "processing" before terminal
- Poll `/predictions/{id}` for status updates
- Only final state guarantees complete output

---

## Version: Replicate API 2025-01-29

Last updated: 2025-10-29

### Official Model Status

Models marked "Official" on Replicate:
- Always online (no cold starts)
- Predictable pricing
- High reliability
- Maintained by model authors

### Popular Models Overview

**Top Language Models:**
- google/gemini-2.5-flash (18.5K runs) - Fast, cost-efficient
- anthropic/claude-4.5-sonnet (27.5K runs) - Best coding model
- openai/gpt-5 (437.5K runs) - General reasoning, writing
- meta/meta-llama-3.1-405b-instruct - Flagship open-weight
- mistralai/mistral-7b-v0.1 - Lightweight, fast

**Top Image Models:**
- stability-ai/stable-diffusion (150M+ runs) - Most-used, reliable
- black-forest-labs/flux-dev - Latest SOTA quality
- google/imagen-4 - Competitive alternative

**Top Video Models:**
- google/veo-3 - Text-to-video with audio
- black-forest-labs/flux-schnell - Fast image gen

**Audio Models:**
- openai/whisper (multilingual speech-to-text)
- minimax/speech-02-turbo (low-latency TTS)
- minimax/speech-02-hd (high-quality TTS)
