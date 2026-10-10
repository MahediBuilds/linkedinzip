# Zip Solver

A solver for [LinkedIn's Zip](https://www.linkedin.com/games/zip/) puzzle. It comes in two parts:

- **A Chrome extension.** It reads the board from the game page and shows the arrow keys that solve it. You type the keys yourself.
- **A Python command-line solver.** It solves a grid you type into a text file and prints the path and the moves.

## The puzzle

Draw one continuous path that:

1. starts on cell **1**,
2. visits the numbered cells in order (1 → 2 → 3 → …),
3. ends on the highest number,
4. fills every cell exactly once,
5. never crosses a wall.

The solver uses a depth-first search with pruning. It checks that the remaining cells stay connected, that no cell is left as a dead end, and it tries the most constrained neighbour first (Warnsdorff's rule). A 7×7 board takes a few milliseconds.

## Chrome extension

### Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome (or any Chromium browser, such as Edge, Brave or Arc).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `zip-extension` folder.
5. Optional: pin **Zip Solver** from the puzzle-piece menu so its icon stays on the toolbar.

### Use

1. Open the [Zip game](https://www.linkedin.com/games/zip/) and press **Start game**.
2. Click the **Zip Solver** icon on the toolbar.
3. Click **Show answer**. The popup lists the moves in groups, for example `→ Right ×4`, `↓ Down ×2`.
4. Click the board and press those arrow keys on your keyboard.

More options in the popup:

- **Show automatically** solves the board as soon as you open the popup.
- **Progress:** reopen the popup at any point. Moves you've already played are dimmed and the next one is highlighted. If you've gone off the path, it tells you to undo.
- **Copy** copies the answer in one of three formats:
  - **Letters:** `LLUURRRRDDDD…`
  - **Words:** `Left Left Up Up Right …`
  - **JSON:** `{"rows":7,"cols":7,"start":{"row":3,"col":3},"moves":"LLUU…","path":[[3,3],[3,2],…]}`

If you open the popup on any other page, it shows an **Open Zip** button instead.

### Permissions

| Permission | Why |
|---|---|
| `scripting` | Adds the board reader to the Zip tab when you open the popup |
| `storage` | Remembers your *Show automatically* and copy-format choices |
| `https://www.linkedin.com/*` | The only site the extension can read |

The extension sends nothing over the network and never presses keys for you. Nothing runs on a page until you open the popup there.

## Python solver

Requires Python 3.8+. The solver uses only the standard library.

### Describe the grid

Write one row per line, with cells separated by spaces. Use `.` for an empty cell and a number for a numbered cell. [`examples/sample.txt`](examples/sample.txt):

```
7 . . . . . 6
. 2 . . . . .
. . 9 . . . .
. . . 1 . . .
. . . . 8 . .
. . . . . 3 .
4 . . . . . 5
```

### Run it

```sh
python zip_solver.py --grid examples/sample.txt
```

```
Grid 7x7, checkpoints 1..9, 0 walls
Solved in 27.2 ms

Step number for each cell ([n] = checkpoint):
 [7]   36   35   34   33   32  [6]
  38  [2]    6    7    8    9   30
  39    4  [9]   48   47   10   29
  40    3    2  [1]   46   11   28
  41   42   43   44  [8]   12   27
  18   17   16   15   14  [3]   26
 [4]   20   21   22   23   24  [5]

Moves from 1: 2L 2U 4R 4D 5L D 6R 6U 6L 4D 4R 2U 2L
As letters:   LLUURRRRDDDDLLLLLDRRRRRRUUUUUULLLLLLDDDDRRRRUULL
```

### Walls

Cells are numbered from 0, row by row, left to right. On a 7×7 grid the top row is 0–6 and the next row is 7–13. To add walls, pass each pair of cells a wall separates:

```sh
python zip_solver.py --grid examples/sample.txt --walls 3-4,10-17
```

### Saved game page

You can also pass a copy of the Zip page saved from your browser (**Ctrl+S**, *Webpage, Complete*):

```sh
python zip_solver.py "Zip _ LinkedIn.html"
```

Walls aren't read from saved pages, so add them with `--walls`. A saved page contains your LinkedIn profile and session, so don't commit it. The `.gitignore` excludes `*.html` files in the repository root.

## `play_moves.py`

`play_moves.py` types a move string as arrow-key presses into whichever window has focus. It uses [PyAutoGUI](https://pyautogui.readthedocs.io/).

```sh
pip install -r requirements.txt
python play_moves.py "2L 2U 4R 4D"     # counts, as printed by zip_solver.py
python play_moves.py LLUURRRRDDDD      # or plain letters
```

You get 3 seconds to click into the target window, then all the keys are pressed within about 2 seconds. To change these timings, edit `START_DELAY` and `TOTAL_TIME` at the top of the file.

> **Note:** automated input breaks [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement), which prohibits bots and other automated methods. Use this script only on your own copies of puzzles or other practice boards, not to submit scores on linkedin.com.

## Project layout

```
zip-extension/      Chrome extension (Manifest V3)
  manifest.json
  popup.html/.js    toolbar popup: answer, progress, copy
  content.js        reads the board from the page (injected on demand)
  solver.js         the solver (also loadable from Node via require)
zip_solver.py       command-line solver
play_moves.py       types a move string as arrow keys
examples/           sample grids
```

## Troubleshooting

- **"No board yet"**: press **Start game** first. The board isn't on the page until then.
- **"Couldn't find a solution"**: the extension may have misread a wall. Open DevTools (F12) and look for `[Zip Solver]` messages in the console. The extension retries without walls before it gives up.
- **The popup says it can't reach the page**: reload the Zip tab and try again. This can happen right after you install or reload the extension.
- **The extension stopped working after a LinkedIn update**: the board reader depends on LinkedIn's page markup (`data-cell-idx`, `data-testid="filled-cell"`, and so on). Please open an issue.

## Contributing

Issues and pull requests are welcome. Please keep changes small and include a grid that shows the problem if you're fixing a solver bug. You can check the JavaScript solver from Node:

```sh
node -e "const {solveZip}=require('./zip-extension/solver.js'); console.log(solveZip(1,3,new Map([[0,1],[2,2]])))"
```

## Disclaimer

This is an unofficial fan project. It isn't affiliated with or endorsed by LinkedIn. "LinkedIn" and "Zip" are trademarks of LinkedIn Corporation.

## License

[MIT](LICENSE)
