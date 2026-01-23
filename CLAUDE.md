# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bitburner TypeScript template for synchronizing scripts to the game via Remote File API. Write TypeScript in `/src/`, it compiles to `/dist/`, and syncs to the game on port 12525.

## Commands

```bash
npm run watch          # Start all watchers (transpile + local + remote sync)
npm run watch:transpile  # TypeScript compiler only
npm run watch:remote     # Remote file sync only (bitburner-filesync)
```

No test or lint scripts are configured in package.json. ESLint config exists but has no custom rules.

## Architecture

### Source Structure
- **`src/`** - TypeScript source, compiles to `dist/`
- **`src/workers/`** - Worker executables (hack.ts, grow.ts, weaken.ts, charge.ts, share.ts)
- **`src/lib/`** - Core library modules
- **`src/srv/`** - State services (server-state, budget-state, target-state, etc.)
- **`src/config/`** - Configuration files including services.json

### Key Systems

**Worker Pool (`lib/worker.ts`)**: Manages distributed task execution across servers. Worker class handles individual server resources, WorkerPool coordinates distribution.

**Batch Processing (`lib/batch-calculator.ts`, `lib/batch-executor.ts`)**: HGW (Hack-Grow-Weaken) batch optimization with timing calculations, thread management, and RAM optimization.

**State Services (`srv/`)**: Dependency-managed services tracking server, budget, target, bladeburner, gang, and hacknet state. Dependencies declared in `src/config/services.json`.

**Logging (`lib/logging.ts`)**: Configurable logging with levels (NONE, ERROR, WARN, INFO, FINE, FINER) and outputs (terminal, tail window, files, ports).

### Import Conventions

Absolute imports from src root, no leading slash, no file extension:
```typescript
import { NS } from "@ns"           // Game API types
import React from "@react"         // React types
import { someFn } from "lib/logging"  // Library imports
```

### TypeScript Configuration
- Target: ESNext
- Strict mode enabled
- Source root: `/src/`, output: `/dist/`
- Path aliases: `@ns` → NetscriptDefinitions.d.ts, `@react` → lib/react.ts

## Game Connection

Configure Bitburner's Remote API settings to connect to port 12525. The `filesync.json` handles sync configuration.
