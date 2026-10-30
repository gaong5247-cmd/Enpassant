import { parseUci } from "chessops";
import { describe, expect, it } from "vitest";
import type { MoveAnalysis } from "@/bindings";
import { classifyLiveMove, getSelectedTask } from "@/components/boards/LiveReview";
import { defaultTree, type TreeNode } from "@/utils/treeReducer";

function child(parent: TreeNode, san: string, uci: string, fen: string): TreeNode {
  return {
    ...parent,
    fen,
    san,
    move: parseUci(uci)!,
    children: [],
    annotations: [],
    halfMoves: parent.halfMoves + 1,
  };
}

function result(cp: number, san: string): MoveAnalysis {
  return {
    novelty: false,
    is_sacrifice: false,
    best: [{
      nodes: 1000,
      depth: 10,
      score: { value: { type: "cp", value: cp }, wdl: null },
      sanMoves: [san],
      uciMoves: [],
      multipv: 1,
      nps: 1000,
    }],
  };
}

describe("ANALYZE live review", () => {
  it("recognizes a side variation rather than only the mainline move", () => {
    const root = defaultTree().root;
    const main = child(root, "e4", "e2e4", "fen-main");
    const side = child(root, "d4", "d2d4", "fen-side");
    root.children = [main, side];

    const task = getSelectedTask(root, [1]);
    expect(task?.san).toBe("d4");
    expect(task?.uci).toBe("d2d4");
    expect(task?.parentFen).toBe(root.fen);
    expect(task?.fen).toBe("fen-side");
    expect(task?.path).toEqual([1]);
  });

  it("finds the exact parent for a nested side variation", () => {
    const root = defaultTree().root;
    const main = child(root, "e4", "e2e4", "fen-e4");
    const reply = child(main, "e5", "e7e5", "fen-e4e5");
    const sideReply = child(main, "c5", "c7c5", "fen-e4c5");
    root.children = [main];
    main.children = [reply, sideReply];

    const task = getSelectedTask(root, [0, 1]);
    expect(task?.path).toEqual([0, 1]);
    expect(task?.parentFen).toBe("fen-e4");
    expect(task?.san).toBe("c5");
    expect(task?.color).toBe("black");
  });

  it("reuses the original mistake detector for live scoring", () => {
    const root = defaultTree().root;
    const played = child(root, "e4", "e2e4", "fen-e4");
    root.children = [played];
    const task = getSelectedTask(root, [0])!;
    expect(classifyLiveMove([result(0, "e4"), result(-200, "e5")], task)).toBe("?");
    expect(classifyLiveMove([result(0, "e4"), result(-500, "e5")], task)).toBe("??");
    expect(classifyLiveMove([result(0, "e4"), result(-50, "e5")], task)).toBe(null);
  });
});
