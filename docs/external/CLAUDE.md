# CLAUDE.md

## Purpose

This directory contains LLM-optimized reference documentation for external libraries and SDKs used by the Replicate CLI project. These files are automatically generated and maintained by the `library-docs-writer` agent for efficient AI consumption.

## Content

**External Library Documentation:**
- Replicate API (`replicate-*.md`): Core API, Node.js SDK, predictions, streaming, training
- Supabase (`supabase-*.md`): Auth, database, edge functions, realtime, RLS, storage
- Vercel AI SDK (`vercel-ai-sdk-*.md`): Core, embeddings, providers, UI components, tools, RSC, prompts
- Miscellaneous (`VERCEL-AI-SDK-UI-*.md`): Additional UI reference materials

## Conventions

**File Generation:**
- Files are generated asynchronously via `library-docs-writer` agent
- Named with `{library}-{feature}-llm-ref.md` or `{library}-{feature}.md` pattern
- Focus on non-obvious information: signatures, constraints, gotchas, integration patterns
- Not comprehensive API docs—summaries optimized for LLM context usage

**Usage:**
- Reference these files when implementing features that interact with external libraries
- Use in agent investigation/implementation tasks via `@docs/external/{filename}.md`
- Do not manually edit—regenerate via library-docs-writer agent if outdated

**Updates:**
- Regenerate when library versions change
- Triggered by `library-docs-writer` agent with updated library versions
- Can parallelize research across multiple libraries

## Note

This directory is NOT part of active development—it's a supporting reference resource for implementation tasks. Do not commit changes to individual files unless regenerating all documentation.
