# Design notes

Decisions and deviations recorded while building, as the plan's agent
handoff contract requires. The plan itself is in [plan.md](plan.md); its build
sequence is section 10. Newest first.

## Build step 2: vertical slice

### What is built

- **Program IR** (`src/ir`). Versioned JSON with named procedures and an
  event-handler list that stays empty in Phase 1. Every node has a stable id.
  All edits go through `applyOp` (insert, move, delete), which undo, redo and
  later AI operations will share.
- **Simulation** (`src/sim`). Pure step function for Forward, Rotate CW and
  Rotate CCW. Blocked moves leave the robot in place and report wall, gap or
  edge.
- **Runtime contract** (`src/runtime`). The client sends a versioned run
  request over `postMessage`; the host streams trace events and a final
  `done`. Phase 1 host is the IR interpreter in a module Worker. The client
  enforces the wall-clock limit by terminating the endpoint and starting a
  fresh one. Tests run the real host over a `MessageChannel`.
- **TypeScript projection** (`src/projection`). Deterministic printer with an
  `// @node <id>` comment per statement, tested by snapshot.
- **Lessons** (`src/lessons`, `content/`). JSON levels with row-string boards,
  a parser that reports every error with its path, and a validator that runs
  in CI. The validator checks the board, proves the reference solution works
  within the limits, and finds the shortest solution by breadth-first search.
- **Renderer** (`src/render`). DOM and SVG isometric board at a true 2:1
  ratio, depth ordering by `x + y`, a forward-indicator arrow on the tile
  ahead (red when the move is blocked), and a temporary vector robot. A
  controller animates trace events with the Web Animations API. A DOM-free
  sequencer guarantees event n+1 never starts before event n settles, and
  supports play, step, pause and reset.
- **Editor** (`src/editor`). Tap a card, tap a slot, for adding, moving and
  removing. Every control is a native button, so keyboard and screen readers
  work. Capacity shows "n of max steps" and palette cards disable when full.
- **Performance page**. `?perf` runs three patrolling robots on a 10 by 10
  board with a frame-time meter.

### Deviations and choices

- **Rotation is implemented in the logic layers already.** The simulation,
  interpreter, printer and validator support Rotate CW and CCW, and the
  controller animates a basic squash-and-swap turn. The slice level only
  allows Forward. The curved-arrow rotation cue and the next-tile ghost polish
  remain in build step 3.
- **Move and remove are in the slice.** The plan put the full editor in step
  3. Moving and removing use the same tap-a-card-tap-a-slot code path as
  adding, so building them now cost little. Undo, redo, Step and Pause buttons
  remain for step 3; the sequencer already supports step and pause.
- **The code panel hides the `@node` comments.** They stay in the projection
  for tooling and Phase 4, but they are noise for a nine-year-old.
- **Walls pick a theme variant by tile position.** The level declares only
  "wall"; the forest theme draws it as a rock or a tree, chosen by a
  deterministic hash. This keeps semantics in content and looks in themes.
- **Hints, prediction and stars are not in the schema yet.** They arrive with
  their UI in build step 4. The `stars` block exists so budgets are validated
  now.
- **No service worker yet.** The app has a web manifest so it can be added to
  the home screen, but offline caching waits for step 4, alongside storage.
- **Only the forest theme exists.** The theme interface is in place. The
  frozen theme and the identical-trace check across themes come in step 5.

### Level layout rule learned from the first screenshots

A wall directly behind the goal, one tile up and one tile left in grid terms,
lines up vertically with it on screen. The flag then looks planted on the
wall. Walls directly in front of a path tile can also hide the robot's feet.
Keep walls off the screen column of the goal, and off the tile diagonally in
front of any path tile. The flag is also planted at the back-right of its
tile, tall enough to clear the robot's head.

### Open items for step 3

- Measure the `?perf` page on a real iPad and record the numbers here.
- Rotation cue with a curved arrow, and a quick facing check with the tester.
- Undo and redo, Step and Pause buttons, landscape and portrait polish.
