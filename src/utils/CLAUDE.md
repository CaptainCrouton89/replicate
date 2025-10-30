# CLAUDE.md

Utility functions and core infrastructure for the Replicate CLI.

## Files Overview

**command-base.ts** - Abstract base class for all oclif commands
- Provides `getClient()` method returning configured Replicate client
- All commands extend this class

**replicate-client.ts** - Singleton Replicate API client
- Module-level singleton initialized lazily on first access
- Loads `REPLICATE_API_TOKEN` from `.env.local` or `.env`
- Throws error immediately if token missing (not caught silently)

**argument-parser.ts** - Input validation and type coercion
- Accepts JSON file (`--input-file`) + optional CLI overrides
- Validates against model's OpenAPI schema at runtime
- Type coercion: JSON parse → boolean/number detection → string fallback
- Unknown fields trigger warnings but don't block execution

**config-manager.ts** - Persistent configuration storage
- Stores token and API URL in `~/.replicate/config.json`
- Methods: `getConfig()`, `setConfig(key, value)`, `clearConfig()`

**prompt.ts** - Interactive terminal prompts
- Prompts for sensitive values (API token)
- Uses masked input for token entry
- Returns user responses for config setup

## Key Patterns

**Client Access**: Commands call `this.getClient()` from BaseCommand, not direct imports.

**Error Handling**: Validation errors collected before API calls. API errors thrown during execution use `this.error()` for user display.

**Type Safety**: Argument parser respects schema constraints (required fields, ranges, enums) from model version metadata.
