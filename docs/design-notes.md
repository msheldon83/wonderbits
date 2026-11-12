# Design notes

Decisions and deviations recorded while building, as the plan's agent
handoff contract requires. The plan itself is in [plan.md](plan.md); its build
sequence is section 10. Newest first.

## Change: a demo the child can study (2026-11-12)

Feedback: the teaching card animations help, but they move too quickly to
study and understand.

- **Slow is the pace a demo plays at** (`PACE` in
  `src/app/ConceptIntro.tsx`): the robot moves at about half speed, each
  step is followed by a rest of 0.7 s so its card and its line of code can
  be found, and the end stays on screen for 2.8 s before the demo goes
  round again. A Speed switch under the board offers Normal, the pace of a
  level's own run. The choice is a setting (`demoSpeed`), so it is kept.
- **Pause, Back and Step** sit under the board with "Step 3 of 4". Pause
  holds after the step that is playing; Play lets the demo run by itself
  again. Step while the demo is playing only stops it, so nothing moves
  that the child did not ask for; after that each tap plays one step. Back
  shows the step before, with no animation, and its card, its line of code
  and the memory card go back with it. A hold lasts as long as the child
  likes, the end included; Step at the end goes on to the new way, or
  round again.
- **How.** The demo loop plays one event at a time and rests between them
  through a `Pacer` (`src/render/pacer.ts`), which waits while playing and
  holds while paused. Back is the sequencer's new `seek`.
- **The log** has `intro-paced`: the first pause, step or back of a
  showing, and each change of speed.

Choices: Back stays inside one run, so it does not go from the new way
back to the old; Watch again does that. The speed switch is on the demo
and not on the Settings screen, where a child would not look for it.

## Change: Mechanics on one screen, with the rules always in view (2026-11-12)

Feedback: the switch between the program and the rules did not feel
natural; the instructions seemed limited until the rules were visited;
"Add your own" was not clear; and it was not clear why a maker was adding
steps to a program at all. The owner chose one screen with the rules
always visible.

- **Three columns in Mechanics:** the board with its run controls and the
  critic under them; Rules for the player; Your solution. Nothing is
  hidden behind a switch. On a narrow or upright screen they stack and
  the page scrolls: board, rules, solution.
- **Rules for the player** (`src/create/RulesColumn.tsx`) has four parts,
  none of them a step of a program:
  - **The goal.**
  - **Cards the player gets:** every card creation mode has, in groups
    named for the idea (Moves, Loops and ifs, Functions, Memory, Lists,
    Map and bird, Gates), each a switch. A card that is on but has
    nothing to work on says so under its group: "Set needs something to
    remember. Add it under Parts, below."
  - **Parts the player starts with:** Memory, Functions and When cards,
    each with a line saying what it is and its own button: "+ New
    memory", "+ New function", "+ New When card". A name is asked for in
    a small form with the kind it holds. Ready-made sets (the kits) are a
    button here.
  - **Limits:** the most cards, and days, from one. More than one day
    lets new memory go in the backpack.
- **Your solution** is the program panel, renamed, with a line under its
  title: "Solve your own puzzle here, with the cards the player gets. It
  proves the puzzle can be solved. The player never sees it." It has the
  player's cards and no "Add your own" box: parts are made in the rules
  and appear in the solution, empty.
- **The critic** sits under the run controls and speaks whenever the
  rules or the solution change.
- **The play surface** takes a middle column, given the program and a way
  to edit it, so a part added in the rules goes through the same edit
  path, undo included.

### Deviations and choices

- **The board has a third of the screen** in Mechanics, less than
  elsewhere. Board and Preview give it the usual room.
- **The program/rules switch and the Add your own box are gone** from
  creation mode. `OwnNames` stays in the editor for a surface that does
  not lock its names; nothing uses it now.
- **The days setting no longer needs the backpack kit.**

## Change: making a puzzle in three steps, and choosing the island's size (2026-11-12)

Feedback: the Puzzle tab felt cut off from Play, where much of a puzzle is
really defined; and a new puzzle should let its maker choose the map's
size.

- **Three steps replace Build, Play and Puzzle:** 1 Board, 2 Mechanics,
  3 Preview, numbered in the creation's bar.
  - **Board** is the board editor, as before.
  - **Mechanics** is how the puzzle works, on one screen: the board and
    the run controls on the left; on the right a switch between My program
    (the maker's own solution, with Add your own) and Rules (the critic
    first, then the goal, the cards a player gets, the most cards, the
    days). The switch's Rules button says the rules in a few words:
    "reach the flag, 8 cards at most". Changing a rule takes effect on the
    program beside it at once: the palette, the limit and the goal. Add
    cards is among the run controls and in the Rules.
  - **Preview** is the puzzle as a player meets it: the maker's cards and
    limit, the maker's named parts empty, the goal as the first line, and
    no way to add names. Solving it there within the rules is a proof too.
    A line above says what it is, and whether the puzzle is on the map.
- **The bar says where the puzzle stands**: "Ready to play", or "Not
  solved yet".
- **A new island asks how big it is.** Small (5 by 5), Medium (7 by 6) and
  Large (10 by 8), or any size from 3 to 12 tiles each way with steppers,
  with a picture of the empty island. The Board step's steppers use the
  same upper limit.
- **The play surface** takes a header and an alternative for its side
  column, and drops a finished run when the rules change under it, so a
  result never outlives the rules it was run under.

### Deviations and choices

- **12 by 12 at most.** The engine allows 16, the limit of the coordinate
  cards; at 12 a tile is still easy to hit on an iPad. A remix of a larger
  level keeps its size.
- **Rules beside the program, not under it.** Both at once would not fit
  beside the board on an iPad; one tap switches, the board stays, and the
  program keeps its place while the rules show.
- **A limit starts at the maker's own program's size**, or the shortest
  plain way, or ten, when first switched on.

## Change: random values everywhere, and steps for beetles and logs (2026-11-12)

Feedback: the random number was missing, and there was no way to program
how logs and beetles move.

- **Random values are on every creation**, not behind the die kit. Any
  Set card offers a random number 1 to 3, 1 to 6 or 0 to 9 for a number, a
  coin flip for a yes or no, and a random way for a direction. Creations
  made earlier gain them when they load. The die kit now only adds a
  number called `roll` to hold one.
- **A creation is a random puzzle only once a card takes a random value.**
  Then, as on a random level, a run counts only if it works on every roll,
  and the critic stops claiming certainty.
- **How they move**, a panel in Build beside the board, lists each beetle
  and log with the steps it takes as arrows. Four arrow buttons add a
  step, one takes the last step back, one removes it. An arrow rests when
  the step would leave the board, cross the wrong ground or go back over
  the path. Tapping the tool on a tile puts one down standing still;
  dragging still draws a path.

### Deviations and choices

- **A mover follows a list of steps, not a program of cards.** It walks
  its steps and back, on its own clock, without looking at the robot. A
  beetle that runs cards (chases the robot, turns at a wall) needs the
  engine to give other actors a program, which is 13f.

## Build step 13d, first part: names of their own, and kits (2026-11-11)

Feedback: a puzzle made from an empty island could only use the early
cards. The advanced cards all work on something with a name, and only a
level could supply one. This brings the first part of 13d forward, and adds
kits on top.

- **Add your own**, under the program in creation mode
  (`src/editor/OwnNames.tsx`): something to remember (a number, a yes or
  no, a direction, a place, or a list of numbers, directions or yes/no), a
  function, and a When card for an acorn, a tick or a plate on the board.
  Names are typed. The rule is said kindly: starts with a small letter,
  letters and numbers only, 20 at most, not a word the robot already uses,
  not already taken. Each part has a remove button; a function a card still
  calls, and a slot a card still uses, stay.
- **The IR** gains four edit operations: `addFunction`, `removeFunction`,
  `addHandler`, `removeHandler`, and `nameProblem`. Nothing else in the IR,
  the interpreter or the printer changed.
- **`programming.ownNames`** marks a creation. With it, Set cards offer
  every value that fits whatever the program remembers, If cards offer
  every test of it, and a card that needs a slot rests in the palette,
  saying what to remember first. `allowedSources` then only adds to what
  is offered: random values and the bird's answers.
- **A new part brings its cards.** Adding a function adds its call card to
  the creation; a number adds Set and Add; a direction Set and Face; a
  list Add to list and For each; a place Set and Fly. Only a new part does
  this, so a card switched off in Puzzle stays off.
- **Kits** (`src/create/kits.ts`), behind Add cards on a creation's bar:
  a trick with a name, When it happens, Tick tock, a way to remember, a
  counter, a list, a die and a coin, rows and columns, the bird, the
  backpack. A kit adds its cards and ready-named parts (`count`, `bird`,
  `kept` in the backpack), so nothing has to be typed. Each kit points at
  the pack that teaches it until that pack is finished. Adding one twice
  changes nothing, and a name already taken is left alone.
- **The backpack kit makes the puzzle two days long.** Puzzle then has a
  Days setting, two to five.
- **Plates, beetles and logs** are board tools. A plate takes the next
  free number. A beetle's or a log's path is drawn by dragging, there and
  back, or round a ring when the path ends beside its start; a tap on the
  next tile walks the last one on. The first beetle or log brings the Wait
  card. The random-taps test now covers these tools with no exceptions.
- **A player gets the maker's names.** A made puzzle opens with the
  functions, When cards and memory of the maker's solution, empty, and the
  player adds none of their own. Start over in the maker's own Play keeps
  the names and clears the cards.
- **Older creations** gain `ownNames` when they load.

### Deviations and choices

- **Still to come in 13d:** records that are built, a function calling a
  function, and `not`. Each touches the IR, the interpreter and the
  printer, and none was needed to open the existing cards.
- **No key script.** Remote control's keys are a script the level writes;
  a child's game wants real keys, which is the live run of 13e.
- **No Unlock, Mark or Move the finger.** They need a gate's number lock
  or a grid slot, which a child cannot make yet. A remix keeps them.
- **A puzzle with a die must work on every roll**, as a random level does:
  the 48 seeds are checked before a run counts, in Play and by the critic.
- **Six beetles and logs at most**, and nine plates.

## Real words: from cards to TypeScript vocabulary (2026-11-11)

The code panel showed the TypeScript but never said what any of it is
called. Now each concept brings its real words: what a programmer would
say for the thing the child just built with cards.

- **Where the text lives.** In the pack's `introduction`, as `realWords`
  beside the kid sentence: `word` (loop), `code` (`for`), `text` (two or
  three short sentences from the card to the code). A word for an idea
  that no line of code shows, such as state, coordinates or derived value,
  has no `code`. There are 44 words across the 17 introductions.
- **Where the child meets it.** Under the code, in the code panel
  (`RealWords` in `src/editor/CodePanel.tsx`): a row of pieces of code to
  tap, one open at a time. In an introduction, and so in the card book's
  replay, the panel shows that concept's new words with the first one
  open. In a level or in creation mode it shows every word met so far
  whose code is in the program on screen, newest concept first, so the
  list grows as the program does. The card book's list names each page's
  words.
- **Met so far** means the concept's island is open. `function` and
  `void` are on screen from the first level but only become tappable when
  Functions opens, because their text leans on that pack.
- **Matching** (`src/lessons/realWords.ts`) is on the printed code, not
  the IR, with comments left out, and never inside a longer name or
  operator: `for` is not found in `forward`, nor `=` in `+=` or `!==`.
- **The validator** (`validateRealWords`, run over all content in CI)
  proves each word's code is printed by the pack's demo or by one of its
  reference solutions, that no piece of code is explained by two words,
  and that a text stays under 260 characters. So the words cannot drift
  from the projection.

Choices: the words sit under the code, not in the cards or between the
lines, for the reason given on 2026-11-06: code interwoven with blocks was
confusing. The printer has no `===` in any reference solution, so
comparison is taught on `!==` and names `===` in its text. Taps on a word
are not in the observation log yet; worth adding before the next child
test, to see whether the words are read at all.

## Build step 13c: design a puzzle, with the validator as critic (2026-11-11)

The third sub-step of [creation-plan.md](creation-plan.md), and the end of
the puzzle half of creation mode: a child can make a puzzle for someone
else on the same device.

- **Puzzle** is a third mode beside Build and Play
  (`src/create/ChallengePanel.tsx`). The maker sets the goal (reach the
  flag, collect every acorn, or both), which cards a player gets, and how
  many cards at most.
- **The maker's own solution is the proof.** A run in Play that solves the
  puzzle within its own cards and limit proves it, and the Puzzle mode
  re-checks the maker's program whenever the puzzle changes. A change to
  the board, the goal or the cards drops the proof, and the puzzle is a
  draft again until it is solved afresh. Only a proved puzzle can be
  played by others; `#/play/<id>` of a draft goes back to its maker's
  screen.
- **The critic** (`src/create/critic.ts`) is the level validator's search,
  now `searchFlat` with a deadline, plus a run of the maker's program. It
  runs in the Worker behind a new `critique` message of the runtime
  contract. It says, in a child's words: whether the maker has solved it;
  the shortest way with plain steps and the limit beside it; that a player
  can solve it without Repeat, or needs Repeat to fit; that nobody can
  solve it. It never proposes a change.
- **Made here** is a shelf on the map with every proved puzzle. A player
  gets the maker's cards and limit and an empty program, and earns a star
  for solving it and a second for using no more cards than the maker.
  Stars are kept under the proof's time, so a puzzle that is changed and
  proved again starts with none.
- **The log** records the challenge set, what the critic found, each proof
  and each play, so the grown-up's export shows creation too.

### Deviations and choices

- **No "Prove it" button.** The plan had the maker prove a puzzle as a
  separate act. Solving it in Play is that act; a button would only repeat
  it.
- **"Nobody can solve this" is said only when it is certain.** The search
  tries plain steps. Where nothing but the robot's steps can change the
  board (no gate cards, memory, When cards, keys, days or team) and the
  search runs out of places to go, no program of any shape can solve it.
  Otherwise, or past the 1.5 second limit, the critic says it could not
  try every way and that the maker's solution is the proof.
- **The critic has an endpoint of its own**, started for each question and
  closed after, so a long search never holds up a run, and a stale
  question is simply stopped.
- **A shelf on the map, not an island.** The plan's "Made here" island
  would need scenery and a trail like a pack's; a shelf under the island
  does the job until a child test says otherwise.
- **Build puzzles only.** "Hide a bug" and "Where will it stop?" puzzles,
  which the plan lists as later in this step, are not built.
- **A player's place in a made puzzle is not kept.** Leaving it starts it
  again.
- **A goal of "collect every acorn" with no acorns** is met at once; the
  board checker says there are none, and the critic reports zero cards.

## Build step 13b: remix and free play (2026-11-11)

The second sub-step of [creation-plan.md](creation-plan.md): a child can
change a board and solve their own version.

- **Build and Play, one tap apart.** A creation's bar has both. Build is
  the board editor (`src/create/BoardEditor.tsx`); Play is the play surface
  on the board as it now is. The program survives the switch because it is
  saved on every edit. A new thing opens in Build; one being worked on
  opens in Play.
- **Board tools:** grass, rock, water, acorn, flag, robot, gate, switch and
  an eraser. Tap a tile to use the tool; grass, rock, water and the eraser
  paint as a finger drags, and a whole stroke is one undo. Tapping the
  robot turns it, tapping an acorn picks it up, tapping a gate starts it
  open or shut, tapping a switch moves it on to the next gate. Wide and
  Tall steppers resize the board at its right and bottom edges, from what
  still holds the robot and the flag up to 16 by 16.
- **Board edits are pure operations** (`src/create/worldOps.ts`) with their
  own undo history, as `ir/ops.ts` is for programs. Every operation leaves
  a board the simulation can run: the robot and flag on floor and apart,
  one thing per tile, a switch always flipping a gate that is there. A test
  taps at random and checks each board against the level validator's
  `validateWorld`.
- **The board checker** (`src/create/problems.ts`) runs on every edit and
  speaks to the child, with the tiles lit: the flag or an acorn cannot be
  walked to, a shut gate has no switch. It never changes the board.
- **Remix** (`src/create/remix.ts`): "Change this level" on the dialog of a
  solved level, and "Change a level" on the shelf, which lists the levels
  the child has finished. The board and the cards are copied; the budget,
  per-card limits and nesting limit are not. The level is never altered. A
  test remixes all 181 levels through storage and back.
- **Signposts.** The gate and switch tools carry a link to Flip the switch
  until that pack is finished. They work either way.

### Deviations and choices

- **No plates, logs or beetles yet.** A plate does nothing without a When
  card, and a child cannot add one until 13d. Movers need a path drawn on
  the board, which is its own piece of work. A remix keeps the plates and
  movers its level had; painting over a mover's path removes the mover.
- **Steppers, not drag handles**, resize the board. They are easier to hit
  on an iPad and say the size as a number.
- **Six gates at most**, the number the board draws apart by colour.
- **A remix carries the main board only.** A shuffled level's other
  versions are not copied; editing one board of several has no clear
  meaning yet.
- **Board changes are logged once per visit to Build**, not once per tile.

## Build step 13a: creation mode's foundations (2026-11-11)

The first sub-step of [creation-plan.md](creation-plan.md): a shelf, a way
in, and a play surface shared by lessons and creations.

- **The play surface** (`src/app/PlaySurface.tsx`) is what `Lesson.tsx`
  was, minus what only a lesson has. It owns the board, the run controls,
  prediction, the editor and the code panel, and reports through `record`,
  `onProgram` and `onSolved`. `Lesson.tsx` is now the wrapper that brings
  the hint ladder, the stars and badges, and the log. No behaviour changed.
- **Save-my-place.** A level the child edits (build, debug, reorder) keeps
  its unfinished program in a `drafts` document, restored on the next visit
  and dropped when the level is solved.
- **Creations** (`src/create/`). A creation is a board, its rules and the
  maker's program. Its stored form writes the board as a level file does,
  and `parseCreation` reads it back through the level parser's own checks
  (`parseBoardRules`), so a creation is data and gets a level's validation.
- **The shelf** is `#/create`, reached from a Create button in the header
  of the map and of every level. One of its things is `#/create/<id>`: the
  play surface on the child's board, the name and program saved as they
  change. For now a new thing is an empty 5 by 5 island with the seven
  cards of free play; the board editor is 13b.
- **The nudge** is one quiet line under the shelf: the next unfinished
  island, with a button.

### Deviations and choices

- **No index document.** The plan's index key is replaced by listing the
  stored keys that start with `creation:`. One document per creation, as
  planned.
- **A document that will not parse is left alone**, never overwritten or
  deleted; it is just not on the shelf.
- **Reset progress keeps creations.** It used to clear the whole store. It
  now erases progress, the log and saved places; what the child made stays.
  The export includes creations.
- **Creation mode logs without touching progress.** `ProgressStore.log`
  appends to the observation log only, so a creation never appears among
  the levels' attempts or badges.
- **Two statuses, draft and proved.** "Reviewed" waited on sharing, which
  the owner moved out of step 13.

## Change: each robot's memory on the memory card (2026-11-11)

Feedback: on Their own memory, the memory card showed one `steps` line, so
it looked like a value the robots share, and it was not clear whose steps
the question asked for.

- **Every robot keeps its memory.** `SimState.teamMemory` holds each
  robot's own slots; at a handover the robot that ran keeps what it had,
  and the next takes up its own. The running robot's is still `memory`.
- **One value per robot on each line.** On a team board a memory line
  shows a numbered chip per robot, in its colour (`steps ① 3 ② 1`), with
  the running robot's ringed. A question is asked in the last robot's chip,
  the robot running when the run ends, and read aloud as "Robot 2's steps".

## Change: a sign on the board, and the level page's header (2026-11-11)

- **Records can stand on the board.** A record slot may say where it
  stands (`"at": { "x": 1, "y": 0 }`); it is then drawn there instead of on
  the warehouse shelf. Follow the sign's sign is a wooden signpost beside
  the robot, a line per field ("row 2", "column 1"), and the line being read
  lights up. Reading it is not a question for the inventory computer.
- **The header says where you are:** "World 17 · Level 3 · Follow the
  sign", the world being the island's number on the map. On phones it takes
  a line of its own.
- **The level's instructions are at the top of the page,** in a strip
  over the board's column, where they are read first; the program panel
  beside it starts at the top and keeps its full height. The same strip
  says what a run did. On phones it sits above the board.
- **Fix:** the bird is drawn on every level that can fly it, including
  those offering only Fly the bird to.

## Change: the warehouse inventory computer (2026-11-11)

Feedback: The notebook's crates lived only as rows on the memory card. To
keep them tangible, the robot asks its friend, the warehouse inventory
computer.

- **A warehouse panel right under the board** (`src/app/Inventory.tsx`), above the Run buttons, on every
  level with a record or a list of records: the inventory computer, a
  terminal with a face, and a shelf per list with each crate drawn as a box
  with its index and its fields (a tick or a cross for yes and no).
- **The crate being looked at is lifted and outlined:** the one a record
  slot holds now, as For each walks the shelf or an item is read by index.
  A slot still at its start has looked at nothing yet.
- **The computer answers.** Reading a field marks the Set event `asked:
  'inventory'` with `seen: 'crate.number'`, and the computer's bubble says
  "number is 3"; an If on a field gets "key? yes".
- **The words** of the introduction and three levels say the records come
  from the inventory computer. The code is unchanged.

## Change: the bird replaces the finger in Reading the map (2026-11-11)

Feedback: the finger, a purple hand with nobody holding it, was abstract.
Reading the map wants something concrete in the world that looks at the
board while the robot stays put, and the bird already does that.

- **The bird is the place slot.** The six finger levels' place slot `spot`
  is now `bird`, drawn as the bird hovering over its tile with a dashed
  ring under it, gliding as it moves. Any other place slot still shows as a
  pointing hand. The code is the same coordinates as before: `bird.x += 1`,
  `walls[bird.y][bird.x]`.
- **Fly the bird** (the old Move finger) moves the bird one tile. Reading a
  map under the bird reads "walls under the bird", and the bird calls out
  what it sees ("rock!", "no rock", "acorn!"); the Set event carries
  `seen` with the map's name.
- **Fly the bird to** is a new card: walls do not stop a bird, so it can go
  straight to a column, a row, or both (`{ "fly": "bird", "column": 3,
  "row": 1 }`), each a number or a number slot. It prints as
  `bird = { x: 3, y: 1 }`, or `bird.x = 3` alone. A coordinate off the
  board stops the run, as Go to row does.
- **The levels.** A new level, Straight there, sends the bird to an acorn
  with one card. Look before you go starts the bird at column 0 and flies
  it to column 3 to look; Count the acorns flies straight back to column 0
  at the end of each row; Minesweeper flies to the tile above, then
  straight to row 2.
- **One bird, two kinds of question.** It can fly anywhere; the robot asks
  it simple things: what is under you (Reading the map), and, later, how
  many acorns are left (Two scoreboards).
- **A warm red-orange,** so it reads apart from the blue robot and the
  green board.

## Change: the robot's pocket and the bird (2026-11-11)

Feedback: "acorns left on the board" was abstract. Every other reading is
something the robot can know from where it stands, what it carries or what
it wrote down; a count of the whole board came from nowhere.

- **The robot knows its pocket.** The reading `acorns` is now worded "acorns
  in its pocket" everywhere (it was "acorns held"): the robot keeping track
  of what it carries is its own reading.
- **The bird sees the whole board.** Readings no robot could make from one
  tile belong to the bird, flying over the board (`BIRD_SOURCES`, so far
  only `acornsLeft`). The card reads "acorns left (ask the bird)" and prints
  as `bird.acornsLeft()`, with `bird` imported beside `robot`. On levels
  that offer it, the bird sits over the top right of the board; when the
  robot asks, the bird flaps and calls back ("0 left!"), and the Set event
  carries `asked: 'bird'`.
- **Asking the bird is opt-in.** Set offers it only where a level's
  allowedSources lists it, so earlier packs' menus are as they were.
- **Two scoreboards is reworded** around the two: hand-kept counts go out of
  date; the pocket and the bird are always right.

## Build step 12, part six: Robot team (2026-11-11)

The objects pack, **Robot team** (`content/packs/forest-team`), ten levels
with its introduction, "Blueprints": two robots run the same two cards, each
from its own start. This finishes step 12 and the concept spine.

### What is built

- **Team boards.** A board may list `team`: two to four robots, each with
  its start, its own flag and, optionally, the values its memory is built
  with (`"memory": { "steps": 2 }`). The first is the board's robot and
  goal. The program is the blueprint: each robot runs main in turn, in the
  order listed, on the same board, so a gate one robot opens stays open for
  the next. Between robots a `next` event (node id `team`) leaves the one
  that ran where it stopped and starts the next at its own place, with its
  own memory: the blueprint's starts, then its own values.
- **Robots share the board.** A robot standing still blocks the way like a
  rock (`blocked: robot`) and counts as blocked ahead; at the flag means
  the running robot's own flag. The level is solved when every robot ends
  on its own flag. `SimState.team` holds every robot's place and
  `SimState.active` the one running.
- **The code** prints a team board as a class: `class Bot extends Robot`
  with each slot a field and main a method (`this.forward()`,
  `this.steps -= 1`), then the team as instances,
  `Object.assign(new Bot(0, 0, 'right'), { steps: 2 })`, and
  `for (const bot of team) bot.main();`.
- **On the board** each robot and its numbered flag have their own colour;
  the robots not running stand where they are. The bubble says "done!" and
  "Robot 2" at each handover, the memory card gains a Robot line ("Robot 2
  of 3") and shows the running robot's memory, and messages say which robot
  bumped.
- **Validator.** A team has two to four robots, each starting on floor off
  its flag, no two sharing a start or a flag; values a robot is built with
  are slots of the blueprint, of their kinds. A team board asks for the
  flags and has no days, shuffles, key script, movers or When cards. The
  objects introduction must hand over to a second robot.
- **The pack.** Two robots, Their own memory (model: each robot counts its
  own steps), Own starts (one sensing blueprint on two paths), Fix the
  blueprint (debug: stop at the flag, not the wall), Built with a number
  (each robot walks as far as it was built to), One opens, one passes (the
  first robot flips the switch for the second), Cards in order, In each
  other's way (a robot blocks the next), Where will robot 3 stop? and The
  opener (one blueprint, two jobs chosen by a value each robot is built
  with, under a budget).

### Deviations and choices

- **Robots take turns.** The plan's "one holds a plate open while another
  passes" needs robots acting at once. Here each robot runs the whole
  blueprint before the next starts, so a trace stays one robot at a time and
  can be followed card by card; a switch flipped by the first robot does the
  holding. Running robots together waits for the game loop of creation mode.
- **Changing the blueprint changes every robot** without a separate card:
  there is one program, and every robot runs it.
- **No backpacks on the team.** Robots are built with their own values, the
  constructor's arguments; days and teams are not combined yet.

## Build step 12, part five: The notebook (2026-11-11)

The records pack, **The notebook** (`content/packs/forest-notebook`), ten
levels with its introduction, "Records": a crate's record holds its number
and whether it has the key, and the robot opens a lock with `crate.number`.

### What is built

- **Records.** A memory slot can be a record (`"kind": "record"`) or a list
  of records (`"of": "record"`), with a shape: a type name and one to four
  fields, each a number, a yes/no or a direction
  (`"shape": "Crate", "fields": { "number": "number", "key": "yesNo" }`).
  Every record of a shape has exactly its fields; the parser and validator
  reject one with a field missing or extra, as TypeScript would.
- **Reading fields.** Set can read a field, `field:crate.number`, printed
  `crate.number` and read aloud as "crate's number". If and Repeat until can
  test one, `slot:crate.key=yes`, printed `if (crate.key)`. Reading a field
  a record lacks stops the run with a message, in case a record ever comes
  without one. For each walks a list of records into a record slot of the
  same shape, and `item:spots@k` sets a record slot from a list by index.
- **The code** declares each shape once as an interface (`interface Crate {
  number: number; key: boolean; }`) and types the slots with it
  (`let crates: Crate[] = [...]`).
- **On screen** the memory card draws a record as its fields in a row
  ("number 2 · key yes"), a list of records as one row per record with its
  index, and tags each slot with its shape ("list of Crate"). The Set menu
  offers each field of the right kind.
- **Validator.** Fields read and tested must be fields of the record, of the
  kind the card needs; For each and items keep shapes apart. The records
  introduction must read a field.
- **The pack.** Read the record (model), The right field (two numbers, pick
  by name), Follow the sign (a row and a column, in the order a rock
  allows), Find the key (search a list of records), Fix the search (debug:
  the If checks the wrong field), How many keys? (model), Cards in order, Go
  to the crate, Where will it stop? and Two notebooks (find the key crate's
  number, use it as an index into a second list, and go to that spot's
  column, under a budget).

### Deviations and choices

- **Labels and colours are not fields.** Fields are numbers, yes/noes and
  directions, the kinds the robot already has; a crate's label is its
  number.
- **The missing-field puzzle is the validator's.** The plan's "a crate
  missing a field breaks the search" cannot be a solvable level once every
  record must match its shape, so the shape check lives where TypeScript
  puts it, before the run, and the run's message stays as a safety net.
- **Two lists are joined by index.** A check compares a field with a
  written value, not with another slot, so Two notebooks joins the lists by
  using the crate number as an index into the second list.
- **Records are read, not built.** The notebook is given, like the lists of
  In a row were at first; building records waits for creation mode.

## Build step 12, part four: Overnight (2026-11-11)

The persistence pack, **Overnight** (`content/packs/forest-overnight`), ten
levels with its introduction, "Save it": a day counter in the backpack opens
a gate on the second morning.

### What is built

- **Levels of several days.** A level may set `days` (2 to 5). The program
  runs once a day on the same board, in one trace: at the end of each day a
  `night` event (node id `night`) takes the robot back to the start, puts
  the acorns back, resets the gates and starts memory again. `SimState.day`
  counts the days from 1. Every day must end without a bump or an error;
  only the last day is checked against the objective. The runtime contract
  carries `days` beside `input` and `seed`.
- **The backpack.** A memory slot may be marked `keep: true` (`"keep": true`
  in a spec): it holds last night's value each morning instead of its start.
  It prints as `let total: number = backpack.load('total', 0);`, and the
  program ends with a `robot.on('night', ...)` handler that saves each kept
  slot, so the code shows what persistence is: load in the morning, save at
  night. The memory card and the Memory chips mark kept slots with a
  backpack, and the memory card gains a Day line ("Day 2 of 3").
- **On the board** night is a "zzz…" bubble, then the board snaps to the
  morning and the bubble says "Day 2". The message says which day is
  running, and which day a run went wrong on.
- **Validator.** A level of several days has no shuffles; a kept slot needs
  a level of several days; memoryOptions match on the backpack too. The
  persistence introduction must keep a slot overnight.
- **The pack.** The backpack (model: total is kept, today is not), Pack the
  backpack (choose the one slot that lasts), Third morning (count the days
  to open a lock), Fix the save (debug: the When card adds to the slot that
  is forgotten), What wakes up? (model: acorns held start again, the
  backpack does not), A list that grows (a diary of one line a day), Cards
  in order, Where will it stop? (Go to column with a day counter), Not in
  the backpack (a count that must start again each morning) and Three days
  (two kept slots, two locks, under a budget).

### Deviations and choices

- **The same board every day.** The plan's `persistAcross` let days differ.
  Here every morning is the same forest, so the backpack is the only thing
  that can make day 3 differ from day 1; that is the idea being taught.
  Locks that want more than one day can give are what force the backpack.
- **Only the last day is judged.** Earlier days must end safely (an If
  stops the robot at a shut gate), since one program cannot reach a flag
  behind a lock that opens only on day 3.
- **IndexedDB is not used.** The backpack lives in the run's state; saving
  a child's creations between sessions waits for creation mode.

## Build step 12, part three: Two scoreboards (2026-11-11)

The stored vs. derived pack, **Two scoreboards** (`content/packs/forest-scoreboards`),
ten levels with its introduction, "Work it out": the old way keeps a
`left` counter in step by hand, the new way reads it off the board right
before the lock.

### What is built

- **A new reading: acorns left on the board.** Set can read `acornsLeft`,
  how many acorns are still lying on the board, beside `acorns`, how many
  the robot holds. It prints as `robot.acornsLeft()`. Together they are the
  pack's two scoreboards: a value kept by hand next to one worked out from
  the world.
- **The pack.** Two scoreboards (model: held is kept up to date, left
  never is), Keep both up to date (the hand-kept way, before the bird: two
  cards in the When card, and both slots checked at the flag; moved ahead
  of the bird's level on 2026-11-11 so it no longer reads as a step back),
  Read it when you need it (ask the bird just before the lock), Ask the right one (debug: right before
  the lock the robot looks in its pocket instead of asking the bird; it
  replaced Fix the copy on 2026-11-11, which asked the bird at the start and
  then counted down by hand, mixing the two habits the pack contrasts), How many in the bag? (a separate count beside a list; read
  its length instead), Which one is wrong? (model: a guessed count against
  one read from what the robot holds), Cards in order, Stop at the last
  acorn (walk until none are left, on three shuffles), Where will it stop?
  and One scoreboard (one slot, two locks that want different numbers,
  under a budget).
- **The introduction check** for `derived` asks that the demo set a slot
  from a reading of the world, not a typed value.

### Deviations and choices

- **The plan's debug level is spread over three.** "Two stored values
  disagree, delete one and calculate it" needs a level to see them
  disagree (Two scoreboards), one to fix a value read from the wrong place (Ask the right one) and
  one where a single slot replaces both (One scoreboard). A debug level
  changes one card, and deleting a slot is not a card.

## Change: the map as a journey of islands (2026-11-10)

The map was one long scroll of identical trails. It is now a journey, one
island at a time (`src/app/MapScreen.tsx`, `#/map/<pack id>`):

- **Each island has its own look** (`src/app/mapThemes.tsx`): a sky and
  ground, a landmark at the top of its trail (a meadow, pine woods, a
  windmill for Around and around, cliffs for Look before you leap, a
  village, a castle for Flip the switch, a temple of plates, a remote
  control lab, a clock tower on the river for Tick tock, a library, a
  market, a lighthouse and crates for In a row, a map room, a carnival),
  and scenery down the sides of its trail. Windmill sails, the clock's hand
  and the big wheel turn; they stop for reduced motion.
- **Each island has its own way on.** At the end of the trail a big button
  travels to the next island in the island's style: walk the path, cross
  the log bridge, roll down the hill, take the rope bridge, climb the
  stairs, go through the castle gate, ride the lift, drive the remote cart,
  sail down the river, float in the balloon, ride the market wagon, take
  the ferry, fly the kite. The next island slides in. When it is not
  reached yet, the button says which island to finish first; the last
  island says more are on the way.
- **A strip of islands** across the top, each a small sky-and-ground dot
  with its number, jumps anywhere, marks the one on screen and rings the
  finished ones. A back link at the top returns to the island before.
- The map opens on the island being played, scrolled to its stone, as
  before. Themes are presentation only, keyed by pack id; a pack without one
  borrows a theme by its place on the map.

## Change: memory beside the program, and lists that are built (2026-11-10)

Play-testing feedback: the route list in the first list level sat on the
memory card under the board, far from the cards that use it; walking a
ready-made list of directions was a hard first list; and lists are more
than going through one somebody else wrote.

- **The memory card lives in the Program panel**, at the top, above the
  cards that read and change it (with the key script, when there is one),
  on every level and in the introductions. Each of the robot's slots shows
  its kind beside its name ("route list of directions"). The Memory chips
  with Remember and Forget now appear only on levels that offer slots to
  choose from, so a slot is never listed twice. The Every tick strip stays
  under the board: it describes the world, not the program.
- **Lists can be built.** A new card, Add to list, puts a value on the end
  of a list slot (`route.push(robot.facing())`), and Set can read how many
  items a list holds (`length:<list>`, printed `route.length`). The
  validator checks that what goes on a list is of the list's kind.
- **In a row builds before it reads.** A list grows (model: the robot
  writes down what it sees at each tile; how long is the list?), Write down
  the route (a loop records each way walked; the level is solved only when
  the list says right, right, down, down), then Follow the list and Walk
  the list read a route list, the crate levels go through a list of
  yes/noes, and A bag of acorns collects with a When card and opens a lock
  with the bag's length. The introduction now shows a list growing. Three
  levels were retired to make room: What is the count?, A long route
  (merged into Walk the list) and Cards in order; the first five levels
  were renumbered, so earlier stars on In a row are not shown.

## Change: Two things to remember is about what, Keep count about change (2026-11-10)

The memory pack also counted (a counter for a number lock in four levels),
so it repeated Keep count and left little room for its own idea. Now the
two packs split cleanly:

- **Two things to remember** (representation and kinds of values) is about
  *what* to remember and *what kind* it is: a slot is filled in once, from
  what the robot reads at that moment, and keeps it while the robot moves
  on. Read the card asks for a direction remembered before a turn; Back to
  the start remembers a place and walks round a pond until it is there
  again; Fix the snapshot has a yes/no filled in from the wrong sense; Cards
  in order is the face-the-way-back program; The whole card fills in a
  direction, a number, a yes/no and a place at different moments; Only two
  pairs a direction with a number read from the acorns held. No Add card
  appears anywhere in the pack, and the introduction remembers a sense and
  the acorns held instead of counting.
- **Keep count** (variables) is the only pack where a slot changes over and
  over: adding and taking away, counters run by When cards, and loops that
  stop on a value.

Two level ids were retired with the counting levels: m02-count-the-steps
and m05-fix-the-count (replaced by m02-back-to-the-start and
m05-fix-the-snapshot). Saved stars on them are kept but no longer shown.

## Change: counting is a card, not a side effect of moving (2026-11-10)

Play-testing feedback: Count the steps and its neighbours paired every
Forward with an Add (Forward, Add, Forward, Add...), which reads as if
stepping did the counting and the Add had to follow the Forward. Neither is
true: memory changes only when a card changes it, and an Add counts the same
before a step as after it. The levels now say that instead:

- **Read the card** opens on three steps and a single Add, and asks how
  much steps holds: one, not three.
- **Counting comes from a loop.** Count the steps, Count down and Only two
  walk to the gate in a Repeat until with one Add inside (a quota of one
  Add card rules out writing them out by hand). The Add works before or
  after the Forward, and the hint says so; Cards in order invites trying
  both.
- **Fix the count** is now about changing the right slot: the loop adds to
  turns, so steps stays 0 and the lock stays shut.
- **The whole card**, **Follow the numbers** and the pack's introduction
  put their Add cards away from the steps, so the count is read from the
  cards, not from the walking. Counting by events (the acorn When card)
  stays in Keep count.

## Change: showing what each mover does on a tick (2026-11-10)

Play-testing feedback: Tick tock never showed how each log or beetle
answers a tick, so by Three lanes, where the logs move at different speeds,
the idea of each thing acting in its own way on the same tick was still
foreign. Now the pattern is on screen before anything moves:

- **On the board** each mover's round is a dotted track, and a dashed
  outline with an arrow marks the tile it moves to on the next tick (none
  when it stays put). When there is more than one of a kind, each carries
  its number.
- **The Every tick strip** under the board (`src/app/TickRules.tsx`) has a
  row per mover spelling out its round, tick by tick: arrows for steps, a
  dot for a pause, then round again. A slow log reads `• ↑ • ↓`, a fast one
  `↑ ↓`. The move the next tick will make is ringed; while a tick plays, the
  moves being made light up in every row at once, beside a tick counter.
- **The levels say so.** The introduction now shows two logs, one moving
  every tick and one every other tick. A new level, Fast and slow, replaces
  Cards in order (a reorder of four cards that taught little) so different
  speeds are met before Three lanes, and Two rivers and Three lanes point at
  the outline and the strip.

## Counting from 0 (2026-11-11)

Real lists count from 0, and so does the coordinate plane children meet in
4th grade, so every number the robot shows now does too.

- **Places and boards.** The memory card says "column 0, row 0" for the top
  left tile; the numbers round a board start at 0; Go to row 0 is the top
  row. Two things to remember, the first pack with places as values, says
  so in its introduction.
- **List items by index.** Set can read one item of a list, `item:route@0`,
  by a number or a number slot, printed `route[0]`. An index past the end
  stops the run with "route has no item 3: its items are 0 to 2". The
  memory card shows a list as its items with each index underneath, and a
  grid with its row and column numbers. Items only appear in a Set card's
  menu where a level offers them.
- **In a row** gains three levels after Walk the list: Item 0 is first
  (model), One past the end (debug: the off-by-one) and Step by index (walk
  a list with a counter from 0, stopping at its length).
- **Grids print as real indexing.** `walls[spot.y][spot.x]`, row first:
  a grid is a list of rows. The `at()` and `put()` helpers are gone.
- **The finger is drawn on the board.** On levels with Move finger, each
  place slot shows as a purple hand on the tile it points at, moving as the
  run plays. Reading the map now ramps up to it: Point at it (move the
  finger onto an acorn), Point and look (read the map under it), Look
  before you go (one read and an If, on two shuffles), then Gap in the wall.
- **Mark gets its own level.** Number the tiles writes each tile's column
  onto a grid before Minesweeper uses Mark. Minesweeper now explains the
  game and starts with the loop that counts the rock above each tile; the
  child adds the tile below and the Mark.
- **Set offers only slots it can fill.** Grids and slots with nothing on
  offer are left out, and a new Set card starts on one it can fill.
- **Run plays every shuffle.** On a shuffled level, Run plays the program
  on the board on screen, then repaints the board for each other version
  and plays it there too, until one fails; the message names the shuffle
  ("Shuffle 3 of 3: Clunk! ..."). Stars come once all have played. This
  replaces the silent check and the glowing Shuffle button, which left the
  child to go and find the failing version. Random levels still check
  their 48 rolls quietly; playing them all would take minutes.

## Play-test rework: randomness and coordinates (2026-11-10)

Two packs rebuilt after play-testing. Shuffled boards taught a child to
*react* to randomness; the point is to *use* a random generator. And the
grid pack mostly showed coordinates more clearly without new learning.
Randomness now comes first (order 12), then Reading the map (order 13).

### What is built

- **A seeded random generator.** The robot carries a generator
  (mulberry32) in its state, seeded per run. Random sources for Set and Add
  to list: `random:1-6` (a whole number in a range), `coin` (yes or no),
  `randomWay` (up, right, down or left) and `pick:<list>` (a random item of
  a list). They print as `random(1, 6)`, `coinFlip()`,
  `randomDirection()` and `pick(ways)`. The same seed gives the same rolls,
  so every run can be replayed.
- **Outcomes.** `objective.covers: { of, values }` names a slot (or
  `column`, the robot's column from 0) and the outcomes a level wants.
  Every run must end on one of them, and across many runs each must turn
  up. "Set roll to 6" fails because 1 to 5 never come out; "random 1 to 8"
  fails because a 7 is not a die.
- **Checking a random level.** Each Run rolls a fresh seed. After a
  successful run the app runs the program on 48 fixed seeds (times every
  shuffle); a failing seed is replayed on the next Run, and outcomes no
  seed gave are named ("I ran it 48 times, and roll never came out as 6").
  The validator runs the same checks on the reference solution.
- **Go to row, Go to column.** Coordinates as moves: the robot turns to
  face the way and walks straight to a row or column, counted from 0 like
  the numbers round the board. The number is on the card or comes from a
  number slot, so a counter can be a row. Rocks still stop it; a row off
  the board is an error. Printed `robot.goToRow(3)`.
- **A finger on the map.** Move finger moves a position slot one tile
  (`spot.x += 1`) while the robot stays put, so a program can scan the map.
  A grid slot can start as a copy of the board: `board:walls` or
  `board:acorns`, printed `robot.map('walls')`, so maps follow shuffles.
- **Packs.** Never the same twice: Roll the die, Flip a coin, The spinner
  (pick the right range), Random steps (roll, then count down), Heads or
  tails (a coin decides the way), Pick a way (build a list, pick from it),
  Over or under (a coin picks one of two routes, both reach the flag), Try
  every code (counting up beats guessing: at most four tries, on shuffled
  codes) and Dice race. Every random choice is made once and every outcome
  ends in a few steps: no level waits on a lucky streak, since a child
  cannot tell whether a long random run will ever finish. Reading the map: Go to
  column, Row and column, Which way first, Stepping stones, Every other
  column (a slot as the column), Mow the field (a slot as the row, on
  shuffled acorns), Point and look (model: the finger), Gap in the wall
  (scan the map down a column for the gap), Count the acorns (nested loops
  scanning a shuffled map) and Minesweeper.
- Levels that do not ask for the flag hide it. The introduction plays Over
  or under, taking a different route on different loops.

### Deviations and choices

- **Fixed check seeds.** 48 seeds, the same every time, so a level's
  verdict never flickers; a child's own Run uses a fresh seed.
- **A grid's items are not iterated.** For each still walks lists; rows
  and columns are walked with counters and the finger, which is the idea
  the pack teaches.

## Build step 12, part two: grids and randomness (2026-11-09)

The next two packs of step 12: **Reading the map** (2D grids) and **Never
the same twice** (randomness), ten levels each, each with its introduction.

### What is built

- **Grid slots.** A memory slot can be a grid: rows of numbers, yes/noes or
  directions, the board's size, read like the board (row first). It prints
  as `boolean[][]` or `number[][]`. Set can read a grid at the robot's tile,
  the tile ahead, or a remembered place: `read:walls@ahead`, printed
  `at(walls, robot.ahead())`. Off the grid there is nothing: no, or 0.
- **Mark** writes a slot's value into a grid at the same three places,
  printed `put(counts, robot.position(), n)`.
- **An answer in memory.** `objective.memory` lists slots and the values
  they must end with, so a level can ask for a worked-out grid (the
  minesweeper counts) as well as the flag. A run that reaches the flag with
  the wrong answer is incomplete, and the message names the slots.
- **On screen:** a board read as a grid shows row and column numbers
  around it (from 1, like the memory card's "column 2, row 1"); a grid slot
  on the memory card is a small table with the robot's tile ringed.
- **Shuffles.** A level may list `shuffles`: other versions of its board,
  each written as only what changes (rows, the flag, acorns, gates) over the
  main board. The level opens on a random version. Shuffle puts out another
  one; after a run that worked on one version but not all, Shuffle glows and
  goes straight to a version it misses. A level is solved only when one
  program solves every version: after a successful run, the app runs the
  program on the others before giving stars. The log records each shuffle
  and each check.
- **Validator.** Every version must be a valid board of the main board's
  size and different from the others. The reference solution must solve
  every version; a run or predict starter must too; a debug or build
  starter must fail on at least one. Grid starts must be the board's size,
  and a memory objective must name the solution's slots with values of
  their kinds. The flat-program warning ignores shuffled levels, since a
  flat program cannot follow a board that changes.
- **The introductions.** Reading the map: a robot reads the map before
  each step and turns at rocks. Never the same twice: one program plays on
  three versions of a board in turn, under "Shuffle 1 of 3, same program".
- **The packs.** Reading the map: Read the map (model), Read before you
  step (senses switched off; the map is the only way to see), Count around
  (model), The rock lock, Fix the read (debug), Leave a trail (Mark),
  Cards in order, How many touch?, Where will it stop? and Minesweeper
  (count the rocks above and below each tile of a row and mark them, under
  a budget). Never the same twice: How many acorns? (model), Any length, A
  rock somewhere, Count them (model), Fix it for every shuffle (debug),
  Left or right, Cards in order, Gate or not (the gate senses finally
  taught: press the switch only when the gate is shut), Where will it stop?
  and Any maze (a wall-follower on three mazes, under a budget).

### Deviations and choices

- **Shuffles are listed, not generated.** The plan says seeded randomness
  with checks across many seeds. A level lists its versions instead, a
  handful each, so every one is written, validated and replayable, and a
  child sees exactly the version that failed. A seed that generates boards
  can come later behind the same `shuffles` list.
- **Reshuffle on the Shuffle button, not on every Run.** Reshuffling on Run
  would move the board under a child predicting or building for it. Run
  plays the version on screen; Shuffle changes it.
- **Grids count from 1 on screen** (superseded 2026-11-11: everything now
  counts from 0). The numbers around the board and the
  memory card count from 1; the code hides indexing behind `at()` and
  `put()`, so TypeScript's 0-based arrays never show.
- **The map is not the board.** A grid slot is the robot's notebook of the
  board, given by the level. Reading the map instead of looking only
  matters where the level turns the senses off, as Read before you step
  does.

## Build step 12, part one: memory, variables and lists (2026-11-09)

The first three packs of step 12: **Two things to remember**
(representation and kinds of values), **Keep count** (variables) and **In a
row** (lists), ten levels each, each with its introduction.

### What is built

- **The robot's memory** (`ProgramIR.memory`). A program declares named,
  typed slots: number, yes/no, direction, position, or a list of numbers,
  yes/noes or directions, each with a start value. Specs write one as
  `{ "remember": "count", "kind": "number", "start": 0 }` at the top. They
  print as `let count: number = 0;` before `main`, with `Direction` and
  `Position` imported when used, so the type of each slot is in the code.
  `SimState.memory` holds the values; traces, loop checks and the memory
  card all read them.
- **Memory cards.** Set puts a value in a slot: a literal, or a reading of
  the world right now (the way the robot faces, where it is, the acorns it
  holds, or a sense's yes or no). Add changes a number by +1 or −1 (a level
  file may use up to 9). Face turns the robot to a stored direction in one
  action. Unlock tries a gate's number lock (`gate.code`, shown on the gate)
  with a number slot. For each is a block that walks a list slot, putting
  each item in another slot; its `loop` events carry the item. If and
  Repeat until can test a slot: `slot:count=3`, `slot:found=yes`,
  `slot:way=E`, `slot:spot=here`.
- **The memory budget.** A level may offer `memoryOptions` and a
  `maxMemory`. The program panel opens with a Memory section: the kept
  slots as typed chips, a Remember picker for the options (shut when memory
  is full), and a Forget button on slots no card uses. Without options the
  level's slots are fixed. `allowedSources` limits what Set may put in, so
  a level can make the child count instead of typing the answer.
- **Kinds are enforced.** Each card's pickers offer only slots of the kind
  it needs, and Set offers only values that fit the chosen slot. The
  validator checks every card in the starter and the solution against the
  slots' kinds, the budget, and the options.
- **The memory card** lists the robot's slots after the world's lines, in
  blue with the slot name in code type; lists show their items. Model
  levels can ask for number, yes/no and direction slots (`slot:<name>`).
- **On the board:** a gate with a number lock shows its code on the bars;
  the robot's bubble says what went into a slot ("steps = 2") and how a
  lock answered ("click!" or "wrong number"); Face turns the shortest way.
- **The packs.** Two things to remember: Read the card (model), Count the
  steps, What kind? (model), Face the way, Fix the count (debug), Cards in
  order, The whole card (model), Acorns held, Where will it stop? and Only
  two (four slots on offer, room for two, under a card budget). Keep
  count: Acorn counter (model), Three-acorn gate, Count down, Follow the
  numbers (model), Fix the counter (debug), Four steps, Cards in order,
  Found it, Where will it stop? and Count and go. In a row: Follow the
  list, Walk the list, Count the crates, What is the count? (model), Fix
  the check (debug), A long route, Cards in order, The first acorn, Where
  will it stop? and Count and open.
- **The validator's flat-program warning respects quotas.** A flat program
  that needs more of a card than the level allows is no way round a loop,
  so it no longer counts against a level.

### Deviations and choices

- **Keep count, not Into the dark.** The plan's variables pack centres on
  dark tiles the robot must remember. On one fixed board the child can see
  where every tile is, so remembering it teaches nothing the board does not
  already show. The pack counts instead (acorns, steps, a countdown, a
  found-it flag), which variables are for, and dark tiles wait for boards
  that change every run, where memory is the only way to know.
- **One board still, so budgets and quotas do the forcing.** A single
  board can always be solved by hand. Card budgets, per-card quotas (one
  Forward for a nine-step route) and `allowedSources` (no typing the
  number) make the slot, the loop or the list the only way through.
- **Lists are given, not built.** Every list starts with its items, as the
  robot's notebook. Adding to a list waits for a pack that needs it.
- **No crates on the board yet.** In a row's crates live in the list, shown
  on the memory card, not as boxes on the board.
- **Kinds are not asked separately.** The plan's predict levels ask for a
  slot's kind before its value; the memory card shows each slot's kind as
  an icon, so model levels ask only for the value.
- **The slot names are the level's.** As with functions and When cards,
  the child picks among slots the level offers rather than naming new ones.

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
  the script as `input`. A strip of key caps at the top of the Program
  panel, just above the When cards it drives, lights the press playing now
  and fades the ones played. (It sat under the board at first; moved
  2026-11-10 so the keys and their cards are read together.)
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
