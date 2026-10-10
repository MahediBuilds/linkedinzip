"""Solver for LinkedIn's "Zip" puzzle.

Rules: draw one path that starts at 1, passes through the numbered cells in
order, ends on the highest number, and fills every cell exactly once. Walls
(if any) block movement between two adjacent cells.

Usage:
    python zip_solver.py --grid examples/sample.txt
    python zip_solver.py --grid grid.txt --walls 3-4,10-17
    python zip_solver.py "Zip _ LinkedIn.html"     (a saved copy of the game page)

--walls takes pairs of cell indices (row-major, 0-based) that a wall separates.
Walls are not read from saved HTML, so pass them with --walls.
--grid takes a text file with one row per line, '.' for empty cells and
numbers for checkpoints, separated by spaces, e.g.:
    7 . . . . . 6
    . 2 . . . . .
"""

import argparse
import re
import sys
import time


def parse_html(path):
    with open(path, encoding="utf-8") as f:
        html = f.read()
    size = re.search(r'data-trail-grid=""[^>]*style="--\w+:\s*(\d+);\s*--\w+:\s*(\d+)', html)
    cells = re.findall(r'data-cell-idx="(\d+)"([^>]*)>', html)
    if not cells:
        sys.exit("No Zip grid found in the HTML file.")
    n = len(cells)
    if size:
        rows, cols = int(size.group(1)), int(size.group(2))
    else:
        rows = cols = int(round(n ** 0.5))
    nums = {}
    for idx, attrs in cells:
        m = re.search(r'aria-label="Number (\d+)"', attrs)
        if m:
            nums[int(idx)] = int(m.group(1))
    return rows, cols, nums


def parse_text(path):
    with open(path, encoding="utf-8") as f:
        lines = [l.split() for l in f if l.strip()]
    if not lines:
        sys.exit(f"{path} is empty.")
    rows, cols = len(lines), len(lines[0])
    nums = {}
    for r, line in enumerate(lines):
        if len(line) != cols:
            sys.exit(f"Row {r + 1} has {len(line)} cells, expected {cols}.")
        for c, tok in enumerate(line):
            if tok == ".":
                continue
            if not tok.isdigit():
                sys.exit(f"Row {r + 1}: '{tok}' is not a number or '.'.")
            nums[r * cols + c] = int(tok)
    return rows, cols, nums


def parse_walls(spec, rows, cols):
    walls = set()
    for pair in filter(None, (spec or "").replace(" ", "").split(",")):
        m = re.fullmatch(r"(\d+)-(\d+)", pair)
        if not m:
            sys.exit(f"Bad wall '{pair}': expected two cell indices like 3-4.")
        a, b = int(m.group(1)), int(m.group(2))
        if max(a, b) >= rows * cols:
            sys.exit(f"Bad wall '{pair}': cells are numbered 0..{rows * cols - 1}.")
        if abs(a - b) not in (1, cols) or (abs(a - b) == 1 and a // cols != b // cols):
            sys.exit(f"Bad wall '{pair}': cells {a} and {b} are not side by side.")
        walls.add((a, b))
        walls.add((b, a))
    return walls


def solve(rows, cols, nums, walls=frozenset()):
    n = rows * cols
    adj = []
    for i in range(n):
        r, c = divmod(i, cols)
        nb = []
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            rr, cc = r + dr, c + dc
            if 0 <= rr < rows and 0 <= cc < cols:
                j = rr * cols + cc
                if (i, j) not in walls:
                    nb.append(j)
        adj.append(nb)
    adj_mask = [sum(1 << j for j in nb) for nb in adj]

    order = sorted(nums, key=nums.get)
    start, end = order[0], order[-1]
    # Bit for each numbered cell; the path may only enter one when it's next.
    num_mask = sum(1 << i for i in nums)
    full = (1 << n) - 1
    path = [start]

    def connected(free, head):
        # Every free cell must be reachable from the head via free cells.
        seen = 1 << head
        frontier = seen
        reach = free | seen
        while frontier:
            nxt = 0
            f = frontier
            while f:
                low = f & -f
                nxt |= adj_mask[low.bit_length() - 1]
                f ^= low
            nxt &= reach & ~seen
            seen |= nxt
            frontier = nxt
        return (seen & free) == free

    def no_dead_ends(free, head):
        f = free & ~(1 << end)
        while f:
            low = f & -f
            i = low.bit_length() - 1
            deg = bin(adj_mask[i] & (free | (1 << head))).count("1")
            if deg < 2:
                return False
            f ^= low
        return True

    def dfs(head, free, k):
        if not free:
            return head == end
        target = order[k]
        allowed = free & ~(num_mask & ~(1 << target))
        moves = [j for j in adj[head] if allowed >> j & 1]
        # Warnsdorff: try the most constrained neighbour first.
        moves.sort(key=lambda j: bin(adj_mask[j] & free).count("1"))
        for j in moves:
            nfree = free & ~(1 << j)
            if nfree and (j == end or not connected(nfree, j) or not no_dead_ends(nfree, j)):
                continue
            path.append(j)
            if dfs(j, nfree, k + (j == target)):
                return True
            path.pop()
        return False

    sys.setrecursionlimit(10000)
    return path if dfs(start, full & ~(1 << start), 1) else None


def render(rows, cols, nums, path):
    step = {cell: i for i, cell in enumerate(path)}
    width = len(str(len(path)))
    out = []
    for r in range(rows):
        row = []
        for c in range(cols):
            i = r * cols + c
            row.append(f"[{nums[i]}]".rjust(width + 2) if i in nums else str(step[i] + 1).rjust(width + 2))
        out.append(" ".join(row))
    return "\n".join(out)


def directions(path, cols, compress=True):
    names = {-cols: "U", cols: "D", -1: "L", 1: "R"}
    moves = [names[b - a] for a, b in zip(path, path[1:])]
    if not compress:
        return "".join(moves)
    # Compress runs: R R R D -> 3R D
    out, i = [], 0
    while i < len(moves):
        j = i
        while j < len(moves) and moves[j] == moves[i]:
            j += 1
        out.append(f"{j - i}{moves[i]}" if j - i > 1 else moves[i])
        i = j
    return " ".join(out)


def main():
    ap = argparse.ArgumentParser(description="Solve a LinkedIn Zip puzzle.")
    ap.add_argument("html", nargs="?", help="saved Zip page (.html)")
    ap.add_argument("--grid", help="text grid file instead of HTML")
    ap.add_argument("--walls", help="wall pairs of cell indices, e.g. 3-4,10-17")
    args = ap.parse_args()
    if not args.html and not args.grid:
        ap.error("give an HTML file or --grid")

    rows, cols, nums = parse_text(args.grid) if args.grid else parse_html(args.html)
    if len(nums) < 2:
        sys.exit("The grid needs at least two numbered cells.")
    if len(set(nums.values())) != len(nums):
        sys.exit("Each number may appear only once.")
    walls = parse_walls(args.walls, rows, cols)
    print(f"Grid {rows}x{cols}, checkpoints 1..{max(nums.values())}, {len(walls) // 2} walls")

    t = time.perf_counter()
    path = solve(rows, cols, nums, walls)
    dt = time.perf_counter() - t
    if not path:
        sys.exit(f"No solution found ({dt * 1000:.1f} ms).")
    print(f"Solved in {dt * 1000:.1f} ms\n")
    print("Step number for each cell ([n] = checkpoint):")
    print(render(rows, cols, nums, path))
    print("\nMoves from 1:", directions(path, cols))
    print("As letters:  ", directions(path, cols, compress=False))


if __name__ == "__main__":
    main()
