# Game Assumptions

Engine behaviors this codebase depends on. Each entry records the claim, the
evidence (bitburner-src location or in-game measurement, with date), and what
code relies on it. Verify against https://github.com/bitburner-official/bitburner-src
before relying on one of these in new code or "fixing" code that encodes one —
and re-verify after game updates. Measured entries came from the batcher's own
audit lines (see `lib/batch-executor.ts`), which can re-measure them any time.

## Processes and scheduling

**PIDs are monotonic and effectively never reused.** The counter wraps only at
`Number.MAX_SAFE_INTEGER` (~35,000 years at 8k pids/sec), and dead pids are not
re-issued before a wrap. Verified: `src/Netscript/Pid.ts`, 2026-07-11.
Depended on by: pid-keyed result ports (`Worker.exec` in `lib/worker.ts`, the
dodge RPC layer). Counter resets on game reload, but ports are in-memory and
reset too, so the pairing survives reloads.

**Ports are unauthenticated FIFO queues over an unbounded integer namespace.**
Anything can write to any port number; `readPort` pops the *oldest* entry, so
stale data shadows a fresh write; `nextPortWrite(n)` wakes on any write to n.
Depended on by: the worker result protocol — which is why `Worker.exec` only
accepts finite-number payload fields (one marginless-JSON payload was observed
on a worker's pid port at 200k-script scale, 2026-07-11; mechanism unresolved,
candidates: stale queue data, a stray writer). `clean-ports.js` exists because
queues accumulate garbage. `read`/`peek` on an empty port return the string
`"NULL PORT DATA"`.

**Ports hold at most `Settings.MaxPortCapacity` messages (default 50,
user-configurable in game options); `write` on a full port evicts the OLDEST
entry, `tryWrite` refuses instead.** Verified: `src/NetscriptPort.ts`,
2026-07-11. Consequence: funneling a wave's results through one shared port
cannot work — during a landing burst tens of thousands of `atExit` writes
occur before any reader script gets a turn (expired-timer starvation,
measured), so all but the newest ~50 results would be silently destroyed. The
pid-sharded one-message-per-port design in `Worker.exec` sidesteps the cap at
queue depth 1 and is the correct architecture, not merely a convention; the
200k live `nextPortWrite` listeners are the price of that correctness.

**Module-level state is shared and volatile.** The compiled-module cache is
keyed by transformed code content, so ONE module namespace object is shared by
every running script that imports the same file — across servers — and a new
instance replaces it whenever the content changes (every watch-mode transpile)
or the game reloads. A running script pins its instance for its own lifetime.
Verified: `src/NetscriptJSEvaluator.ts` (`moduleCache.get(newCode)`),
2026-07-11. Consequence: state that must belong to one script (counters,
caches, registries) lives in `main`'s call path, never at module level —
`LandingClock` in `lib/worker.ts` replaced a module-global counter for
exactly this reason.

**`ns.exec` is synchronous but `main()` starts on an async module-load promise
chain** (`src/NetscriptWorker.ts`, `startNetscript2Script`), so start order is
not contractually FIFO. Measured 2026-07-11: perfectly FIFO in practice at
198k scripts (0.00% adjacent inversions, 695ms spread). Design rule anyway:
rely on self-timing to a deadline, never on start order.

**Timers respect expiry order but not insertion order at high density.**
hack/grow/weaken resolve via `netscriptDelay` (setTimeout). Scripts with
distinct expiries land in expiry order even when the engine falls behind;
scripts sharing an expiry window get scrambled (measured 2026-07-11: median
2315-script displacement at 200k scripts despite perfect starts and positive
margins). This is the entire reason `launchSlack`, `hostSpacing`, and
`chunkSize`/`chunkSpacing` exist in `lib/batch-executor.ts`.

**`additionalMsec` must be ≥ 0.** A negative requirement means the deadline is
unreachable; workers clamp to 0 and report the shortfall as a negative margin,
which the deadline-slack audit aggregates.

## Hacking mechanics

**Grow fortifies by used cycles, not supplied threads** — the threads actually
needed for the money change, capped at supplied; a no-op grow fortifies zero.
Verified: `src/Server/ServerHelpers.ts`, `processSingleServerGrowth`,
2026-07-11. Consequence: the wave-stats "added" figure is an upper bound.

**`ns.weaken` returns the actual floored security delta** (not the potential
amount); `ns.grow` returns the money multiplier. Verified:
`src/NetscriptFunctions.ts`, 2026-07-11.

**Hack fortify applies only on success.** Confirmed empirically 2026-07-11:
the security ledger matched `secPerGrow × growThreads + secPerHack ×
successfulHackThreads` to three decimals.

**Security clamps to [minDifficulty, 100]** and the 100 cap silently absorbs
fortification — a wave that drives security to the cap loses the excess from
the books (and hack chance is 0 at the cap).

**Per-thread constants are BitNode-scaled** (base: hack fortify 0.002, grow
0.004, weaken 0.05). Never hard-code; measure at runtime with
`ns.weakenAnalyze(1)` etc. — see CLAUDE.md. A past save measured weaken at
~0.0336.

**Hack chance stays below 1 until level well exceeds the requirement**, even
at minimum security, and batch sizing does not model chance — the shortfall
appears as failed hacks and a gain-ratio gap, not as an error.

## Environment

**Static RAM analysis is per-script text scanning, charged per thread.**
`window`/`document` references cost 25GB; `performance` is free (workers use
`performance.now()` for start stamps at zero cost). RAM is
`threads × scriptRam`, so thread count is free script-count-wise.

**JSON round-trips turn NaN/Infinity into null** (standard JSON). The worker
payload guard in `Worker.exec` depends on this to reject mangled values.

**`scp` does not bundle imports.** Any module a worker script imports must
separately exist on the target host — which is why `src/workers/*.ts` are
self-contained and must be kept in lockstep by hand.

**`MAX_SCRIPTS = 200,000` (`lib/worker.ts`) is our stability budget, not a
game limit.** Chosen deliberately cautious: the engine visibly stalls
processing a 200k landing burst (+16 hacking levels of XP applied during one
burst's processing, 2026-07-11). All concurrent scripts share it, so
multi-target adds no capacity — do not raise it casually or route around it.
