# Zip Solver

A solver for [LinkedIn's Zip](https://www.linkedin.com/games/zip/) puzzle. It has three parts:

- **A browser extension** for Chrome, Edge or Brave. It reads the board the moment it loads, solves it and hands the moves to `auto_play.py`.
- **`auto_play.py`.** It presses those moves as real arrow keys, so the board is played as soon as it appears.
- **A command-line solver.** It solves a grid you type into a text file and prints the path and the moves.

## Quick start

1. Install the Python dependency: `pip install -r requirements.txt`
2. Load the extension in Chrome, Edge or Brave (see [Install](#install)).
3. Run `python auto_play.py`. It checks the setup and opens Zip in your default browser.
4. When it prints `[ok] Zip Solver connected`, press **Start game**. Keep the Zip tab in front while the keys are pressed.

## The puzzle

Draw one continuous path that:

1. starts on cell **1**,
2. visits the numbered cells in order (1 → 2 → 3 → …),
3. ends on the highest number,
4. fills every cell exactly once,
5. never crosses a wall.

The solver uses a depth-first search with pruning. It checks that the remaining cells stay connected, that no cell is left as a dead end, and it tries the most constrained neighbour first (Warnsdorff's rule). A 7×7 board takes a few milliseconds.

## Browser extension

### Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome, `edge://extensions` in Edge or `brave://extensions` in Brave (other Chromium browsers work too).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the `zip-extension` folder.
5. Optional: pin **Zip Solver** to the toolbar so you can see its status at a glance.

To play in an Edge InPrivate or Chrome Incognito window, also turn on **Allow in InPrivate** (or **Allow in Incognito**) in the extension's details.

After you update the extension's files, click its reload button on the extensions page, then reload the Zip tab.

### Use

Run [`auto_play.py`](#auto_playpy). The extension works by itself and has no buttons to press. Its toolbar popup only shows:

- whether `auto_play.py` is connected (green dot) or not running (red dot), and
- on the Zip tab, what happened to the current board, for example `Sent 35 moves.` or `Already solved.`

On any other page the popup offers an **Open Zip** button.

### Permissions

| Permission | Why |
|---|---|
| `https://www.linkedin.com/*` | The board reader runs on LinkedIn pages and wakes up on the Zip game |
| `http://127.0.0.1/*` | Sends the moves to `auto_play.py` on your own computer |

The extension never presses keys itself and sends nothing anywhere except `127.0.0.1`.

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

## `auto_play.py`

Plays the board the moment it loads. The keys are real OS key presses from Python ([PyAutoGUI](https://pyautogui.readthedocs.io/)), not events created inside the browser.

```sh
pip install -r requirements.txt
python auto_play.py                    # opens Zip in your default browser (Chrome, Edge or Brave)
python auto_play.py --browser brave    # or pick one: chrome, edge, brave
python auto_play.py --no-open          # don't open the page, just listen
```

Before the page opens, the script checks the setup:

```
[ok] Listening on port 8765.
[ok] Zip Solver is loaded in Edge profile 'Default'.
Opening https://www.linkedin.com/games/zip/ ...
[ok] Zip Solver connected (Microsoft Edge). Press Start game.
```

1. **Port:** if another copy is already running, it stops and tells you.
2. **Extension:** it finds the browser profile with Zip Solver loaded and opens Zip in that profile, which also skips Chrome's profile picker. If no profile has Zip Solver, it tells you how to load it.
3. **Check-in:** when the Zip page loads, the extension says hello. If nothing arrives within 15 seconds, it lists what to check. The usual cause is an extension that wasn't reloaded after an update.

Then press **Start game**. When the board appears, the extension solves it and sends the moves to `127.0.0.1:8765`, and `auto_play.py` presses them right away. You don't need to click the board or wait for a countdown.

- The keys go to the focused window. The script waits up to `FOCUS_TIMEOUT` seconds for the active tab to be the Zip game (window title "Zip | LinkedIn ..."), then gives up without pressing anything.
- The moves are spread over `TOTAL_TIME` from `play_moves.py`. `START_DELAY` adds a pause before the first key.
- The moves are sent only when the trail is empty, so a board you've started or already finished is left alone.
- `--profile "Profile 1"` opens a specific browser profile instead of the one where Zip Solver was found.

> **Note:** automated input breaks [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement) and can get your account restricted. Use it at your own risk.

## `play_moves.py`

`play_moves.py` types a move string as arrow-key presses into whichever window has focus, for when you have the moves but not the extension. It uses [PyAutoGUI](https://pyautogui.readthedocs.io/).

```sh
pip install -r requirements.txt
python play_moves.py "2L 2U 4R 4D"     # counts, as printed by zip_solver.py
python play_moves.py LLUURRRRDDDD      # or plain letters
```

You get 3 seconds to click into the target window, then all the keys are pressed within about 2 seconds. To change these timings, edit `START_DELAY` and `TOTAL_TIME` at the top of the file.

> **Note:** the same User Agreement warning as for `auto_play.py` applies.

## Project layout

```
zip-extension/      browser extension (Manifest V3)
  manifest.json
  popup.html/.js    toolbar popup: connection and board status
  content.js        reads the board from the page and sends new boards to auto_play.py
  background.js     forwards the moves to auto_play.py on localhost
  solver.js         the solver (also loadable from Node via require)
zip_solver.py       command-line solver
auto_play.py        presses the moves sent by the extension as soon as a board loads
play_moves.py       types a move string as arrow keys
examples/           sample grids
```

## Troubleshooting

- **The popup says "auto_play.py not running"**: start `python auto_play.py`.
- **The popup says "Reload this tab."**: the tab was opened before the extension was installed or reloaded. Reload it.
- **`auto_play.py` says the extension never checked in**: reload Zip Solver on the extensions page, then reload the Zip tab. In an InPrivate or Incognito window, allow the extension there first.
- **Keys were pressed but nothing happened on the board**: the Zip tab must be the active tab of the window in front. Keys go to whatever is on screen.
- **"Couldn't find a solution"**: the extension may have misread a wall. Open DevTools (F12) and look for `[Zip Solver]` messages in the console. The extension retries without walls before it gives up.
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
