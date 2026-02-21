# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A React flashcard trainer for a Soroban (Japanese abacus) school — a functional clone of the "AlRashed Smart" app with a custom UI. The app flashes numbers at configurable speed, collects answers, and scores them. Question generation is strictly constrained by Soroban bead rules.

## Commands

```bash
npm run dev       # Start dev server (Vite HMR)
npm run build     # Type-check (tsc -b) + production build
npm run lint      # ESLint
npm run preview   # Preview production build
npm run deploy    # Build + deploy to GitHub Pages via gh-pages
```

No test runner is configured.

## Stack

- **React 19** + **TypeScript** (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **Vite 7** with `@vitejs/plugin-react`
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — **NOT PostCSS**. Do not add `postcss.config` or `autoprefixer`. `src/index.css` must contain only `@import "tailwindcss";`. `vite.config.ts` must import `tailwindcss` from `@tailwindcss/vite` and add it to plugins.
- Base path is `/flsahcardbasic/` (set in `vite.config.ts`)

## Architecture

Single-page Vite app. Entry: `src/main.tsx` → `src/App.tsx` → `src/AlrasheedGame.jsx`.

### Two game components exist

| File | Used by | Purpose |
|---|---|---|
| `src/AlrasheedGame.jsx` | **This standalone app** (imported in `App.tsx`) | Self-contained — all game state, audio, TTS, i18n, inline stubs for `useWakeLock` and `LoadingCurtain` |
| `src/FlashcardGame.jsx` | **Parent app** (not active here) | Imports external deps (`react-router-dom`, `../../LanguageContext`, `../../hooks/useWakeLock`, `../LoadingCurtain`). Keep compatible with those import paths but do not break the standalone app when modifying it. |

When making changes, update **`AlrasheedGame.jsx`** for the standalone app. `FlashcardGame.jsx` is the integration copy for a larger parent project.

### `src/App.tsx`

Renders `<InAppBrowserGuard />` (blocking overlay for in-app browsers) followed by `<AlrasheedGame />`.

### `src/AlrasheedGame.jsx`

**Game phases** (controlled by `phase` state string):
`settings` → `getready` → `playing` → `input` → `feedback` → `settings` (or `summary` after all rounds)

**Key state and refs:**
- `gameSetsRef` (ref, not state) holds generated number sets so `startFlashing` reads them without stale closures.
- `flashTimerRef` + `timeoutsRef` track all pending timers; `clearTimers()` cancels all.
- `actualAnswer` is set once per round from `setData.answer`.

**Settings state:**
- `lang`: `'en' | 'th'` — UI language (persisted to `localStorage` key `soroban-lang`)
- `magnitude`: `'units' | 'tens' | 'hundreds'` — digit count selector (maps to generator choice via `MAGNITUDE_OPTIONS`)
- `times` — numbers per set (how many flash per round, 2–50)
- `speed` — seconds per flash (0.3–5)
- `totalRounds` — number of rounds (1–50)
- `revealMode`: `'each'` (practice, show feedback per round) | `'end'` (competition, reveal at summary)
- `mode` — hardcoded `"Mixed"` (only option)
- `ttsEnabled` — Web Speech API on/off

**Internationalization (i18n):**
- The `T` constant object at the top of the file holds all translations keyed by `en` and `th`.
- `const t = T[lang]` provides the active translation object used throughout JSX.
- `MAGNITUDE_OPTIONS` uses `labelKey` (not `label`) which maps to keys in `T` (e.g., `t[m.labelKey]`).
- **Always English (never translated):** app title ("Test Skills" / "Soroban Trainer"), Start button, Get Ready countdown ("Get", "Ready", "3", "2", "1", "Go!"), and TTS dictation (always `en-US` voice).
- When adding new magnitude options, add translation keys to both `T.en` and `T.th`, and use `labelKey` in `MAGNITUDE_OPTIONS`.
- Language toggle uses inline SVG flags (US flag for English, Thai flag for Thai) — not emoji flags, which render inconsistently across devices.

**Audio:** Four `Audio` objects (`tick`, `ding`, `wrong`, `ready`) pre-loaded on mount. Volume for `tick` is 0.7.

**TTS:** `speakText(text, type)` wraps the Web Speech API. Voice selected by `getBestVoice(langCode)`: prefers Google US English/Samantha/Zira (English) or Kanya/Narisa (Thai). Numbers spoken as `"+5"` / `"-2"` with `type='op'`. Speech rate adjusts based on speed setting and digit count (special rates for 2-digit and 3-digit numbers). TTS always uses English regardless of UI language setting.

**Inline stubs** (lines 21–49): `useWakeLock(active)` and `LoadingCurtain` are defined inline for standalone use. In the parent app, these come from external modules.

**Feedback & Summary screens:** Do not modify — they are considered final.

### `src/components/InAppBrowserGuard.jsx`

Detects LINE, Facebook, Instagram, TikTok in-app browsers. LINE gets auto-redirected via `?openExternalBrowser=1`. Android users get an `intent://` link to open Chrome. Shows a "Safe to Close" screen after redirect, or a "Copy Link" fallback.

### Question Generation (`src/logic/`)

Each generator produces `{ numbers: number[], answer: number }[]`:

| File | Digits | Columns |
|---|---|---|
| `generateUnits.js` | 1-digit (0–9) | 1 column |
| `generateTens.js` | 2-digit (0–99) | 2 columns (tens + units), direction-synced |
| `generateHundreds.js` | 3-digit (0–999) | 3 columns, direction-synced with retry loop |

**All share the same core algorithm:**
1. `getValidMoves(currentVal, requiredSign)` — returns valid bead moves for a single column
2. `pickWeightedMove(validMoves, lastMove)` — 3x weight for big numbers (6–9), anti-ping-pong (avoids immediate reversal)
3. Direction sync — all columns in a row must move the same direction (+/-)
4. First row is always positive
5. Multi-column generators use a retry loop (up to 50 attempts) because syncing N columns can deadlock

When adding a new generator for more digits, follow the same pattern: add columns, sync directions, retry on deadlock. Wire it up by adding an import, a `MAGNITUDE_OPTIONS` entry with `labelKey`, translation keys in both `T.en` and `T.th`, and a branch in `handleStart()`.

`AlrasheedGame.handleStart()` selects the generator based on `magnitude` setting.

## Soroban Bead Constraint Logic

Each abacus column holds a value 0–9:
- `lowerBeads = value % 5` (earth beads, 0–4)
- `heavenBeadActive = value >= 5`

A **direct move** of `n` on a column with current value `v` is valid when:
- Addition (`n > 0`): heaven bead of `n` is not already active in `v`; lower beads don't overflow past 4.
- Subtraction (`n < 0`): heaven bead of `|n|` is present in `v`; lower beads don't go below 0.

The current generators only implement direct-move rules. The `FlashcardGame.jsx` variant supports additional topic modes (`small_friends`, `all`) that relax bead constraints — these are not yet in the standalone generators.

## TypeScript + JSX Convention

JSX components are `.jsx` files with companion `.d.ts` declaration files for TypeScript compatibility (e.g., `AlrasheedGame.d.ts`, `InAppBrowserGuard.d.ts`). When adding a new `.jsx` component imported by `.tsx` files, create a matching `.d.ts`. Logic files in `src/logic/` also need `.d.ts` files.
