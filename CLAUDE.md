# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A React flashcard trainer for a Soroban (Japanese abacus) school — a functional clone of the "AlRashed Smart" app with a custom UI. The app flashes numbers at configurable speed, collects answers, and scores them. Question generation is strictly constrained by Soroban bead rules.

## Commands

```bash
npm run dev       # Start dev server (Vite HMR)
npm run build     # Type-check + production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

No test runner is configured.

## Stack

- **React 19** + **TypeScript** (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- **Vite 7** with `@vitejs/plugin-react`
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin — **NOT PostCSS**. Do not add `postcss.config` or `autoprefixer`. `src/index.css` must contain only `@import "tailwindcss";`. `vite.config.ts` must import `tailwindcss` from `@tailwindcss/vite` and add it to plugins.

## Architecture

The app is a single-page Vite scaffold. The main component is `src/FlashcardGame.jsx`.

### `src/FlashcardGame.jsx`

A `forwardRef` component exported as default. It is self-contained — all game state, audio, TTS, and rendering live here.

**Game phases** (controlled by a single `phase` state string):
`settings` → `getready` → `playing` → `input` → `feedback` → `settings` (or `summary` after all rounds)

**Key state and refs:**
- `gameSetsRef` (ref, not state) holds the generated number sets so `startFlashing` can read them without stale closures.
- `flashTimerRef` + `timeoutsRef` track all pending timers; `clearTimers()` cancels all of them.
- `actualAnswer` is calculated once per round by summing `gameSetsRef.current[idx].slice(0, nps)`.

**Settings state (UI controls):**
- `topic`: `'direct' | 'small_friends' | 'all'` — the Soroban rule set for generation
- `digits`: `1 | 2 | 3 | 4` — how many columns per number
- `numbersPerSet` (displayed as "Rows") — how many numbers flash per round
- `speed` — seconds per flash
- `totalRounds` — number of rounds
- `revealMode`: `'each'` (practice, show feedback per round) | `'end'` (competition, reveal at summary)
- `ttsEnabled` — Web Speech API on/off

**Settings UI layout (4 rows):**
1. Topic selector — pill buttons: Direct / Small Friends / Any
2. Digits selector — pill buttons: 1 / 2 / 3 / 4
3. Rows counter (numbersPerSet) — +/- stepper
4. Speed (seconds) — number input

**Question generation — `generateSorobanSets(numSets, rowsPerSet, digits, topic)`:**

Replaces the old `generateRandomSets`. Uses `getValidMovesForColumn(currentVal, topic)` per column:

| `topic` | Heaven bead conflict blocked | Lower bead overflow blocked | 10-buddy (carry) blocked |
|---|---|---|---|
| `'direct'` | yes | yes | yes |
| `'small_friends'` | no (5-buddy allowed) | no (5-buddy allowed) | yes |
| `'all'` | no | no | no (plain random ±) |

For multi-digit numbers, each column is computed independently and the moves are combined by place value. The first row of each set is always all-positive.

**Audio:** Four `Audio` objects (`tick`, `ding`, `wrong`, `ready`) pre-loaded on mount via `audioRefs`. Volume for `tick` is 0.7.

**TTS:** `speakText(text, type)` wraps the Web Speech API. Voice selected by `getBestVoice(langCode)`: prefers Kanya/Narisa (Thai) or Google US English/Samantha/Zira (English). Android requires `onvoiceschanged` listener because voices load asynchronously. Numbers are spoken as `"+5"` / `"-2"` with `type='op'`.

**Feedback & Summary screens:** Do not modify — they are considered final.

**External dependencies the component imports:**
- `react-router-dom` — `useNavigate`
- `../../LanguageContext` — `useLanguage` hook (provides `lang`, `t` translation object)
- `../../hooks/useWakeLock` — keeps screen on while `phase !== 'settings'`
- `../LoadingCurtain` — full-screen loading overlay component
- Audio assets from `../../assets/sounds/` (`tick.wav`, `ding.wav`, `readyGo.wav`, `wronganswer.wav`)
- Background image: `../../assets/images/wonder-nada-soroban.webp`

> These relative paths mean `FlashcardGame.jsx` is nested inside a larger app (e.g. `src/components/FlashcardGame/FlashcardGame.jsx`). The standalone repo is used for development/testing; the file must be kept compatible with those import paths.

## Soroban Bead Constraint Logic

Each abacus column holds a value 0–9:
- `lowerBeads = value % 5` (earth beads, 0–4)
- `heavenBeadActive = value >= 5`

A **direct move** of `n` on a column with current value `v` is valid when:
- Addition (`n > 0`): heaven bead of `n` is not already active in `v`; lower beads don't overflow past 4.
- Subtraction (`n < 0`): heaven bead of `|n|` is present in `v`; lower beads don't go below 0.

For **small_friends** (`topic = 'small_friends'`), relax the heaven/lower bead checks (allow the 5-complement), but still prevent overflow past 9 or below 0.

For **all** (`topic = 'all'`), skip bead checks entirely — only enforce `0 ≤ v+n ≤ 9` per column (or `0 ≤ result` globally for multi-digit).
