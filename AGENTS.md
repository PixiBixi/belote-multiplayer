# belote-multiplayer

Online belote for four seats, humans or bots. TypeScript monorepo, server-authoritative,
self-hosted for a small group.

## Architecture

One dependency direction, five pieces: `packages/engine` (pure rules, no I/O) ->
`packages/protocol` (wire contract: views, events, Zod schemas) -> `apps/server`
(Fastify + Socket.IO, rooms, timers, the only place holding state) -> `apps/web`
(Vite + React client, renders what it is given and emits intents) -> `e2e/`
(Playwright against a real server). Engine knows nothing of protocol, protocol
knows nothing of the server, and the client knows no rules; breaking that
direction is worth a second look.

## Commands

```bash
npm run verify              # lint + typecheck + unit tests, before every commit
npm run build                # once, so the server has dist/ to run
npm start -w @belote/server     # API and WebSockets on http://localhost:5050
npm run dev -w @belote/web      # client with hot reload on http://localhost:5173
npm run watch                # tsc --build --watch, keep running while editing server code
npx vitest run <path>        # a single test file
npx vitest run -t <name>     # a single test by name
npm run e2e                  # Playwright against a real build
npm run e2e -- <spec>        # a single e2e spec
```

Deploying: `docker compose up --build` builds and runs the image locally. `compose.traefik.yaml` is the reverse-proxy variant and carries
the optional `coturn` service. One replica, always: state lives in memory, so a
second process would hold half the rooms and never know about the other.

## Ground rules for working here

- **Code, comments and commit messages in English.** Conversation may be in French.
- **`npm run verify` before every commit** - lint, typecheck and unit tests. Check
  the exit code; piping to `tail` swallows it, which has hidden a broken typecheck
  in a commit before.
- **`verify` and the pre-commit hook cover opposite gaps; neither replaces the
  other.** CI lint runs `format:check` and `build`, which `verify` does not, so an
  unformatted file used to pass locally and fail CI. `.pre-commit-config.yaml` runs
  Prettier and ESLint on the staged files to close that. It deliberately does not
  run typecheck or build, which cannot be scoped to staged files, so `verify` is
  still the thing that catches those.
- **Conventional Commits, one commit per scope.** Do not bundle unrelated changes.
- Avoid backticks in commit messages written inline in a shell - they get executed
  as command substitution. Use `git commit -F <file>`.

## The invariants worth protecting

- `packages/engine` is **pure**: no I/O, no networking, no dependencies. It is what
  makes the rules testable, replayable, and reusable in a browser.
- **The client knows no rules.** The server ships `legalMoves` inside each view; the
  client renders and emits intents. Cheating is structurally impossible because
  opponents' hands never cross the wire.
- **`Room` is synchronous and timer-free.** Timers live in `RoomManager` behind an
  injectable interface, along with the clock source, so tests never wait.
- **Member seat number == engine seat index.** Scores and statistics are indexed by
  seat; breaking this has already cost a player their entire view of a game.

## Traps that have already cost time here

- Testing both ends of a chain proves nothing about the wire between them. A new
  client action needs a protocol type, a Zod schema, a `socket.on` handler **and**
  the client emit - the handler is the piece that gets forgotten.
- Judge layout by measuring geometry or computed styles in a real browser, not by
  reading a screenshot, and sample after transitions settle.
- A stale `dist/` means a new client talking to an old server.
- **The server lists `STATIC_ROOT` once, at startup** (`wildcard: false`). After a
  rebuild the new hashed assets fall through to `index.html`, served as `text/html`,
  and the page is blank. Restart the server after every `npm run build`.
- Teams are `seat % 2` and play turns counter-clockwise: the next seat sits on the
  right. `lib/seats.ts` owns that mapping; do not recompute it in a component.
- **A user-facing string goes in `fr.ts` first**: it is the reference catalogue and
  defines the type, so the compiler then demands it in `en.ts`. `no-english.test.ts`
  is what catches a literal left in the component itself.
- **coturn starts as an unauthenticated open relay when it cannot read its config.**
  It logs a warning and carries on, and the image runs as `nobody` (uid 65534), so a
  root-owned `600` config publishes a relay to the internet. Empty `docker logs` is
  not health: verify `ss -lunp | grep turnserver` lists the public IP alone and that
  an unauthenticated ALLOCATE is refused with 401.
- **`tcpdump` block-buffers its stdout when it is not a tty.** Grepping the file
  while it runs shows nothing and reads as "the packets never arrived". Use `-U`.
