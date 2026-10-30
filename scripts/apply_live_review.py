#!/usr/bin/env python3
"""Connect LiveReview to the unchanged upstream BoardGame UI.

This patch does not edit score.ts, annotations, the Rust analysis engine,
or the original brilliant/blunder classification implementation.
"""
import json
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

config_path = Path("src-tauri/tauri.conf.json")
config = json.loads(config_path.read_text(encoding="utf-8"))
config["productName"] = "Enpassant"
config["mainBinaryName"] = "enpassant"
config["identifier"] = "io.github.gaong5247.enpassant"
config["app"]["windows"][0]["title"] = "Enpassant — Live Review"
config["bundle"]["publisher"] = "Enpassant contributors"
# The upstream updater signing key and release endpoint are not ours.
# Keep the plugin installed but target this fork and avoid unsigned update bundles.
config["bundle"]["createUpdaterArtifacts"] = False
config["plugins"]["updater"]["endpoints"] = [
    "https://github.com/gaong5247-cmd/Enpassant/releases/latest/download/latest.json"
]
config_path.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("Fork identity and unsigned installer settings configured")
