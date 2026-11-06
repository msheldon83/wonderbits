# Design notes

Decisions and deviations recorded while building, as the plan's agent
handoff contract requires. The plan itself is in [plan.md](plan.md); its build
sequence is section 10. Newest first.

## Plan change: the code lives inside the Program panel (2026-11-06)

The "see the code" panel used to sit under the program in the side
column, so on an iPad the blocks and their code were never in view
together. Two other shapes were tried the same day and rejected: each
card showing its own line (code interwoven with blocks was confusing),
and a third column for the code (the code is the program, so it belongs
in the Program panel). Now "See the code" splits the Program panel in
two: the blocks on the left, the same program as TypeScript on the right,
with the running line highlighted beside the running block. The toggle
is in the Program panel's header, with undo, redo and Start over. The side
column widens in landscape and the board gives up the width; in portrait
the board shrinks to a strip so the panel gets the height; on a phone the
code goes under the blocks inside the panel.

The palette is titled "Instructions", not "Cards": the panel holds the
instructions the level allows, which is what they are to the child.
Level texts still say "card" for the pieces themselves.

## Build step 4: lessons and the meta-loop (2026-11-06)

### What is built

- **Lesson schema** (`src/lessons/types.ts`). Levels now carry three
  `hints` and optional `prediction` settings. The parser reports every
  problem by path; the validator checks that hint targets are real tiles,
  cards and steps, that the rungs come in the plan's order (orient,
  identify, fill), and that each activity keeps its promises: run and
  predict starters already solve the level and set prediction; reorder
  cards are exactly the solution's cards; a debug starter differs from the
  solution in exactly one card and does not solve it; a build starter does
  not solve it.
- **The 15 MVP levels** (`content/packs/forest-mvp`), following the plan's
  table: run with prediction (1 and 2), add one move (3 and 4), rotate
  then move (5 and 6), reorder (7 and 8), corner and an acorn (9 and 10),
  debug (11 and 12), predict tile and facing on a bigger board (13), two
  acorns from an empty program (14), and the same route under a tight
  budget (15). Every level validates in CI. The step 2 slice level is gone;
  level 3 covers it.
- **Prediction mode** (`src/lessons/prediction.ts`, `Board` tile buttons).
  On a level with prediction the real flag is hidden and the Run button
  reads "Place the flag": the child taps the tile where the robot will end
  up and a flag appears there. Run checks the flag against the trace's
  final tile before anything moves. A wrong flag gets a red cross on its
  tile, stays marked, and the child places the flag again; the robot does
  not move until the flag is right, so the lesson stays about predicting.
  A right flag turns green, the real flag appears, and the run plays. Each
  guess is logged. The next-tile ghost is hidden while predicting so it
  cannot give the answer away. Tiles show a quiet dashed outline, not a
  pulse. Reset and Start over clear the flag and the wrong marks.
- **Hint ladder** (`src/lessons/hints.ts`). The lightbulb opens the next
  rung: highlight board cells, then a palette card or a program step, then
  place one card of the solution. The solution is never given. Three dots
  on the button show the rungs left. Any hint costs the no-hints star. On
  run and predict levels the fill rung only points, since the program is
  given.
- **Progress** (`src/progress`). A key-value store over IndexedDB with an
  in-memory fallback. Per level: stars, attempts, best step count, whether
  the first run solved it, whether a run ended blocked, prediction counts.
  Stars only accumulate across attempts. Levels unlock in order; the
  grown-up can open all of them from settings.
- **Badges** (`src/progress/badges.ts`) are computed, never stored as truth:
  crystal ball (three correct predictions in a row), wrench (a debug level
  solved on the first run), compass (five consecutive completed levels with
  no blocked run), lightning (three budget stars), map (the predict level
  with no hints), trophy (every star on offer).
- **Observation log.** Level opened, card placed, moved and removed, run
  started, trace halted at a node, prediction made with its outcome, hint
  rung opened, level completed with stars, level abandoned. Each event has
  a timestamp and level id. Settings exports progress, settings and the log
  as one JSON file, and can reset the device.
- **Level map** (`src/app/MapScreen.tsx`) is the home screen: stepping
  stones along a dotted trail, stars under each, the next open level
  glowing gold, locked stones grey, the badge shelf below. Hash routes:
  `#/`, `#/level/<id>`, `#/settings`. A locked level sends the child back
  to the map.
- **Completion dialog.** Stars pop in with their reasons, new badges are
  announced, and Next level, Play again and Map are offered.
- **Reset and Start over are different.** Reset puts the robot back at the
  start and keeps the program, so the child can watch again or edit. Start
  over, in the program header, erases the program back to the starter,
  forgets hints used and any placed flag, and logs a "level-restarted"
  event. Play again in the finish dialog is a Start over.

### Deviations and choices

- **No facing prediction.** The plan had level 13 ask for the final facing
  as well as the tile. Dropped at the owner's direction: one question per
  guess, and the rotation cues are tested by the facing check instead. The
  schema's `prediction` object only has `askTile` now and stays an object so
  later levels can ask something else.
- **Hint rung shapes are fixed by the validator**: region, then card or
  step, then fill. Content stays data, but the ladder's teaching shape is
  enforced rather than left to each author.
- **"Facing error" for the compass badge means a run that ended blocked.**
  The simulation cannot know intent; a bump into a wall, water or the edge
  is the observable consequence of a wrong facing, and the log keeps the
  node and reason for the adult to judge.
- **The level picker is gone.** The map replaces it, and the facing-check
  pack appears as a second section at the end of the map until it is
  deleted after the test.
- **No service worker yet.** Offline caching moves to step 5 with the
  rest of the PWA polish; the manifest is unchanged.
- **Theme choice is not in settings** because only the forest theme exists.
  The setting is stored and will be surfaced when the frozen theme arrives.

### Open items for step 5

- Final art for stars, badges and the map backdrop (section 3 prompts 14
  and 15); the icons are placeholders.
- Sound with mute (the mute setting already exists), success and error
  effects, onboarding without words on level 1.
- Service worker for offline use.
- Still outstanding from step 3: the real-iPad measurement and the facing
  check.

## Plan change: the editor gesture (2026-11-06)

The plan's editor gesture was "tap a card, then tap a slot", with every gap
in the program opening as a target. In use it was confusing: every add was a
two-step gesture, and the open slots doubled the list's height each time.
A tap-to-append variant with a toolbar under the selected step was tried
next and rejected the same day. The editor now works like this:

- **A cursor marks where the next card goes.** It is an outlined caret in
  the number gutter, at the end to begin with. Tap a palette card and it
  lands at the cursor, and the cursor moves past it, like a text cursor.
  Tap a block to put the cursor after it. Tap the cursor and solid carets
  show the other gaps; tap one to move it there. It can also be dragged.
  Deleting a block above it shifts it up; any other edit, including undo,
  clamps it to the program's length. An "Insert" toggle was tried first and
  replaced by the cursor the same day: a mode the child must remember to
  switch off lost to a marker that is always visible.
- **The step budget is drawn, not just counted.** On a level with a
  maximum, the unused steps appear as numbered empty dashed rows after the
  blocks, so the child watches the space fill up. At two left the counter
  says "· 2 left" and the empty rows turn amber; at zero the counter turns
  red, the palette cards disable and the existing note explains. The empty
  rows are decoration: they are not drop targets and take no focus, and the
  cursor's "at the end" gap sits just above them.
- **A new block pops and glows** for about three quarters of a second,
  gold-bordered and briefly enlarged, so the eye lands on what was just
  added wherever the cursor put it. Under reduced motion it only flashes.
- **Every block has a Move handle and a Delete button**, always visible.
  Delete removes the block at once; undo brings it back.
- **Tap Move** and carets float in the number gutter, one per gap between
  blocks, pointing into the list. Tap a caret to put the block there. The
  carets are absolutely positioned over the gutter, so the list never
  changes height; gaps that would change nothing get no caret. Tap Move
  again or press Escape to cancel. The block being moved is raised,
  blue-bordered and glowing, with its number in blue while the others fade.
- **Drag and drop** does the same thing: drag a block by its Move handle
  (or by its body with a mouse or pen), drag a palette card into the list,
  or drag the cursor. A green caret marks the gap under the pointer;
  dropping outside the list cancels. Pointer events drive it, so mouse,
  touch and pen share one code path. The Move handle and the cursor have
  `touch-action: none` so a touch drag never turns into a scroll, while a
  block's body keeps `pan-y` and scrolls the column on touch. Palette cards
  use `pan-x`, so the drawer still pans sideways on narrow screens and a
  vertical drag goes to the program.
- **Keyboard.** Enter on Move opens the carets and focuses the first; the
  arrows walk them; Enter places; Escape cancels. Delete on a block removes
  it; Shift plus the up and down arrows move it by one.
- **Gap arithmetic is pure** (`src/editor/geometry.ts`): caret positions and
  the drop gap come from row boxes, so they are unit-tested; the DOM only
  supplies the boxes.
- **Not yet:** auto-scrolling the editor column while dragging near its
  edge. Long programs on a portrait iPad will need it; add it when the
  15-level content exists to test against.

## Build step 3: editor and rotation (2026-11-06)

### What is built

- **Rotation cue** (`src/render/controller.ts`, `src/render/art.tsx`). While
  the robot turns, a curved arrow sweeps over it in the same direction, then
  fades. The same arrow shape is the icon on the Rotate cards, so the card and
  the board say the same thing. With reduced motion the arrow shows without
  sweeping for the length of the pause.
- **Next-tile ghost.** The forward indicator now draws a dashed ghost of the
  robot on the tile ahead, headlamp and all, with a small arrow inside it.
  When the move is blocked the ghost disappears and only the red arrow shows,
  so "where I will land" and "I cannot go there" never look alike.
- **Undo and redo** (`src/ir/history.ts`). A snapshot history of the IR
  with a cap of 100. Buttons sit in the program panel's header; Ctrl or Cmd+Z
  and Shift+Ctrl or Cmd+Z (and Ctrl+Y) work anywhere. Undo after a run resets
  playback, the same as any other edit.
- **Step and Pause** (`src/app/Lesson.tsx`). Run plays the whole trace; Step
  plays one event and pauses; Pause stops after the current event settles;
  Run continues from a pause. The trace is computed once per program and
  reused across Step presses. Shortcuts: S, P. The message line reports
  "Paused after step n".
- **Palette constrained by level** (`src/editor/palette.ts`). A pure function
  turns the level's allowed commands, total budget, per-command quotas and
  supplied cards into palette entries. Quotas show as a count badge on the
  card and close it at zero. On reorder (Parsons) levels the supplied cards
  are the quotas, each usable once, and the budget is their count. The
  content for those levels arrives in step 4; the editor is ready for it.
- **Keyboard parity** (`src/editor/Editor.tsx`). Arrow keys walk the open
  slots while a card is lifted, the program cards otherwise, and the palette
  sideways; Home and End jump. Letter shortcuts are ignored while a select
  or input has focus.
- **Layouts** (`src/styles.css`). Landscape keeps the board left and the
  editor right. Portrait stacks the board over the run controls, with the
  editor column scrolling underneath and the palette as a one-row drawer.
  Checked in headless Chromium at iPad landscape, iPad portrait, 1024 by 768
  and a 390 px phone: no horizontal overflow at any of them.
- **Level picker.** A select in the header and `?level=<id>` choose a level
  until the level map arrives in step 4. Each lesson is keyed by level id so
  switching starts fresh.
- **Two throwaway facing boards** (`content/packs/throwaway-facing`). One
  starts facing north with the flag to the east; one starts facing south, so
  Rotate CW sends the robot screen-left. These are for the quick facing check
  with the tester and are deleted after it.

### Deviations and choices

- **Rotate cards keep one label.** Both say "Rotate" and differ by the arrow
  icon, which is the same arrow the board draws. The plan's words
  "clockwise" and "counter-clockwise" are in the spoken description and the
  tooltip, not on the card: the icon is the cue a nine-year-old reads.
- **Levels may carry an `intro` sentence.** One optional string shown before
  the first run. It is not a hint ladder; those arrive in step 4.
- **Editing while paused resets playback.** The plan says editing after a run
  resets; a pause is treated the same, so the trace on screen always matches
  the program on screen.
- **CSS order matters for the portrait rules.** The portrait media query sits
  at the end of the stylesheet because its declarations share specificity
  with the base rules and must win. The grid columns also set `min-width: 0`;
  without it the board's fixed-width scaler stopped the column from ever
  shrinking on a narrow screen.

### Open items for step 4

- The real-iPad `?perf` measurement is still outstanding. In headless
  Chromium with the turn cue added: 60 frames per second, worst frame 16.8
  ms, no frames over 33 ms.
- Run the facing check on the two throwaway boards, record the result here,
  then delete the pack.
- Drag as an enhancement on top of the same slots is still not built, as
  the plan allows.

## Plan change: top-down 2D board (2026-11-05)

The plan dropped the isometric board for a top-down 2D grid with square
tiles. Isometric made AI asset generation too hard: every object needed a
2:1 projection and depth sorting, and the robot needed four facings with a
full pose set each. Top-down needs one drawing per object, and one robot
sprite pointing up is rotated in code. Up is always north, so Rotate CW is
clockwise on screen.

### Renderer swap, done 2026-11-05

Only the render layer changed. The IR, simulation, runtime contract,
interpreter, TS projection, lesson schema, validator, editor and sequencer
were untouched, and their tests passed unchanged.

- **`src/render/grid.ts`** replaces the isometric math. Tiles are 96 px
  squares; up is north. Display angles accumulate across turns, so a
  clockwise turn from west to north animates +90 degrees, never -270.
- **One robot sprite, rotated in code.** The controller sets
  `translate(...) rotate(...)` on the robot element. A turn is a 90 degree
  rotation with a small lift. The front-and-back views and mirroring are gone.
- **No depth sorting.** Layers are fixed: terrain SVG (floors, the island's
  front lip, then walls), forward indicator, goal, collectibles, robot.
- **Expressions.** The robot's `data-mood` swaps its eyes between idle,
  happy and oops. The celebration is a full spin with a pop.
- **Goal marker.** A dashed ring on the ground plus a flag in the tile's
  top-right corner, so the goal stays visible with the robot standing on it.
- **Off-board warning.** When Forward would leave the island, the red arrow
  is drawn smaller on the board's edge instead of on a tile that does not
  exist, where the viewport clipped it.
- **Gaps** now draw as pond water, not as a hole.

The plan's prompt list for ChatGPT art is rewritten for top-down square
assets in section 3.

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
- **Renderer** (`src/render`). DOM and SVG board, first built isometric and
  replaced by a top-down grid on 2026-11-05 (see above). A forward-indicator
  arrow sits on the tile ahead, red when the move is blocked. A
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
  controller animates a 90 degree turn. The slice level only
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

### Open items for step 3

Carried into the step 3 section above: the real-iPad measurement is still
open; the rotation cue, undo and redo, Step and Pause, and the layouts are
done.
