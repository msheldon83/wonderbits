# Wonderbits

A visual-first programming game for children aged 8 to 12. Kids guide a robot
across a grid island by building programs from cards. Every card is a
real line of TypeScript they can look at, and later edit.

The product and technical plan is in [docs/plan.md](docs/plan.md). It covers
the phases, the build sequence, the architecture, and the exit gate for the
first child test. Read it before starting new work.

This repository is at **build step 4 of the plan: lessons and the
meta-loop**. It has the 15 MVP levels with validators in CI, prediction
mode, three-rung hint ladders, the level map with stars and badges, progress
in IndexedDB, and an observation log the grown-up can export. See
[docs/design-notes.md](docs/design-notes.md) for what is built, what is
deliberately not, and any deviations from the plan.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. On an iPad on the same network, use the "Network" URL.
The level map is the home screen (`#/`). A level is `#/level/<id>`, and
`#/settings` has reduced motion, "open every level" for the grown-up, the
progress export and a reset. The "Facing check" pack at the end of the map
holds two throwaway boards for the quick facing check with the tester.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run all tests, including content validation |
| `npm run typecheck` | Type-check without building |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run validate:content` | Validate only the level packs |

### Performance check

Open the app with `?perf` on the end of the URL, for example
`http://<your-computer>:5173/?perf`, on a real iPad. Three robots patrol a
10 by 10 board while a meter reports frame times. The target is about 60
frames per second with few frames over 33 ms.

## Controls

| Action | Touch or mouse | Keyboard |
| --- | --- | --- |
| Add a step | Tap a card; it goes in at the cursor, and the cursor moves past it | Focus a card, Enter |
| Move the cursor | Tap a block to put it after that block; tap the cursor and then an arrow; or drag the cursor | Enter on the cursor, arrows to pick a gap, Enter |
| Remove a step | Its trash button | Delete on the step |
| Move a step | Tap its Move handle, then an arrow; or drag the handle (or the block itself with a mouse) | Enter on Move, arrows to pick a gap, Enter; or Shift+Up and Shift+Down on the step |
| Cancel a move | Tap Move or the cursor again | Escape |
| Walk the program | | Arrow keys, Home, End |
| Undo and redo | Buttons in the program header | Ctrl+Z or Cmd+Z; Shift+Ctrl+Z, Shift+Cmd+Z or Ctrl+Y |
| Predict | Tap the tile where the robot will end up to place the flag; a wrong flag gets a red cross and you place it again | Tab to a tile, Enter |
| Hint | Lightbulb; three rungs per level | H |
| Run, or continue after a pause | Run button | Ctrl+Enter or Cmd+Enter |
| Step one move | Step button | S |
| Pause after the current move | Pause button | P |
| Reset: robot back to the start, program kept | Reset button | R |
| Start over: erase the program and begin the level again | Start over, in the program header | |
| See the code: the program as TypeScript in a column beside the cards | Button above the cards | C |

## How it is built

```
src/
  ir/          Program IR: the single source of truth, plus edit operations
  sim/         Pure grid simulation: tiles, robot, step function, objectives
  runtime/     Interpreter, runtime contract over postMessage, Worker host
  projection/  IR to read-only TypeScript printer
  lessons/     Level schema, content parser, validator, pack loader, hints, prediction
  progress/    Progress, stars, badges, settings and the observation log over IndexedDB
  render/      Grid math, DOM and SVG board, animation controller, sequencer
  editor/      Program editor (cursor, move handles, drag and drop) and the code panel
  app/         App shell, routes, level map, settings, lesson flow
  perf/        Performance check page
content/
  packs/       Level packs as JSON, validated in CI
```

The editor writes the IR. The IR is printed to TypeScript for the "see the
code" panel and sent to the runtime over `postMessage`. The runtime returns a
deterministic trace, and only the trace reaches the renderer.

## Adding a level

1. Add `content/packs/<pack>/levels/<id>.json`. Copy an existing level.
2. Draw the board with row strings: `.` floor, `#` wall, `_` gap.
3. Give a `referenceSolution` that solves it. An optional `intro` sentence
   shows before the first run. `maxPerCommand` caps a command; `suppliedCards`
   hands out a fixed set of cards for reorder levels.
4. Write the three `hints`: a `region` of cells to look at, a `card` or
   `step` to notice, and a `fill` that places one card of the solution. Set
   `prediction` on run and predict levels. Each `curriculum.activity` makes
   promises the validator checks: a debug starter differs from the solution
   by exactly one card, reorder cards match the solution, and so on.
5. List the id in the pack's `pack.json`.
6. Run `npm run validate:content`. It proves the level is solvable within its
   limits, checks the hints and the activity's promises, and reports the
   shortest solution.

## Licensing

- **Code** is licensed under the [MIT licence](LICENSE).
- **Content** in `content/` (puzzles, level packs, curriculum, themes) is
  licensed under [CC BY 4.0](content/LICENSE.md).
- **AI-generated art**, when added under `assets/generated/`, is dedicated to
  the public domain under CC0 1.0.

The Wonderbits name and any logo are not covered by these licences. Please
use a different name for a fork you publish.

Contributions are accepted under the same licences, with no contributor
licence agreement.
