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
  const setStatus = s => { if (s !== status) log(s); status = s; };

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.kind === "zip-status") reply({ status });
  });

  // ---------- Is the board playable? ----------

  // Signed in, LinkedIn can put the board on the page before it can be
  // played: under the start screen, a "Resume" screen or a loading cover.
  // Keys pressed then can reach the game before it has started, which breaks
  // the game ("We couldn't process your request") with the timer running.
  // So the board only counts once the page has loaded and the middle of the
  // board, as far as it's on screen, is the grid itself and not a cover.
  function boardPlayable(grid) {
    if (document.readyState !== "complete" || document.hidden) return false;
    if (grid.closest('[aria-hidden="true"], [inert]')) return false;
    for (let el = grid; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || +cs.opacity < 0.5 || /blur/.test(cs.filter)) return false;
    }
    const r = grid.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
    if (right - left < 10 || bottom - top < 10) return false;
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    if (hit && grid.contains(hit)) return true;
    if (hit !== lastCover) {
      lastCover = hit;
      log("The board is covered by", hit);
    }
    return false;
  }
  let lastCover = null;

  // ---------- Hand-off to auto_play.py ----------

  const isZipPage = () => /^\/games\/(view\/)?zip/i.test(location.pathname);
  const nextFrame = () => new Promise(r => requestAnimationFrame(r));
  let sentKey = null;
  // Moves already on the board when the last batch was sent; auto_play.py
  // waits to hear that the next one landed before it presses the rest.
  let sentFrom = null;
  let busy = false;
  let retry = null;

  // Check again shortly: a cover can fade out without changing the DOM tree.
  const recheck = () => {
    clearTimeout(retry);
    retry = setTimeout(sendToPlayer, 50);
  };

  // Solve the board and send its moves (via background.js) to auto_play.py
  // once it can be played. A board that was already started on the
  // solution's path, e.g. after a reload, is finished from where it is.
  // Does nothing if auto_play.py isn't running.
  async function sendToPlayer() {
    if (busy || !isZipPage() || !getGrid()) return;
    const board = readBoard();
    if (!board || boardKey(board) === sentKey) return;
    if (!boardPlayable(getGrid())) {
      setStatus("Waiting for the board to be playable.");
      return recheck();
    }
    busy = true;
    try {
      // Let the board finish drawing first: walls come from CSS.
      await nextFrame();
      await nextFrame();
      const error = solveBoard();
      if (error) return setStatus(error);
      const done = progress();
      if (done >= answer.moves.length) {
        sentKey = answer.key;
        return setStatus("Already solved.");
      }
      if (done < 0) {
        // Sent again once the trail is reset or undone back onto the path.
        return setStatus("The trail on the board isn't on the solution's path. Press Reset.");
      }
      sentKey = answer.key;
      sentFrom = done;
      const moves = answer.moves.slice(done);
      const res = await chrome.runtime.sendMessage({ kind: "zip-play", moves });
      setStatus(!res?.ok ? "auto_play.py isn't running."
        : done ? `Board was already started: sent the last ${moves.length} moves.`
        : `Sent ${moves.length} moves.`);
    } catch (e) {
      setStatus(`Couldn't send the moves: ${e.message}`);
    } finally {
      busy = false;
    }
  }

  // Tell auto_play.py when the first key it pressed shows on the board, and
  // send the board again if the trail leaves the path (a key was lost) so a
  // Reset gets it played again.
  function watchProgress() {
    if (sentKey == null || !answer || answer.key !== sentKey) return;
    const done = progress();
    if (sentFrom != null && done > sentFrom) {
      sentFrom = null;
      chrome.runtime.sendMessage({ kind: "zip-moved" }).catch(() => {});
    } else if (done < 0) {
      sentKey = sentFrom = null;
      setStatus("The trail left the solution's path. Press Reset to play it again.");
    }
  }

  // Tell auto_play.py the extension is on a Zip page, so it can confirm the
  // setup works before the board shows.
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
    requestAnimationFrame(() => { queued = false; hello(); watchProgress(); sendToPlayer(); });
  });
  // Attributes too: start and resume screens can go away by a class change.
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  hello();
  sendToPlayer();
})();
