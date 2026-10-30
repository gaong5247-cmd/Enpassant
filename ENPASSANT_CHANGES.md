# Enpassant — live chess review

This repository imports the complete upstream **En Croissant** source code at
commit `8c4a1e45893061cb50a5d3bd656818870dc3332b`:
https://github.com/franciscoBSalgueiro/en-croissant

The original project and its full GPL-3.0 license are retained. Source
attribution: Francisco B. Salgueiro and the En Croissant contributors.

## Changes

* **Play Chess**: select a human player and a local UCI engine, then play.
  The existing engine-controlled gameplay is unchanged.
* An independent **Live Review** control runs a local UCI engine for 350 ms
  before and after each played move (two positions per move).
* The review shows the played move, the engine's recommended alternative,
  the next suggested move, and evaluation.
* If the original `getAnnotation` function classifies the move as `?!`,
  `?`, or `??`, the notation receives that annotation during the game.
  Every new mainline move is queued so that a fast engine reply does not drop
  a player's preceding move.
* Existing annotations are never overwritten. The original `??` and `!!`
  detection algorithm in `src/utils/score.ts`, and the report implementation
  in `src/state/store/tree.ts`, are **unaltered**.
* On a checkmate/stalemate the upstream analyser does not return a score for
  the terminal position, so it cannot grade the final move in live mode.
* This is **local in-app chess analysis**, not a browser extension or a
  third-party online game's assistance/automation tool.

## Usage

1. Add a local UCI engine in **Engines**.
2. Start **Play Chess** with at least one engine player.
3. The live-review checkbox is on by default; choose a review engine.
4. During the game the notation gains mistake annotations after the
   evaluation finishes. Turn the checkbox off to stop analysis.
5. Select **Analyze** to access the original full report and its unchanged
   brilliant and blunder detection.

## Build

Upstream uses Node 24, pnpm 12, Rust stable and Tauri 2.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The **Build Windows** GitHub Actions workflow additionally builds a
Windows installer and uploads build files as workflow artifacts. A UCI engine
executable is a separate download/configuration step.
