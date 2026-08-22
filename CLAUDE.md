# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris on HTML5 Canvas. Three source files (`index.html`, `style.css`, `game.js`) plus `README.md`. No `package.json`, no dependencies, no bundler, no transpiler, no test suite, no linter config.

## Running

There is no build step. Either open the file directly or serve the folder statically:

```bash
start index.html          # Windows
python3 -m http.server 8000   # or: npx serve .
```

Verification is manual: reload the page in a browser and play. There are no automated tests to run, so when changing game logic, exercise the affected path by hand (spawn, rotate against a wall, clear 1–4 lines, level up past 10 lines, hard drop, pause/resume, game over → restart).

## Architecture (`game.js`)

All logic lives in one file as top-level functions over module-scope mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `dropAccum`, `animId`). `init()` resets every one of those and is bound to both page load and the restart button — any new piece of game state must be reset there or it leaks across games.

**Cell values are both piece identity and color.** Each shape matrix in `PIECES` is filled with its own type number (I is all `1`s, O all `2`s, …), and those indices are exactly the indices into `COLORS`. `board` cells hold `0` or that same 1–7 value. `drawBlock` therefore takes a cell value directly and returns early on `0`. Adding a piece means appending to *both* arrays at the same index.

**Rotation is destructive and non-SRS.** `rotateCW` transposes+reverses into a new matrix; `tryRotate` replaces `current.shape` outright. There is no rotation-state tracking and no SRS kick table — the "wall kicks" are just horizontal offsets `[0, -1, 1, -2, 2]` tried in order. Spawn orientation is lost once a piece rotates.

**Loop.** `loop(ts)` accumulates `dt` into `dropAccum` and steps down one row when it exceeds `dropInterval`, then draws and re-schedules itself via `requestAnimationFrame`. It guards itself twice on `gameOver || paused`: once on entry, so any frame already queued when the state flipped is discarded, and once after `draw()`, because `lockPiece` → `spawn` → `endGame` can end the game *inside* the same callback — that second guard is what actually stops the loop, since the `cancelAnimationFrame(animId)` in `endGame()` is a no-op when it runs from within the loop callback (it cancels the frame that is already executing). The last frame before the guard still runs `draw()`, so the final board stays on screen under the overlay. Pausing also relies on `togglePause()` calling `cancelAnimationFrame(animId)`, and resuming relies on it resetting `lastTime = performance.now()` before re-entering `loop` — skip that reset and the first frame gets a `dt` of however long the pause lasted. `draw()` returns right after the board once `gameOver` is set, so the topped-out piece and its ghost are never painted over the stack. Input is blocked independently by the `gameOver` flag in the `keydown` handler.

**Collision.** `collide(shape, ox, oy)` is the single gate for every move, rotation and drop. It permits `ny < 0` (piece partially above the board) but rejects any `nx` outside `[0, COLS)` and any `ny >= ROWS`.

**Ghost / hard drop** share `ghostY()`, which walks the piece down until the next row collides. `draw()` calls it every frame.

**Scoring** happens in three places: `clearLines` (`LINE_SCORES[n] * level`), `hardDrop` (2/cell) and `softDrop` (1/row). Level is derived from `lines` (`floor(lines/10)+1`) and immediately recomputes `dropInterval = max(100, 1000 - (level-1)*90)`. `updateHUD()` must be called after any of these; the `keydown` handler calls it unconditionally at the end.

## Cross-file coupling

- `<canvas id="board">` in `index.html` is hard-coded to `300 × 600`. It must equal `COLS * BLOCK` × `ROWS * BLOCK`. Changing `COLS`, `ROWS` or `BLOCK` requires editing the HTML attributes too.
- `drawNext` assumes the preview canvas fits a 4×4 grid at 30px (`#next-canvas` is `120 × 120`); it centers shapes into that fixed 4×4 box.
- `game.js` grabs its DOM nodes by id at load time and the script tag is at the end of `<body>` — renaming any id in `index.html` breaks the module immediately.
- A single `#overlay` element is reused for both PAUSE and GAME OVER; the two states differ only by the text written into `#overlay-title` / `#overlay-score`.

## Conventions

- `'use strict'` at the top of `game.js`; ES6+ browser-native syntax only, no modules (plain `<script>`, everything global).
- UI strings and README are in Spanish — keep new user-facing text in Spanish. Code comments are terse and lowercase.
