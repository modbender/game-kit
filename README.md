# @modbender/game-kit

The layer under the games in `ytgames` that is not the game: host adapters, and
the small utilities every one of them needs.

Extracted rather than designed. Everything here was already written twice, in
two shipping games, and had begun to drift — `debug/log.ts` and `sim/rng.ts`
were byte-identical in both, and the Playables SDK wrapper was 97% the same.
Nothing gets added here on the theory that a future game might want it.

## Design rules

**No native code, and no dependency on any Capacitor plugin.** The Capacitor
CLI does not discover plugins through transitive dependencies, so a game must
list the plugins it uses in its own `package.json` regardless. Depending on them
here would buy nothing and would tax web-only builds with native SDKs they never
load. The Capacitor adapter takes them as optional peer dependencies and imports
them dynamically.

**One subpath export per concern, no barrel.** The primary consumer ships to
YouTube Playables against a per-file size budget, so importing `./log` must not
be able to pull in an ad SDK's types. There is deliberately no root export.

**Capabilities are flags, not exceptions.** A host that cannot show a rewarded
ad reports `hasRewardedAds: false` so the UI never offers one; it does not throw
when asked. Every capability added here follows that shape.

## Layout

```
src/log.ts   gated logging: a factory instance per consumer, a closure per message, zero cost when off
src/rng.ts   seeded rng - mulberry32, hashString, pick, randInt, pickWeighted
```

`log.ts` exports `createLogger(categories, options?)` rather than a module-level
singleton, so each game builds its own instance from its own category list and
the two never share debug state:

```ts
import { createLogger } from '@modbender/game-kit/log'

const { log, isDebug, setDebug, createPerfHud } = createLogger([
  'sim',
  'render',
  'feel',
  'audio',
  'meta',
  'platform',
  'ui',
])

log('render', () => `fleet variety ${n}`)
```

`categories` is a `readonly string[]` literal — no `as const` needed, the
generic infers the literal union so `log`'s first argument is typed to exactly
that game's categories. `options.debugParam` and `options.categoryParam`
rename the URL parameters an instance reads (default `debug` and `logcat`),
for the rare case two loggers need to live on the same page without
colliding.

**`rng.ts` is behaviour-frozen.** Both games derive their levels from seed
strings, so any change to these functions regenerates every board and
invalidates the records players already hold. Treat it as an on-disk format.

## Consuming it

```bash
bun add @modbender/game-kit
```

Consumers pin a caret range on the minor version:

```json
"@modbender/game-kit": "^0.2.0"
```

On a 0.x version that admits patch releases only, which is the right width for
a package holding level-generation code. Treat a minor bump as a change to
level generation until the characterization tests say otherwise.

```bash
bun install
bun run build      # tsc to dist/, ESM plus declarations
bun run typecheck
```
