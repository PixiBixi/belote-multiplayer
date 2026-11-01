# Belote Multiplayer

Online French belote for four seats, humans or bots, written in TypeScript. The server
owns the state and the rules and sends each player only what that player may see; the
client renders what it is given and never decides anything.

Create a table, share the six-character code or the link, fill the empty seats with
bots, or press **Play against the computer** to get a table with three bots already
seated, where you pick the rules and start. Voice chat runs over a WebRTC mesh and
never touches the server.

## Rules

Two variants, and every table option is set by the host in the lobby.

| Variant | Bidding                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Classic | 5 cards dealt plus a turned card. Round one takes the turned suit, round two any other suit (or AT / SA). |
| Coinche | 8 cards dealt, auction from 80 to 160 then capot (250) and générale (500). Coinche x2, surcoinche x4.     |

| Option                  | Default | Effect                                                                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Tout atout / sans atout | on      | AT and SA are biddable. Both are scored out of 162 like a suit contract.                                                        |
| Vache                   | on      | When everyone passes, the hand is played in sans atout without a taker; each team keeps its points. Off: redeal.                |
| Pisse                   | off     | You may discard instead of trumping when your partner holds the trick.                                                          |
| Must overtrump          | on      | A trump played on a trump must beat it when possible.                                                                           |
| Declarations            | on      | Tierce 20, cinquante 50, cent 100, carrés (J 200, 9 150, A/10/K/Q 100), declared on the first trick. Only the best team scores. |
| Target                  | 1000    | 501, 1000, 1500 or 2000.                                                                                                        |
| Turn clock              | off     | 15, 30 or 60 seconds per move.                                                                                                  |

Always on: belote-rebelote (20, announced automatically), dix de der, capot (250),
dedans (the defence takes 162 plus every declaration) and litige (points held in
reserve for the next hand).

Bots come in three levels: easy plays a random legal move, normal and hard bid
from hand strength and play by heuristics.

## Run it locally

**Node 26**, pinned in `.nvmrc`.

```bash
npm install
npm run build                     # once, so the server has dist/ to run
npm start -w @belote/server       # API and WebSockets on http://localhost:5050
```

Second terminal, for the client with hot reload:

```bash
npm run dev -w @belote/web        # http://localhost:5173, proxies /socket.io and /healthz to 5050
```

Set `PORT` when 5050 is taken. Serving the built client from the server instead of
Vite: `STATIC_ROOT=$PWD/apps/web/dist CORS_ORIGIN=http://localhost:5050`.

| Script                 | What it does                                    |
| ---------------------- | ----------------------------------------------- |
| `npm run verify`       | lint, typecheck and unit tests                  |
| `npm run format:check` | Prettier check, run in CI                       |
| `npm run watch`        | `tsc --build --watch` while editing server code |
| `npm run e2e`          | Playwright against a real build                 |

## Deploy it

```bash
docker compose up --build      # then open http://localhost:5050
```

Behind Traefik, `compose.traefik.yaml` is ready to use: replace the hostname, the
cert resolver and the network name, then `docker compose -f compose.traefik.yaml up -d`.
It also carries an optional `coturn` service for players behind a symmetric NAT.

**One replica, always.** Game state lives in memory, so two processes would each
hold half the rooms. A restart drops games in progress.

**Voice chat needs HTTPS.** `getUserMedia` only exists in a secure context;
`localhost` is the only exemption.

## Licence

ISC. See [LICENSE](LICENSE).
