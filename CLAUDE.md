# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a CLI tool for interacting with the Replicate API, built using the oclif framework. It allows users to list models, create predictions, and manage prediction history from the terminal.

## Build/Development/Testing

**Build:**
```bash
npm run build
```
This compiles TypeScript from `src/` to `lib/` directory.

**Local Development:**
```bash
npm link
```
After building, this makes the `replicate` command available globally for testing.

**Configuration:**
The CLI requires a `.env.local` file in the project root containing:
```
REPLICATE_API_TOKEN=your_api_token_here
```

## High-Level Architecture

### oclif Framework Structure

This CLI is built on oclif, which uses a convention-based command structure:
- Commands are defined in `src/commands/` with directory structure matching command syntax
- `models:list` maps to `src/commands/models/list.ts`
- `predictions:create` maps to `src/commands/predictions/create.ts`
- The oclif config in `package.json` defines `topicSeparator: ":"` for command namespacing

### Core Components

**BaseCommand** (`src/utils/command-base.ts`)
- Abstract base class for all commands
- Provides `getClient()` method that returns a configured Replicate client
- All command classes extend this base

**Replicate Client Singleton** (`src/utils/replicate-client.ts`)
- Manages single Replicate API client instance
- Loads API token from `.env.local` (falls back to `.env`)
- Throws error if `REPLICATE_API_TOKEN` is not found
- Client is initialized lazily on first access

**Dynamic Argument Parsing** (`src/utils/argument-parser.ts`)
- Handles two input methods:
  1. JSON file via `--input-file=path/to/file.json`
  2. Dynamic CLI arguments like `--prompt="text" --width=512`
- Inline arguments override values from input file
- Automatically coerces types: strings, numbers, booleans, null
- Validates input against model's OpenAPI schema

### Command Flow Pattern

All prediction creation follows this flow:

1. Parse model identifier (format: `owner/model-name`)
2. Fetch model and latest version from Replicate API
3. Extract OpenAPI schema for input validation
4. Parse user input (file + CLI args)
5. Validate input against schema (required fields, types, ranges)
6. Create prediction via Replicate API
7. Display result (formatted or JSON)

### Key Conventions

**Command Structure:**
- Each command file exports a default class extending `BaseCommand`
- Static properties define args, flags, and description
- `strict = false` on `predictions:create` allows dynamic model-specific flags
- Commands use oclif's `Args` and `Flags` for type-safe parameter definitions

**Error Handling:**
- Use `this.error()` to display user-friendly error messages and exit
- API token errors occur at client initialization
- Validation errors are collected and displayed before API calls

**Type Inference:**
- Argument parser tries JSON.parse first
- Falls back to primitive type detection (true/false → boolean, numeric strings → number)
- Strings remain strings unless explicitly parseable

## Critical Context

**Dynamic Arguments:** The `predictions:create` command uses `strict = false` to accept arbitrary `--key=value` flags. These become input parameters for the model. The parser validates them against the model's OpenAPI schema fetched at runtime.

**Singleton Client:** The Replicate client is a module-level singleton. Token loading happens once on first `getReplicateClient()` call. If token is missing, the error occurs at command execution, not at import time.

**Schema Validation:** Input validation compares user input against `schema.components.schemas.Input` from the model version's OpenAPI schema. Required fields, types, min/max values are enforced. Unknown fields trigger warnings but don't block execution.
