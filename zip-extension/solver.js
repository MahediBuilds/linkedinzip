// Zip solver: one path from the lowest number to the highest, visiting the
// numbered cells in order and filling every cell exactly once.
//
// rows, cols: grid size. nums: Map(cellIndex -> number).
// walls: Set of "a-b" strings for blocked moves between adjacent cells.
// Returns an array of cell indices, or null if there is no solution.
function solveZip(rows, cols, nums, walls = new Set()) {
  const n = rows * cols;
  const adj = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const nb = [];
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      const j = rr * cols + cc;
      if (!walls.has(`${i}-${j}`)) nb.push(j);
    }
    adj.push(nb);
  }

  const order = [...nums.keys()].sort((a, b) => nums.get(a) - nums.get(b));
  const start = order[0], end = order[order.length - 1];
  const isNum = new Uint8Array(n);
  for (const c of order) isNum[c] = 1;

  const free = new Uint8Array(n).fill(1);
  free[start] = 0;
  let freeCount = n - 1;
  const path = [start];

  const seen = new Int32Array(n);
  const stack = new Int32Array(n);
  let stamp = 0;

  // Every free cell must still be reachable from the head.
  function connected(head) {
    stamp++;
    let sp = 0, count = 0;
    stack[sp++] = head;
    seen[head] = stamp;
    while (sp) {
      const v = stack[--sp];
      for (const w of adj[v]) {
        if (free[w] && seen[w] !== stamp) {
          seen[w] = stamp;
          count++;
          stack[sp++] = w;
        }
      }
    }
    return count === freeCount;
  }

  // Moving the head from `prev` to `head` only lowers the degree of prev's
  // neighbours, so only they can have become dead ends.
  function noNewDeadEnds(prev, head) {
    for (const w of adj[prev]) {
      if (!free[w] || w === end) continue;
      let deg = 0;
      for (const x of adj[w]) if (free[x] || x === head) deg++;
      if (deg < 2) return false;
    }
    return true;
  }

  function freeDegree(j) {
    let d = 0;
    for (const x of adj[j]) if (free[x]) d++;
    return d;
  }

  let budget = 5e6;
  function dfs(head, k) {
    if (freeCount === 0) return head === end;
    if (--budget < 0) return false;
    const target = order[k];
    const moves = adj[head].filter(j => free[j] && (!isNum[j] || j === target));
    // Warnsdorff: most constrained neighbour first.
    moves.sort((a, b) => freeDegree(a) - freeDegree(b));
    for (const j of moves) {
      if (j === end && freeCount > 1) continue;
      free[j] = 0;
      freeCount--;
      path.push(j);
      const ok = freeCount === 0 || (connected(j) && noNewDeadEnds(head, j));
      if (ok && dfs(j, k + (j === target ? 1 : 0))) return true;
      path.pop();
      free[j] = 1;
      freeCount++;
    }
    return false;
  }

  return dfs(start, 1) ? path : null;
}

if (typeof module !== "undefined") module.exports = { solveZip };
