# Enpassant — live chess review

This repository imports the complete upstream **En Croissant** source code at
commit `8c4a1e45893061cb50a5d3bd656818870dc3332b`:
https://github.com/franciscoBSalgueiro/en-croissant

The original project and its full GPL-3.0 license are retained. Source
attribution: Francisco B. Salgueiro and the En Croissant contributors.

## Changes

* **Play Chess**: select a human player and a local UCI engine, then play.
  The existing engine-controlled gameplay is unchanged.
* Both **Play Chess** and **ANALYZE** have an independent **Live Review** control.
  It uses a local UCI engine for 350 ms before and after each played or
  selected move (two positions per move).
* The review shows the played move, the engine's recommended alternative,
  the next suggested move, and evaluation.
* If the original `getAnnotation` function classifies the move as `?!`,
  `?`, or `??`, the notation receives that annotation as the result arrives.
  Every new mainline move is queued in Play Chess, while ANALYZE reviews
  the currently selected move (including side variations) when it changes.
* In ANALYZE mode, the **engine recommended continuation** button plays the
  best next move on the analysis board. The built-in analysis arrows,
  engine panel and full **Report** continue to work as before.
* Existing annotations are never overwritten. The original `??` and `!!`
  detection algorithm in `src/utils/score.ts`, and the report implementation
  in `src/state/store/tree.ts`, are **unaltered**.
* On a checkmate/stalemate the upstream analyser does not return a score for
  the terminal position, so it cannot grade the final move in live mode.
* This is **local in-app chess analysis**, not a browser extension or a
  third-party online game's assistance/automation tool.

## Usage

1. Register a local UCI engine (e.g. Stockfish or Stockless) in **Engines**.
2. For an engine opponent, open **Play Chess** and start a game. The new
   Live Review section checks every move, then annotates mistakes.
3. For manual study, open **ANALYZE**. Enable **ANALYZE 실시간 리뷰**,
   choose the engine, then move pieces or select a move in the notation.
   Each selected move is graded individually, including side variations.
4. The panel shows a recommendation and a **엔진 추천 수 이어두기**
   button to play the engine's suggested next move.
5. Turn off the checkbox to stop new reviews. Full **Report** and the
   upstream `??`/`!!` algorithm are unchanged.

**Limitations:** Short engine thinking time makes grades provisional. The
existing backend skips analysis of a checkmate or stalemate end position;
terminal moves therefore cannot yet receive a live score. Live Review
does not automatically rewrite existing brilliant annotations.

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
