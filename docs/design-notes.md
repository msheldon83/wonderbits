# Design notes

Decisions and deviations recorded while building, as the plan's agent
handoff contract requires. The plan itself is in [plan.md](plan.md); its build
sequence is section 10. Newest first.

## Build step 11: events, input and time (2026-11-08)

Three islands at once, because they share one mechanism: **When it
happens**, **Remote control** and **Tick tock**, ten levels each, each with
its own introduction. A When card is a container of cards that runs when
something happens, kept in the IR's `handlers`, which has been in the
program's shape since step 2.

### What is built

- **When cards** (`src/ir`). A handler waits for `stepOn:<plate>`, `acorn`,
  `key:<up|down|left|right>` or `tick`. Its cards sit in a container whose
  parent is `on:<event>`, so every edit operation, the cursor, carets and
  drags work in it as they do in a function. Specs write it as
  `{ "on": "stepOn:1", "do": [...] }` at the top of a program. The level
  supplies its When cards, empty on a build level, as it does functions.
  Calls may sit in a When card (not in a function).
- **New cards.** Open gate and Shut gate act on a gate by letter, with a
  picker on the card like a Repeat's count; they print as
  `robot.openGate('a')`. Wait lets one tick pass, printed `robot.wait()`.
- **Plates** (`world.plates`, ids 1 to 9) do nothing on their own: stepping
  onto one fires its event. Picking up an acorn fires `acorn`.
- **Movers** (`world.movers`): logs on water and beetles on floor, each with
  a path it walks one tile per tick, round and round (a pause is the same
  tile twice). The robot may step onto water where a log floats now, and
  rides it while it stays; a beetle blocks a step onto it (`beetle`) and
  catches a robot it walks onto. `SimState.tick` counts ticks; loop checks
  and the validator's search key ticks by the movers' common period.
- **Order of things in a run** (`interpreter.ts`). A When card runs right
  after the step that set it off (a `when` event, then its cards, tagged
  with `via`), before the next card. On a timed board, a board with movers
  or an Every tick card, each robot action (Forward, a turn, Wait) is then
  followed by a `tick` event: movers step, a robot on a log rides, a robot
  caught or fallen in stops the run, and the Every tick card runs. Cards
  inside the Every tick card do not tick again. Gate cards take no tick.
- **Key scripts.** A level's `inputScript` plays after main: one `press`
  event per key, then that key's When card. The runtime contract carries
  the script as `input`. A strip of key caps under the board lights the
  press playing now and fades the ones played.
- **On the board:** plates as numbered stone pads; logs glide and carry the
  robot; beetles patrol; the bubble says "plate 1!", "acorn!" or the key;
  the When card's heading glows while its cards run. The memory card adds a
  Tick line on boards with movers.
- **Validator.** When cards in the starter and the solution match; each
  waits for something the board can do (a plate on it, an acorn, a key in
  the script). Gate cards name real gates, and a gate that gate cards can
  open needs no switch. Logs float, beetles walk, paths move one tile at a
  time and back to the start, and no beetle starts on the robot. Levels
  with When cards, gate cards or a key script are proved by their reference
  solution, like levels with blocks. The introductions must show their
  idea: a When card going off, a key with a When card, things moving.
- **The packs.** When it happens: The plate, Fill in the When, Two gates,
  Shut behind (model), Acorn alarm, Fix the When (debug), Cards in order,
  Turntables (plates that turn the robot while one Repeat until walks),
  Who goes first? (predict the tile, a gate and the facing) and Plate maze
  (budget). Remote control: Press Up, What Up does, A turning key, Left and
  right, Fix the key, Sidestep, Cards in order, The Down key, Where will it
  stop? and Two keys only (budget). Tick tock: Wait for it, Two rivers,
  Beetle patrol, Ride the log, Fix the timing, Every tick, Cards in order,
  Two beetles, Where will it stop? and Three lanes (budget). The timed
  boards' solutions come from the validator's own search, which ticks the
  world like the interpreter, so they are the shortest there are.

### Deviations and choices

- **Interleaved, not queued.** The plan's open question on how the trace
  shows events is answered by running each When card at once, between the
  step that set it off and the next card, so the child sees cause and
  effect next to each other.
- **The level names the events.** As with functions, the child fills When
  cards in; adding a new one waits for creation mode.
- **No ride-off-the-edge, no drowning by tick.** A log's path stays on
  water and next to itself, so a riding robot always stays on its log; the
  fall-in check guards boards that break that rule.
- **Remote control keeps main.** The program list is there on input levels
  but empty; the limits leave no room to skip the keys and walk in main.
  The closer has no prediction: hiding the flag would hide what the keys
  must reach, so prediction stays on Where will it stop?.
- **Every tick is introduced simply.** Its level opens a gate every tick.
  The plan's blinking gates and Frogger lanes use movers instead; the Every
  tick card waits for the game loop of creation mode to matter more.
- **New senses still unused.** Gate shut ahead and on a switch are still
  not taught; nothing in these packs needs an If.

## Build step 10: world state and the memory card (2026-11-08)

The sixth island, **Flip the switch**, makes the world itself change. Its
introduction shows a robot stepping on a switch, walking through the gate it
opened, then stepping on the switch again and leaving the gate shut, with the
memory card under the board following along.

### What is built

- **Switches and gates in the simulation** (`src/sim`). A board may list
  `gates` (an id letter, a tile, and whether it starts open) and `switches`
  (a tile and the gates it flips). A shut gate blocks the robot like a wall,
  with its own reason, `gate`. Stepping onto a switch flips every gate it
  names; standing or turning on it flips nothing. The open gates are part of
  `SimState` (`open`, sorted ids), so traces, the until-loop's forever check
  and the validator's search all tell a shut gate from an open one.
- **Senses.** `pathAhead` and `blockedAhead` now count a shut gate as
  blocked. Two new checks, `gateClosedAhead` ("gate shut ahead") and
  `onSwitch` ("on a switch"), print as `robot.gateClosedAhead()` and
  `robot.onSwitch()`. A level that does not list its conditions still
  offers only the four older ones (`BASIC_CONDITIONS`), so older If levels
  are unchanged.
- **The trace** marks a step onto a switch with `toggled`, the gates it
  flipped. On the board the switch plate presses, then the gate's bars slide
  into its posts. Each gate and its switches share a colour and a letter; a
  switch that flips two gates shows both letters.
- **The memory card** (`src/app/MemoryCard.tsx`, `src/lessons/memory.ts`) is
  a strip under the run controls: position, facing, acorns where there are
  acorns, and one line per gate, each with an icon for its kind (a place, a
  direction, a number, a yes/no). It shows the state after the last event
  played, from the sequencer's new `onPlayed`, so it never runs ahead of the
  board. It appears on every board with gates, on any level that asks about
  memory, and in the introduction when the demo has gates.
- **The `model` activity and state prediction.** `prediction` gains
  `askMemory`: memory card fields (`facing`, `acorns`, `gate:<id>`) to fill
  in before the run. On a model level the program is given and locked, the
  asked lines turn into questions (arrows, a number stepper, yes and no), and
  Run waits until every one has an answer. A wrong answer is never a
  failure: the wrong lines turn red, are cleared, and the message names
  them; the right ones stay. The log records the answers and the fields
  missed.
- **Validator.** Gates and switches sit on floor, never share a tile with
  each other, the robot, the goal or an acorn; switches flip gates that
  exist; every gate has a switch. A model level must solve the level and ask
  at least one field, every asked field must be on that board's card, and a
  predict level must still ask for the tile. The world-state introduction
  must step on a switch.
- **The pack** (`content/packs/forest-switches`): One switch (model), Open
  the gate, Twice (model), Step on it again (a gate that starts open),
  Fix the route (debug), Two keys (the Press function from the last pack, at
  two nooks), The whole card (model: two gates and the facing), Cards in
  order (reorder), Where will it stop? (the transfer prediction, counting
  presses inside a Repeat) and Which switches? (some switches flip two gates,
  so pressing every one shuts a gate again; under a budget).

### Deviations and choices

- **Order comes from the layout.** Flips commute: pressing A then B leaves
  the same gates as B then A. So "the order matters" in the closer comes
  from which switches to press at all, and the backtracking the plan asks
  for is the trip into a nook and back (Open the gate, Two keys, Which
  switches?) and stepping off a switch and on again (Step on it again).
- **The memory card shows from the start of the pack**, answering the
  plan's open question: on every board with gates, not only once state
  matters, so it is already familiar when The whole card asks for all of it.
- **The new senses are built, not yet taught.** No level in this pack uses
  If; gate and switch checks are there for When it happens, where the world
  reacts on its own.
- **No switch state of its own.** A switch shows no on or off: what it
  changed is the gate, and the memory card lists gates. The plan's "switch
  on" sense became "on a switch".

## Build step 9: functions (2026-11-08)

Functions follow conditionals on the spine. The fifth island, **Same trick,
new place**, teaches them in ten levels, opening with its own introduction:
eight flat cards for two hops fold into two Hop cards and a Hop function.

### What is built

- **`call` in the IR** (`src/ir/types.ts`). A `call` node names a function;
  each function is a procedure beside `main`, which the IR has carried
  since step 2. A function's own cards sit in a container whose parent is
  `fn:<name>`, so a `Place` points at the top of a function the same way it
  points into a block, and every edit operation (`insert`, `move`,
  `delete`, `set`) works inside functions unchanged. `walk` visits main,
  then each function, and step numbers run straight on, so "step 7" means
  one card wherever it is. Budgets count every card, the function's
  included, and each call counts as one: that is what makes naming a route
  pay off.
- **Specs** gain `{ "call": "hop" }` and, at the top of a program only,
  `{ "define": "hop", "do": [...] }`. A define becomes a procedure, not a
  card of main, wherever it is listed. The define heading is not a card.
- **Interpreter.** A call emits a `call` event (nothing on the board
  changes), then runs the function's cards. Every event inside a function
  carries `via`, the call cards it runs inside, so the running Hop card
  glows while its cards play. A call to a missing function ends the run
  with an error; a stack 16 calls deep halts as `forever`.
- **Printer.** A function prints as `function hop(): void { ... }` after
  `export function main()`, and a call as `hop();`, tagged like any other
  line so the running line highlights.
- **Editor.** Each function sits under the program: a purple heading with
  its name, and its own list on a purple spine, with the same cursor,
  carets, drags and keyboard as the program. Tapping the heading puts the
  insert point at the end of the function. The palette has one card per
  function, labelled with its name; while the insert point is inside a
  function the call cards rest, and carets and drops never offer a gap in a
  function to a call. With functions, an empty program shows a spot to tap
  so cards can come back to it, and the spare budget rows give way to the
  count in the header so the functions stay in view.
- **Thought bubble.** On a call the robot's bubble says the function's
  name, in purple.
- **Validator.** The starter program defines the level's functions (empty
  on a build or reorder level) and the reference solution fills in the
  same ones. Calls must name a defined function and sit in main, `call`
  must be allowed exactly when there is a function, and outside run and
  predict levels the reference solution must call it. Function names are
  short lower camel case words that are not reserved. Hint paths may start
  with a function's name (`["hop"]`); the fill rung places a call to the
  function the solution calls there.
- **The pack** (`content/packs/forest-functions`), built from the
  reference programs so every board is exactly its route: Hop (run and
  predict), Fill in the hop (the program is given, Hop is empty), Name it
  once (build both under a budget), Cards in order (reorder into the
  program and into Hop), Fix the hop (one wrong card inside Hop breaks
  every hop), Turn and hop (the same hop downhill, then uphill after a
  turn), Where will it stop? (the transfer prediction), Around the rocks (a
  new function, Detour), Two tricks (Hop and Detour on one path) and Four
  spots (Detour on all four sides of a pond, each facing a new way, under a
  tight budget). Every build level's limit is below the shortest flat
  program, so the function is needed, not optional.

### Deviations and choices

- **The level names the function.** "Give a set of moves a name" is shown
  by the introduction and the card name; typing a name needs a keyboard on
  an iPad and a rule for bad names, which belongs with creation mode. The
  child fills a function in; the level supplies Hop or Detour, empty.
- **A function cannot use a function yet.** Calls live in main only, which
  also rules out recursion. Ops, the editor and the validator all enforce
  it; the interpreter still guards its own stack.
- **No Repeat in this pack.** The plan's mechanic is a route that shows up
  where Repeat cannot reach, so every board places the trick at irregular
  spots. Mixing Repeat with functions is left to later packs.
- **The pack opens with three hops, not two.** The plan opens with "one
  L-shaped hop twice"; the introduction shows exactly that, so the first
  level runs three to give the prediction something to follow. Name it
  once (level 3) is the plan's two-hop level, built from scratch.
- **The run highlights the call, not a stack.** The trace carries the call
  path (`via`), and the editor lights the calls and the function's
  heading. A stack panel waits until functions can call functions.

## Build step 8: concept introductions and the card book (2026-11-08)

The child test passed on 2026-11-08: every box of the plan's exit gate is
ticked, and the owner dropped the requirement to play-test each pack before
the next is written. Step 8 followed the same day.

### What is built

- **Pack manifests carry the concept graph** (`src/lessons/types.ts`,
  `parse.ts`). Every `pack.json` lists the `concepts` it teaches and the
  `prerequisites` it expects played first. A pack that introduces a concept
  has an `introduction`: a `title`, one `explanation` sentence in kid terms,
  and a `demo` with a tiny board and the `program` the robot plays on it,
  plus an optional `before` program for the old way. The board reader is
  shared with levels, so a demo board is written like a level's.
- **The validator proves the introduction** (`validate.ts`, `validatePack`):
  prerequisites name real packs that come earlier on the map, the
  introduction is for one of the pack's own concepts, the demo reaches the
  flag, the old way is the longer one, and the program uses a card of the
  concept (`concepts.ts`, `cardsTeaching`). Content validation in CI runs it
  for every pack.
- **The introduction screen** (`src/app/ConceptIntro.tsx`) opens before a
  pack's first level, once. It shows before it tells: the robot plays the
  demo over and over on a small board while the cards light up and the same
  program is printed as TypeScript beside them, with the running line
  highlighted. When the demo has a `before`, the old way plays first under
  the caption "The old way", its cards fold away, and the new program plays
  under "With Repeat". The explanation sits under the demo, then "Let's go"
  and "Watch again". The demo runs through the same runtime contract and
  sequencer as a level; nothing new reaches the renderer.
- **The card book** (`src/app/CardBookScreen.tsx`, `#/book`) lists one page
  per introduction in map order: the title, the island, the sentence and
  Watch, which replays the introduction at `#/book/<pack id>` with a link to
  play the island. Pages for islands not reached yet show a lock and say
  which island opens them; a direct link to a locked page goes back to the
  book. The header has a Card book button on the map and in a level, and
  each island's heading on the map links to its card once reached.
- **Progress remembers** which introductions were watched (`introsSeen`;
  older saves load without it). The log gains `intro-shown` (with the pack
  and whether it was a replay) and `card-book-opened` (with the level it was
  opened from, or "map").
- **Sequencing consolidated to 5 plus 10.** Forest keeps five levels that
  teach the game itself: First step, Looking up, Two steps, Turn first and
  In order. Forest trails holds the ten real sequencing levels: The other
  way, Around the pond, Fix it, Where will it end up?, Two acorns, The short
  way, Nine cards, Zigzag, Deep bug and The big square, so the 22-card square
  still closes the pack and motivates Repeat. Ten levels were retired: Up
  the path, Order matters, The acorn, One wrong turn, Three acorns, Seven
  cards, A long way, The bridge, Round the lake and All the way round. Level
  ids did not change, so existing progress carries over; stars on retired
  levels are simply no longer shown.
- **First levels lost their intro sentence.** The introduction replaces it
  on First step, Repeat and Look ahead. Other levels keep theirs.
- **The throwaway facing pack is deleted.** The two boards built in step 3
  for the quick facing check did their job in the child test, and the
  "Facing check" section at the end of the map is gone with them.

### Deviations and choices

- **The code is printed, not written.** The plan's "peek at the code" was a
  hand-written line in the introduction. It is printed from the demo program
  by the same projection as the see-the-code panel instead, so the demo, the
  cards and the code can never disagree, and the running line highlights.
- **Two packs, not one.** The plan said sequencing "consolidates to 15". The
  five intro levels stay in Forest and the ten real ones in Forest trails,
  so the map shows the game's own island first and the sequencing island
  second, and the sequencing introduction opens Forest. Forest trails
  teaches the same concept and has no introduction of its own.
- **The card book is gated by islands reached**, not by concepts finished.
  A card opens when its island's first level is unlocked, which is also when
  the child first sees the introduction. The grown-up's "open every level"
  opens every card.
- **No sound or final art in the demo yet**; it uses the same placeholder
  robot and tiles as the levels until step 5's art lands.

## After the gate, early: 30 more levels, Repeat and If (2026-11-08)

The first testers finished the 15 MVP levels and asked for harder ones, so
the plan's step 7 (Repeat, then the curriculum) started before the formal
child test. Three packs follow the Forest pack on the map, each with ten
levels and its own stepping-stone trail: **Forest trails** (harder
sequencing with the same three cards), **Around and around** (Repeat) and
**Look before you leap** (If, If / else and Repeat until). The plan's rule
held: a construct arrives only after a puzzle made the old way cumbersome.
Trails ends on a 22-card square; Around and around opens by showing the
same shape in four cards. Loops ends with a lawn-mower sweep whose budget
needs a Repeat inside a Repeat; the If pack ends with a corridor follower
and a prediction that acorns are used to steer, not to collect.

### What is built

- **Blocks in the IR** (`src/ir/types.ts`). Four new node kinds hold other
  cards: `repeat` with a count (2 to 10), `if` and `ifElse` with a
  condition, `until` with a condition. Programs are trees now; every helper
  walks them (`walk`, `countNodes`, `locate`). Edits name a `Place`: a
  container (the main body or a branch of a block) and a gap in it. A new
  `set` operation changes a count or a condition, so undo covers it.
- **Specs** (`src/ir/spec.ts`) are the id-free form level files and tests
  use: `"forward"` or `{ "repeat": 3, "do": [...] }`. The parser reports
  bad blocks by path like everything else.
- **Senses** (`src/sim/world.ts`): path ahead, blocked ahead (wall, water
  or the island's edge), acorn ahead (an uncollected one), at the flag.
  The world is unchanged otherwise; nothing moves but the robot.
- **Interpreter** runs blocks recursively and emits two new trace events
  that change nothing on the board: `loop` at the start of each go round
  of a Repeat, and `check` with the answer an If or Repeat until got. A
  Repeat until that comes back to the same state at the top of the loop
  would run forever, so it halts with reason `forever` and the message
  says the loop got nowhere. Every event counts against the step limit,
  now 600, so a runaway program never produces a trace that takes minutes
  to play.
- **Thought bubble.** While a block thinks the robot stays put and a bubble
  over it says "yes", "no" or "2 of 3". The running block in the program
  shows the same words; blocks that hold the running step glow softly.
- **Editor.** Each block holds its own list (two for If / else), and the
  cursor, the carets, the drop target and the keyboard all work inside
  them. Steps are numbered straight through, blocks included, so "step 4"
  means one thing in the program, in the message line and in the code.
  A Repeat has minus and plus buttons; an If or Repeat until has a dropdown
  of the checks the level allows. The palette's Repeat starts at 3; an If
  starts by checking "blocked ahead" and a Repeat until "at the flag".
- **Printer.** Repeat prints as a `for` loop, If as `if`, Repeat until as
  `while (!...)`, with the node tag on the opening line so the running
  line still highlights.
- **Validator.** Hints into a block carry a `path`. A debug starter must
  differ from the solution in exactly one card, count or condition, in a
  program of the same shape. The breadth-first search still finds the
  shortest flat program; on a level with blocks it cannot find the
  shortest program, so the reference solution is the proof that the budget
  can be met, and the validator warns when a flat program would also fit
  the limits or the budget on a build or reorder level.
- **Packs play in `order`**, then by path, so new packs slot in before the
  throwaway facing pack without renaming directories.

### Deviations and choices

- **Repeat until, not while.** Scratch's "repeat until" reads better to a
  child than a negated while, and it pairs with "at the flag". The code
  panel shows the honest `while (!robot.atFlag())`.
- **No "not", no "and".** Each sense has its opposite in the list instead
  (path ahead, blocked ahead), so a condition is always one tap.
- **The robot cannot look sideways.** Only the tile ahead is sensed, so
  a corridor with left turns is solved by trying right first and turning
  back on a second check. That is the lesson of "Left and right", and it
  is why there is no general maze level.
- **One board per level still.** The strongest case for If is one program
  that must work on several boards. That needs a board switcher, a trace
  per board and prediction per board, and it waits for the child test to
  say whether the single-board If levels already land.
- **The observation log** records a card's place (container and gap) and
  a `card-changed` event for counts and conditions.
- **The palette is compact and sticky** (same day, after the first iPad
  look). With blocks the program grew taller than the side column, and
  the palette pushed it off the screen. Now the palette's cards are
  smaller, it sticks to the top of the side column, and the program
  scrolls under it, so the cards and the program stay on screen together.
  The side column may grow to 460 px, and in portrait the board takes a
  little less height. The map also scrolls to the level that was opened
  most recently when the child returns to it.

## Plan change: the code lives inside the Program panel (2026-11-06)

The "see the code" panel used to sit under the program in the side
column, so on an iPad the blocks and their code were never in view
together. Two other shapes were tried the same day and rejected: each
card showing its own line (code interwoven with blocks was confusing),
and a third column for the code (the code is the program, so it belongs
in the Program panel). Now "See the code" splits the Program panel in
two: the blocks on the left, the same program written in TypeScript on the right,
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
