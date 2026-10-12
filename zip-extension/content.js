// Reads the Zip board when it appears, solves it and sends the moves to
// auto_play.py, which presses the keys outside the browser. The page itself
// never gets synthetic input from here.
(() => {
  // Skip if a live copy is already running. A copy left behind by an extension
  // reload has a dead runtime (no id), so replace it.
  if (window.__zipSolverRuntime?.id) return;
  window.__zipSolverRuntime = chrome.runtime;
  // Versions before 2.1 drew an on-page panel; clear one left in an open tab.
  document.getElementById("zip-solver-panel")?.remove();

  const GRID_SEL = '[data-testid="interactive-grid"], [data-trail-grid]';
  const FILLED_SEL = '[data-testid="filled-cell"]';
  const log = (...a) => console.log("[Zip Solver]", ...a);

  // ---------- Board reading ----------

  const getGrid = () => document.querySelector(GRID_SEL);

  function gridColumns(grid, cells) {
    const tpl = getComputedStyle(grid).gridTemplateColumns;
    if (tpl && tpl !== "none") {
      const count = tpl.split(" ").filter(Boolean).length;
      if (count > 1 && cells.length % count === 0) return count;
    }
    const top0 = cells[0].getBoundingClientRect().top;
    const sameRow = cells.filter(c => Math.abs(c.getBoundingClientRect().top - top0) < 2).length;
    if (sameRow > 1 && sameRow < cells.length && cells.length % sameRow === 0) return sameRow;
    return Math.round(Math.sqrt(cells.length));
  }

  function readBoard() {
    const grid = getGrid();
    if (!grid) return null;
    const cells = [...grid.querySelectorAll("[data-cell-idx]")]
      .sort((a, b) => a.dataset.cellIdx - b.dataset.cellIdx);
    if (cells.length < 4) return null;
    const cols = gridColumns(grid, cells);
    const rows = cells.length / cols;
    if (!Number.isInteger(rows)) return null;

    const nums = new Map();
    cells.forEach((cell, i) => {
      const m = (cell.getAttribute("aria-label") || "").match(/Number (\d+)/i);
      let v = m ? +m[1] : null;
      if (v == null) {
        const txt = cell.querySelector("[data-cell-content]")?.textContent.trim();
        if (txt && /^\d+$/.test(txt)) v = +txt;
      }
      if (v != null) nums.set(i, v);
    });
    if (nums.size < 2) return null;
    return { cells, rows, cols, nums };
  }

  // Walls are drawn as a thick border (on linkedin.com, a 12px border on a
  // child's ::after) or as an element named "wall" inside the cell.
  function detectWalls(cells, rows, cols) {
    const walls = new Set();
    const add = (a, b) => { walls.add(`${a}-${b}`); walls.add(`${b}-${a}`); };
    const sides = { Top: [-1, 0], Bottom: [1, 0], Left: [0, -1], Right: [0, 1] };
    const skip = `${FILLED_SEL}, [data-testid="hand-cursor"], [data-cell-hint-arrow], svg`;

    cells.forEach((cell, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const neighbour = side => {
        const [dr, dc] = sides[side];
        const rr = r + dr, cc = c + dc;
        return rr >= 0 && rr < rows && cc >= 0 && cc < cols ? rr * cols + cc : -1;
      };
      const cellRect = cell.getBoundingClientRect();
      const els = [cell, ...cell.querySelectorAll("*")].filter(el => el === cell || !el.closest(skip));

      for (const el of els) {
        const name = `${el.className?.baseVal ?? el.className} ${el.dataset?.testid ?? ""}`;
        if (/wall/i.test(name)) {
          // Work out which edge of the cell the wall element sits on.
          const rc = el.getBoundingClientRect();
          const d = {
            Top: Math.abs(rc.top - cellRect.top) + Math.abs(rc.height),
            Bottom: Math.abs(rc.bottom - cellRect.bottom) + Math.abs(rc.height),
            Left: Math.abs(rc.left - cellRect.left) + Math.abs(rc.width),
            Right: Math.abs(rc.right - cellRect.right) + Math.abs(rc.width),
          };
          const side = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
          const j = neighbour(side);
          if (j >= 0) add(i, j);
        }
        for (const pseudo of [null, "::before", "::after"]) {
          const cs = getComputedStyle(el, pseudo);
          if (pseudo && (cs.content === "none" || cs.content === "normal")) continue;
          for (const side of Object.keys(sides)) {
            const w = parseFloat(cs[`border${side}Width`]);
            const color = cs[`border${side}Color`];
            if (w >= 3 && cs[`border${side}Style`] !== "none" &&
                !/rgba\(.*,\s*0\)$|transparent/.test(color)) {
              const j = neighbour(side);
              if (j >= 0) add(i, j);
            }
          }
        }
      }
    });
    return walls;
  }

  // ---------- Solving ----------

  function moveLetter(from, to, cols) {
    const d = to - from;
    return d === 1 ? "R" : d === -1 ? "L" : d === cols ? "D" : "U";
  }

  const boardKey = b => `${b.rows}x${b.cols}:${[...b.nums].join(",")}`;

  // The current answer: { key, path, moves: "LDRR..." }
  let answer = null;

  // Solves the board on the page. Returns an error message, or null on success.
  function solveBoard() {
    const board = readBoard();
    if (!board) {
      answer = null;
      return "No board yet.";
    }
    const key = boardKey(board);
    if (answer?.key === key) return null; // already solved

    const { rows, cols, nums } = board;
    const walls = detectWalls(board.cells, rows, cols);
    const t0 = performance.now();
    let path = solveZip(rows, cols, nums, walls);
    if (!path && walls.size) {
      log("Detected walls gave no solution, retrying without them", [...walls]);
      path = solveZip(rows, cols, nums, new Set());
    }
    if (!path) {
      answer = null;
      return "Couldn't find a solution.";
    }
    log(`Solved ${rows}x${cols} in ${(performance.now() - t0).toFixed(1)} ms`);
    const moves = path.slice(1).map((to, i) => moveLetter(path[i], to, cols)).join("");
    answer = { key, path, moves };
    return null;
  }

  // How many moves of the answer have been played so far, or -1 if the trail
  // on the board has left the answer's path.
  function progress() {
    const grid = getGrid();
    if (!grid || !answer) return 0;
    const filled = new Set([...grid.querySelectorAll(FILLED_SEL)]
      .map(f => +f.closest("[data-cell-idx]")?.dataset.cellIdx));
    const k = filled.size;
    if (k === 0) return 0;
    for (let i = 0; i < k; i++) if (!filled.has(answer.path[i])) return -1;
    return k - 1;
  }

  // ---------- Status for the toolbar popup ----------

  // One line about what happened on this page, e.g. "Sent 35 moves".
  let status = /\/results\//.test(location.pathname) ? "Solved." : "Waiting for the board.";
  const setStatus = s => { status = s; log(s); };

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.kind === "zip-status") reply({ status });
  });

  // ---------- Hand-off to auto_play.py ----------

  const isZipPage = () => /^\/games\/(view\/)?zip/i.test(location.pathname);
  const nextFrame = () => new Promise(r => requestAnimationFrame(r));
  let sentKey = null;
  let busy = false;

  // Solve a newly loaded board and send its moves (via background.js) to
  // auto_play.py. Does nothing if auto_play.py isn't running.
  async function sendToPlayer() {
    if (busy || !isZipPage() || !getGrid()) return;
    const board = readBoard();
    if (!board || boardKey(board) === sentKey) return;
    sentKey = boardKey(board);
    busy = true;
    try {
      // Let the board finish drawing first: walls come from CSS.
      await nextFrame();
      await nextFrame();
      const error = solveBoard();
      if (error) return setStatus(error);
      sentKey = answer.key;
      const done = progress();
      if (done >= answer.moves.length) return setStatus("Already solved.");
      if (done !== 0) return setStatus("Board already started, so nothing was sent.");
      const res = await chrome.runtime.sendMessage({ kind: "zip-play", moves: answer.moves });
      setStatus(res?.ok ? `Sent ${answer.moves.length} moves.` : "auto_play.py isn't running.");
    } catch (e) {
      setStatus(`Couldn't send the moves: ${e.message}`);
    } finally {
      busy = false;
    }
  }

  // Tell auto_play.py the extension is on a Zip page, so it can confirm the
  // setup works before you press Start game.
  let greeted = false;
  function hello() {
    if (greeted || !isZipPage()) return;
    greeted = true;
    chrome.runtime.sendMessage({ kind: "zip-hello" })
      .then(res => log(res?.ok ? "Connected to auto_play.py."
                               : `auto_play.py isn't running (${res?.error}).`))
      .catch(e => log("Couldn't reach auto_play.py:", e.message));
  }

  // LinkedIn is a single-page app, so watch for the board instead of waiting
  // for a page load.
  let queued = false;
  const observer = new MutationObserver(() => {
    if (!chrome.runtime?.id) return observer.disconnect(); // extension reloaded
    if (queued || !isZipPage()) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; hello(); sendToPlayer(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  hello();
  sendToPlayer();
})();
