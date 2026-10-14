"""Press arrow keys from a string of moves: L=Left, D=Down, R=Right, U=Up.

Usage:
    python play_moves.py LDRRUULLLLUUULDDDD...
    python play_moves.py "2L 2U 4R 4D"   (counts, as printed by zip_solver.py)
    python play_moves.py                 (prompts for the moves)

After starting, you have a few seconds to click into the target window.
"""

import random
import re
import sys
import time

import pyautogui

KEYS = {"L": "left", "D": "down", "R": "right", "U": "up"}
START_DELAY = 3  # seconds to switch to the target window
TOTAL_TIME = 2.3  # seconds from the first press to the last press

pyautogui.PAUSE = 0


def random_intervals(count, total):
    """Return `count` random gaps that add up to exactly `total` seconds."""
    if count == 0:
        return []
    weights = [random.uniform(0.4, 1.6) for _ in range(count)]
    scale = total / sum(weights)
    return [w * scale for w in weights]


def wait_until(target):
    """Sleep until the perf_counter time `target`, finishing with a short spin."""
    while True:
        remaining = target - time.perf_counter()
        if remaining <= 0:
            return
        if remaining > 0.005:
            time.sleep(remaining - 0.005)


def parse_moves(text):
    """Expand "2L U 3R" or "LLURRR" into "LLURRR"."""
    text = "".join(text.split()).upper()
    bad = sorted(set(re.sub(r"\d", "", text)) - KEYS.keys())
    if bad:
        sys.exit(
            f"Invalid characters: {''.join(bad)} (only L, D, R, U and counts allowed)"
        )
    if re.search(r"\d$", text):
        sys.exit("A count must be followed by a move, e.g. 3R.")
    return "".join(m * int(n or 1) for n, m in re.findall(r"(\d*)([LDRU])", text))


def main():
    moves = parse_moves(
        " ".join(sys.argv[1:]) if len(sys.argv) > 1 else input("Moves: ")
    )
    if not moves:
        sys.exit("No moves given.")

    for i in range(START_DELAY, 0, -1):
        print(f"Starting in {i}...")
        time.sleep(1)

    play(moves)


def play(moves, total_time=TOTAL_TIME):
    """Press the arrow keys for `moves` ("LLUR..."), spread over `total_time`."""
    intervals = random_intervals(len(moves) - 1, total_time)

    # Schedule each press at an absolute time so press overhead doesn't
    # accumulate and the first-to-last span stays at TOTAL_TIME.
    start = time.perf_counter()
    target = start
    for i, move in enumerate(moves):
        if i > 0:
            target += intervals[i - 1]
            wait_until(target)
        pyautogui.press(KEYS[move])
    elapsed = time.perf_counter() - start

    print(
        f"Done: pressed {len(moves)} keys in {elapsed:.3f}s "
        f"(planned {sum(intervals):.3f}s, "
        f"gaps {min(intervals, default=0) * 1000:.0f}-"
        f"{max(intervals, default=0) * 1000:.0f} ms)."
    )


if __name__ == "__main__":
    main()
