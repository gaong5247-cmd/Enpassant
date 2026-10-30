#!/usr/bin/env python3
"""Connect LiveReview to the unchanged upstream BoardGame UI.

This patch does not edit score.ts, annotations, the Rust analysis engine,
or the original brilliant/blunder classification implementation.
"""
from pathlib import Path

board = Path("src/components/boards/BoardGame.tsx")
source = board.read_text(encoding="utf-8")

import_line = 'import LiveReview from "./LiveReview";'
import_anchor = 'import BoardControls from "./BoardControls";'
if import_line not in source:
    if source.count(import_anchor) != 1:
        raise SystemExit("BoardGame import anchor changed upstream")
    source = source.replace(import_anchor, import_anchor + "\n" + import_line, 1)

control_anchor = '                    <GameInfo headers={headers} />\n                  </Box>\n                  <Group grow>'
replacement = '                    <GameInfo headers={headers} />\n                  </Box>\n                  <LiveReview gameId={gameId} />\n                  <Group grow>'
if '<LiveReview gameId={gameId} />' not in source:
    if source.count(control_anchor) != 1:
        raise SystemExit("BoardGame component insertion point changed upstream")
    source = source.replace(control_anchor, replacement, 1)

board.write_text(source, encoding="utf-8")
print("LiveReview connected; existing annotation detector files untouched")
