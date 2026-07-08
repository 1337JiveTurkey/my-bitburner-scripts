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

While `npm run watch` is running, edits under `src/` reach the running game within seconds — there is no separate deploy step. `dist/` is generated output; never edit it directly.

No test or lint scripts are configured in package.json. ESLint config exists but has no custom rules.

### Verifying Logic Locally

Pure functions that never call `ns` methods (contract solvers, batch math) compile to plain ES modules in `dist/`. To test one outside the game, copy `dist/lib/<module>.js` to a `.mjs` file and drive it with `node`. Imports from `@ns` are type-only and erased at compile time, so no game runtime is needed. Keep testable logic free of `ns` calls where practical (see `lib/solvers.ts`).

## Architecture

### Source Structure
- **`src/`** - TypeScript source, compiles to `dist/`
- **`src/workers/`** - Worker executables (hack.ts, grow.ts, weaken.ts, charge.ts, share.ts)
- **`src/lib/`** - Core library modules
- **`src/srv/`** - State services (server-state, budget-state, target-state, etc.)
- **`src/config/`** - Configuration files including services.json

### Key Systems

**Worker Pool (`lib/worker.ts`)**: Manages distributed task execution across servers. Worker class handles individual server resources, WorkerPool coordinates distribution.

**Batch Processing (`lib/batch-calculator.ts`, `lib/batch-executor.ts`)**: HGW (Hack-Grow-Weaken) batch optimization with timing calculations, thread management, and RAM optimization. This is a deliberate **shotgun batcher**: every script in a wave self-times to one shared absolute deadline and lands simultaneously. Waves can reach tens of thousands of batches, so **never introduce per-batch landing offsets or staggered deadlines** — any per-batch spacing multiplies into minutes of dead tail and has already been tried and reverted. Disorder within a wave is absorbed by the calculator's `growPadding`/`weakenPadding` (set via test-new-batcher's `--grow-padding`/`--weaken-padding` flags), not by ordering guarantees.

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

## Game Behavior

**Never hard-code game constants.** BitNode multipliers scale core mechanics — in the current save, weaken removes ~0.0336 security per thread, not the base 0.05. Measure at runtime instead: `ns.weakenAnalyze(1)`, `ns.hackAnalyzeSecurity(threads)`, `ns.growthAnalyzeSecurity(threads)`.

**Validate mechanics against the game source, not from memory.** The authoritative reference is https://github.com/bitburner-official/bitburner-src — e.g., coding contract generators and answer checkers live in `src/CodingContract/contracts/`. Contract inputs are often generated adversarially (deliberate edge cases), so check the generator before trusting a solver.

**`ns.enums.*` objects map TypeScript-side keys to the string values the API expects**, and the two often differ (`CrimeType.shoplift` → `"Shoplift"`, `GymType.strength` → `"str"`). Iterate with `Object.values(...)`, never `Object.entries`/`Object.keys`, and don't `as`-cast a string past the type error — the cast hides exactly this mismatch, which the game then rejects at runtime. Enum types like `CrimeType` are already the value union, so correctly-obtained values need no cast.

## Game Connection

Configure Bitburner's Remote API settings to connect to port 12525. The `filesync.json` handles sync configuration.
