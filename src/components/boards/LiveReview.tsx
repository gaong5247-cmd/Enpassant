import { Badge, Button, Checkbox, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { makeUci } from "chessops";
import { produce } from "immer";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { commands, type MoveAnalysis } from "@/bindings";
import { activeTabAtom, enginesAtom } from "@/state/atoms";
import { isBasicAnnotation, type Annotation } from "@/utils/annotation";
import { formatScore, getAnnotation } from "@/utils/score";
import type { TreeNode } from "@/utils/treeReducer";
import type { LocalEngine } from "@/utils/engines";
import { TreeStateContext } from "../common/TreeStateContext";
import { useContext } from "react";

type ReviewTask = {
  key: string;
  path: number[];
  ply: number;
  fen: string;
  parentFen: string;
  uci: string;
  san: string;
  color: "white" | "black";
};

type ReviewResult = {
  key: string;
  busy: boolean;
  san: string;
  color: "white" | "black";
  grade: Annotation | null;
  bestBefore: string;
  bestAfter: string;
  score: string;
  message: string;
};

function toReviewTask(parent: TreeNode, node: TreeNode, path: number[]): ReviewTask | null {
  if (!node.move) return null;
  const uci = makeUci(node.move);
  return {
    key: `${path.join(",")}:${uci}:${node.fen}`,
    path,
    ply: path.length,
    fen: node.fen,
    parentFen: parent.fen,
    uci,
    san: node.san ?? "",
    color: node.halfMoves % 2 === 1 ? "white" : "black",
  };
}

function getMainlineTasks(root: TreeNode): ReviewTask[] {
  const tasks: ReviewTask[] = [];
  let parent = root;
  let path: number[] = [];
  while (parent.children[0]?.move) {
    const node = parent.children[0];
    path = [...path, 0];
    const task = toReviewTask(parent, node, path);
    if (task) tasks.push(task);
    parent = node;
  }
  return tasks;
}

// ANALYZE can follow any selected variation, not only the main line.
function getSelectedTask(root: TreeNode, path: number[]): ReviewTask | null {
  if (path.length === 0) return null;
  let parent = root;
  for (let i = 0; i < path.length - 1; i++) {
    const node = parent.children[path[i]];
    if (!node) return null;
    parent = node;
  }
  const node = parent.children[path[path.length - 1]];
  return node ? toReviewTask(parent, node, [...path]) : null;
}

// The original getAnnotation implementation (including ?? and !! detection)
// is deliberately reused unchanged. Live review writes only negative NAGs.
export function classifyLiveMove(analysis: MoveAnalysis[], task: ReviewTask): Annotation | null {
  if (analysis.length < 2 || !analysis[0]?.best[0] || !analysis[1]?.best[0]) return null;
  const annotation = getAnnotation(
    null,
    analysis[0].best[0].score.value,
    analysis[1].best[0].score.value,
    task.color,
    analysis[0].best,
    analysis[1].is_sacrifice,
    task.san,
  );
  return annotation === "??" || annotation === "?" || annotation === "?!" ? annotation : null;
}

export default function LiveReview({
  gameId,
  mode = "game",
}: {
  gameId?: string | null;
  mode?: "game" | "analysis";
}) {
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);
  const activeTab = useAtomValue(activeTabAtom);
  const engines = useAtomValue(enginesAtom);
  const localEngines = useMemo(
    () => (engines ?? []).filter((e): e is LocalEngine => e.type === "local" && !!e.path),
    [engines],
  );
  const [enabled, setEnabled] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const engine = localEngines.find((e) => e.id === selectedId) ?? localEngines[0];
  const [result, setResult] = useState<ReviewResult | null>(null);

  const scopeId = mode === "analysis" ? `analysis-${activeTab}` : gameId;
  const tasks = useMemo(() => {
    if (mode === "game") return getMainlineTasks(root);
    const selected = getSelectedTask(root, position);
    return selected ? [selected] : [];
  }, [root, position, mode]);
  const signature = tasks.map((t) => t.key).join("|");
  const session = [activeTab, scopeId, engine?.id, engine?.path, enabled].join(":");
  const visibleResult =
    mode === "analysis" && result?.key !== tasks[0]?.key ? null : result;

  const followEngine = useCallback(() => {
    if (mode !== "analysis" || !visibleResult || visibleResult.busy || !visibleResult.bestAfter) {
      return;
    }
    const current = store.getState();
    const selected = getSelectedTask(current.root, current.position);
    if (selected?.key !== visibleResult.key) return;
    current.makeMoves({ payload: [visibleResult.bestAfter] });
  }, [mode, store, visibleResult]);

  const sessionRef = useRef("");
  const generation = useRef(0);
  const seen = useRef<string[]>([]);
  const pending = useRef<ReviewTask[]>([]);
  const working = useRef(false);
  const activeAnalysisId = useRef<string | null>(null);

  const runPending = useCallback(async () => {
    if (working.current || !engine || !activeTab || !scopeId) return;
    working.current = true;
    const epoch = generation.current;
    try {
      while (generation.current === epoch && pending.current.length) {
        const task = pending.current.shift()!;
        const id = `live-review-${activeTab}-${scopeId}-${epoch}-${task.ply}`;
        activeAnalysisId.current = id;
        setResult({
          key: task.key,
          busy: true, san: task.san, color: task.color, grade: null,
          bestBefore: "", bestAfter: "", score: "", message: "엔진 분석 중…",
        });

        try {
          const settings = (engine.settings ?? [])
            .filter((option) => option.name !== "MultiPV")
            .map((option) => ({ name: option.name, value: String(option.value ?? "") }));
          const response = await commands.analyzeGame(
            id, engine.path, { t: "Time", c: 350 },
            {
              fen: task.parentFen,
              moves: [task.uci],
              annotateNovelties: false,
              referenceDb: null,
              reversed: false,
            },
            settings,
          );
          if (generation.current !== epoch) return;
          if (response.status === "error") {
            setResult({
              key: task.key,
              busy: false, san: task.san, color: task.color, grade: null,
              bestBefore: "", bestAfter: "", score: "", message: String(response.error),
            });
            continue;
          }

          const before = response.data[0]?.best[0];
          const after = response.data[1]?.best[0];
          if (!before || !after) {
            setResult({
              key: task.key,
              busy: false, san: task.san, color: task.color, grade: null,
              bestBefore: "", bestAfter: "", score: "", message: "종료된 포지션이거나 평가 정보가 없습니다.",
            });
            continue;
          }
          const grade = classifyLiveMove(response.data, task);
          if (grade) {
            store.setState((state) =>
              produce(state, (draft) => {
                let node: TreeNode | undefined = draft.root;
                for (const index of task.path) node = node?.children[index];
                if (!node || node.fen !== task.fen || node.annotations.some(isBasicAnnotation)) return;
                node.annotations.push(grade);
                draft.dirty = true;
              }),
            );
          }
          setResult({
            key: task.key,
            busy: false, san: task.san, color: task.color, grade,
            bestBefore: before.sanMoves[0] ?? "",
            bestAfter: after.sanMoves[0] ?? "",
            score: formatScore(after.score.value, 2),
            message: "",
          });
        } catch (error) {
          if (generation.current === epoch) {
            setResult({
              key: task.key,
              busy: false, san: task.san, color: task.color, grade: null,
              bestBefore: "", bestAfter: "", score: "", message: String(error),
            });
          }
        } finally {
          if (activeAnalysisId.current === id) activeAnalysisId.current = null;
        }
      }
    } finally {
      if (generation.current === epoch) working.current = false;
    }
  }, [engine, activeTab, scopeId, store]);

  useEffect(() => {
    if (sessionRef.current !== session) {
      sessionRef.current = session;
      generation.current += 1;
      if (activeAnalysisId.current) void commands.cancelAnalysis(activeAnalysisId.current);
      activeAnalysisId.current = null;
      seen.current = [];
      pending.current = [];
      working.current = false;
      setResult(null);
    }
    if (!enabled || !engine || !scopeId || !activeTab) return;

    const keys = tasks.map((t) => t.key);
    const diverged = seen.current.some((key, i) => i >= keys.length || keys[i] !== key);
    if (diverged) {
      generation.current += 1;
      if (activeAnalysisId.current) void commands.cancelAnalysis(activeAnalysisId.current);
      activeAnalysisId.current = null;
      pending.current = [];
      working.current = false;
      seen.current = [];
    }
    for (let i = seen.current.length; i < tasks.length; i++) pending.current.push(tasks[i]);
    seen.current = keys;
    void runPending();
  }, [session, signature, enabled, engine, scopeId, activeTab, runPending]);

  useEffect(
    () => () => {
      generation.current += 1;
      if (activeAnalysisId.current) void commands.cancelAnalysis(activeAnalysisId.current);
    },
    [],
  );

  return (
    <Paper withBorder p="xs">
      <Stack gap={6}>
        <Group justify="space-between" gap="xs">
          <Checkbox
            size="xs"
            checked={enabled}
            label={mode === "analysis" ? "ANALYZE 실시간 리뷰 · ?/??" : "실시간 리뷰 · 자동 ?/?? 표시"}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
          />
          {visibleResult?.grade && (
            <Badge color={visibleResult.grade === "??" ? "red" : visibleResult.grade === "?" ? "orange" : "yellow"}>
              {visibleResult.san} {visibleResult.grade}
            </Badge>
          )}
        </Group>
        <Select
          size="xs"
          placeholder="로컬 UCI 엔진을 등록하세요"
          value={engine?.id ?? null}
          onChange={setSelectedId}
          data={localEngines.map((e) => ({ value: e.id, label: e.name }))}
          disabled={!enabled || localEngines.length === 0}
          allowDeselect={false}
        />
        {enabled && mode === "analysis" && visibleResult?.bestAfter && !visibleResult.busy && (
          <Button size="xs" variant="light" onClick={followEngine}>
            엔진 추천 수 이어두기: {visibleResult.bestAfter}
          </Button>
        )}
        {enabled && (
          <Text fz="xs" c={visibleResult?.message ? "dimmed" : undefined}>
            {!engine
              ? "엔진 관리에서 Stockfish 등 로컬 UCI 엔진을 추가하세요."
              : visibleResult?.busy
                ? `${visibleResult.san}: ${visibleResult.message}`
                : visibleResult?.message
                  ? visibleResult.message
                  : visibleResult
                    ? `${visibleResult.color === "white" ? "백" : "흑"} ${visibleResult.san}${visibleResult.grade ?? ""} · 추천: ${visibleResult.bestBefore || "—"} · 다음 수: ${visibleResult.bestAfter || "—"} · 평가 ${visibleResult.score}`
                    : mode === "analysis"
                      ? "ANALYZE에서 수를 두거나 기보의 수를 선택하면 엔진이 실수를 검사합니다."
                      : "착수마다 엔진이 평가해 실수 수에 즉시 기호를 붙입니다."}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
