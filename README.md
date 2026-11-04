# Wonderbits

A visual-first programming game for children aged 8 to 12. Kids guide a robot
across an isometric island by building programs from cards. Every card is a
real line of TypeScript they can look at, and later edit.

This repository is at **build step 2 of the plan: the vertical slice**. It
proves the architecture and the game feel with one puzzle, one command, and a
temporary vector robot. See [docs/design-notes.md](docs/design-notes.md) for
what is built, what is deliberately not, and any deviations from the plan.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. On an iPad on the same network, use the "Network" URL.

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
| Add a step | Tap a card, then tap "Put it here" | Tab to a card, Enter, Tab to a slot, Enter |
| Move a step | Tap the step, then tap a slot | Same, starting from the step |
| Remove a step | Tap the step, then tap Remove | Focus the step, press Delete |
| Cancel | Tap the card again | Escape |
| Run | Run button | Ctrl+Enter or Cmd+Enter |
| Reset | Reset button | R |
| See the code | Header button | C |

## How it is built

```
src/
  ir/          Program IR: the single source of truth, plus edit operations
  sim/         Pure grid simulation: tiles, robot, step function, objectives
  runtime/     Interpreter, runtime contract over postMessage, Worker host
  projection/  IR to read-only TypeScript printer
  lessons/     Level schema, content parser, validator, pack loader
  render/      Isometric math, DOM and SVG board, animation controller, sequencer
  editor/      Tap-a-card-tap-a-slot editor and the code panel
  app/         App shell
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
3. Give a `referenceSolution` that solves it.
4. List the id in the pack's `pack.json`.
5. Run `npm run validate:content`. It proves the level is solvable within its
   limits and reports the shortest solution.

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
