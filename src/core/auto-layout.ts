// ── Auto-layout: resolve node overlaps with row-aware spacing ──────

import type { Node } from "@xyflow/react";

const MIN_GAP_X = 30; // minimum horizontal gap between nodes
const MIN_GAP_Y = 40; // minimum vertical gap between rows
const ROW_THRESHOLD = 80; // nodes within this Y distance are in the same row
const MAX_NODE_WIDTH = 300; // cap measured widths to prevent blowout from long text

type Rect = {
  idx: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Estimated node dimensions when measured sizes aren't available yet */
const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  appNode: { w: 280, h: 130 },
  personaNode: { w: 240, h: 200 },
  competitorNode: { w: 220, h: 150 },
  actionNode: { w: 220, h: 170 },
  noteNode: { w: 220, h: 200 },
  triggerNode: { w: 220, h: 110 },
  conditionNode: { w: 220, h: 110 },
  transformNode: { w: 220, h: 110 },
  outputNode: { w: 220, h: 110 },
  llmNode: { w: 260, h: 220 },
  stepNode: { w: 280, h: 200 },
  consensusNode: { w: 260, h: 220 },
  affinityCategoryNode: { w: 220, h: 150 },
};

const DEFAULT_SIZE = { w: 220, h: 130 };

function getNodeRect(node: Node, idx: number): Rect {
  const measured = (node as { measured?: { width?: number; height?: number } }).measured;
  const fallback = DEFAULT_SIZES[node.type ?? ""] ?? DEFAULT_SIZE;
  return {
    idx,
    x: node.position.x,
    y: node.position.y,
    w: Math.min(measured?.width ?? fallback.w, MAX_NODE_WIDTH),
    h: measured?.height ?? fallback.h,
  };
}

/**
 * Group rects into rows based on proximity of Y positions.
 * Nodes within ROW_THRESHOLD of each other's Y are in the same row.
 */
function groupIntoRows(rects: Rect[]): Rect[][] {
  const sorted = [...rects].sort((a, b) => a.y - b.y);
  const rows: Rect[][] = [];
  let currentRow: Rect[] = [];
  let rowY = -Infinity;

  for (const rect of sorted) {
    if (rect.y - rowY > ROW_THRESHOLD && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    if (currentRow.length === 0) rowY = rect.y;
    currentRow.push(rect);
  }
  if (currentRow.length > 0) rows.push(currentRow);
  return rows;
}

/**
 * Within a row, spread nodes horizontally so none overlap.
 * Preserves relative ordering (left-to-right) and centers the row.
 */
function spreadRow(row: Rect[]): void {
  if (row.length <= 1) return;

  // Sort by X position
  row.sort((a, b) => a.x - b.x);

  // Align all nodes in this row to the same Y (the average)
  const avgY = Math.round(row.reduce((s, r) => s + r.y, 0) / row.length);
  for (const r of row) r.y = avgY;

  // Push nodes apart from left to right if they overlap
  for (let i = 1; i < row.length; i++) {
    const prev = row[i - 1];
    const curr = row[i];
    const minX = prev.x + prev.w + MIN_GAP_X;
    if (curr.x < minX) {
      curr.x = minX;
    }
  }

  // Re-center the row around the original midpoint of the leftmost and rightmost nodes
  const origPositions = row.map((r) => r.x);
  const origMid = (Math.min(...origPositions) + Math.max(...origPositions)) / 2;
  const currLeft = row[0].x;
  const currRight = row[row.length - 1].x + row[row.length - 1].w;
  const currMid = (currLeft + currRight) / 2;
  const shift = origMid - currMid;
  for (const r of row) r.x = Math.round(r.x + shift);
}

/**
 * Ensure vertical spacing between consecutive rows.
 */
function spaceRows(rows: Rect[][]): void {
  for (let i = 1; i < rows.length; i++) {
    const prevRow = rows[i - 1];
    const currRow = rows[i];

    // Find the bottom of the previous row
    const prevBottom = Math.max(...prevRow.map((r) => r.y + r.h));
    // Find the top of the current row
    const currTop = Math.min(...currRow.map((r) => r.y));

    const gap = currTop - prevBottom;
    if (gap < MIN_GAP_Y) {
      const shift = MIN_GAP_Y - gap;
      // Push this row and all subsequent rows down
      for (let j = i; j < rows.length; j++) {
        for (const r of rows[j]) r.y = Math.round(r.y + shift);
      }
    }
  }
}

/**
 * Resolve overlapping nodes using row-aware layout.
 * Groups nodes into rows, spreads within rows, then fixes vertical spacing.
 * Returns new node array with adjusted positions (original array is not mutated).
 */
export function autoLayout(nodes: Node[]): Node[] {
  if (nodes.length <= 1) return nodes;

  // Build mutable rects
  const rects = nodes.map((n, i) => getNodeRect(n, i));

  // Group into rows, spread each row, then fix vertical gaps
  const rows = groupIntoRows(rects);
  for (const row of rows) spreadRow(row);
  spaceRows(rows);

  // Build index map from rect.idx back to position
  const positions = new Map<number, { x: number; y: number }>();
  for (const row of rows) {
    for (const r of row) {
      positions.set(r.idx, { x: r.x, y: r.y });
    }
  }

  // Map resolved positions back to nodes
  return nodes.map((node, i) => {
    const pos = positions.get(i);
    return pos
      ? { ...node, position: { x: pos.x, y: pos.y } }
      : node;
  });
}
