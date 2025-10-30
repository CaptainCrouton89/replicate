# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This is a CLI tool for interacting with the Replicate API, built using the oclif framework. It allows users to list models, create predictions, and manage prediction history from the terminal. Published as `@r-cli/replicate` on npm.

## Build/Development/Testing

**Build:**
```bash
npm run build
```
This compiles TypeScript from `src/` to `lib/` directory using `tsc` and `tsc-alias`.

**Local Development:**
```bash
npm link
```
After building, this makes the `replicate` command available globally for testing.

**Configuration:**
The CLI uses a hierarchical auth system:
1. **Config file** (primary): `~/.config/replicate/config`
2. **Environment variable**: `REPLICATE_API_TOKEN`
3. **dotenv file**: `.env.local` or `.env` in current directory

Token is stored automatically by `auth:login` and `config:set` commands.

## High-Level Architecture

### oclif Framework Structure

This CLI is built on oclif with a convention-based command structure:
- Commands are defined in `src/commands/` with directory structure matching command syntax
- `models:list` maps to `src/commands/models/list.ts`
- `auth:login` maps to `src/commands/auth/login.ts`
- The oclif config in `package.json` defines `topicSeparator: ":"` for command namespacing
- New commands auto-register in `oclif.manifest.json` on build

### Core Components

**BaseCommand** (`src/utils/command-base.ts`)
- Abstract base class for all commands
- Provides `getClient()` method that returns a configured Replicate client
- All command classes extend this base

**Replicate Client Singleton** (`src/utils/replicate-client.ts`)
- Manages single Replicate API client instance
- Lazily loads API token from config hierarchy (config file → env var → dotenv)
- Client initialization happens on first `getClient()` call
- Token is required for all commands except `auth:login` and `config:set`

**Config Management** (`src/utils/config.ts`)
- Handles read/write to `~/.config/replicate/config` (JSON format)
- Interactive `auth:login` prompts user and saves token to config
- `config:get` and `config:set` commands expose config operations
- Token is fetched via this layer before client initialization

**Dynamic Argument Parsing** (`src/utils/argument-parser.ts`)
- Handles two input methods:
  1. JSON file via `--input-file=path/to/file.json`
  2. Dynamic CLI arguments like `--prompt="text" --width=512`
- Inline arguments override values from input file
- Automatically coerces types: strings, numbers, booleans, null
- Validates input against model's OpenAPI schema

### Command Categories

**Authentication** (`src/commands/auth/`)
- `auth:login` - Interactive auth, saves token to config
- `auth:logout` - Removes stored token
- `auth:whoami` - Shows authenticated account info

**Configuration** (`src/commands/config/`)
- `config:get` - Display config values
- `config:set` - Update config (e.g., set token manually)

**Models** (`src/commands/models/`)
- `models:list` - List available models with search
- `models:show` - Display model details and input schema

**Predictions** (`src/commands/predictions/`)
- `predictions:create` - Create new prediction (supports `--wait` flag for blocking)
- `predictions:get` - Check prediction status
- `predictions:list` - View prediction history

### Command Flow Pattern

All prediction creation follows this flow:

1. Parse model identifier (format: `owner/model-name`)
2. Fetch model and latest version from Replicate API
3. Extract OpenAPI schema for input validation
4. Parse user input (file + CLI args)
5. Validate input against schema (required fields, types, ranges)
6. Create prediction via Replicate API
7. If `--wait` flag: poll until completion, return output
8. Display result (formatted or JSON via `--json`)

### Key Conventions

**Command Structure:**
- Each command file exports a default class extending `BaseCommand`
- Static properties define args, flags, and description
- `strict = false` on `predictions:create` allows dynamic model-specific flags
- Commands use oclif's `Args` and `Flags` for type-safe parameter definitions

**Error Handling:**
- Use `this.error()` to display user-friendly error messages and exit
- Token loading errors occur at command execution time
- Validation errors are collected and displayed before API calls

**Type Inference:**
- Argument parser tries JSON.parse first
- Falls back to primitive type detection (true/false → boolean, numeric strings → number)
- Strings remain strings unless explicitly parseable

## Critical Context

**Interactive Authentication:** The `auth:login` command prompts for API token and saves it to `~/.config/replicate/config`. This is the recommended auth method for end users.

**Dynamic Arguments:** The `predictions:create` command uses `strict = false` to accept arbitrary `--key=value` flags. These become input parameters for the model. The parser validates them against the model's OpenAPI schema fetched at runtime.

**Singleton Client:** The Replicate client is a module-level singleton. Token loading happens once on first `getClient()` call, checking config hierarchy.

**Wait for Completion:** The `predictions:create` command supports `--wait` flag to block until prediction completes and return final output.

**Schema Validation:** Input validation compares user input against `schema.components.schemas.Input` from the model version's OpenAPI schema. Required fields, types, min/max values are enforced. Unknown fields trigger warnings but don't block execution.

**Package Naming:** Published as scoped package `@r-cli/replicate` on npm. Command is invoked as `replicate` globally after `npm install -g @r-cli/replicate`.
