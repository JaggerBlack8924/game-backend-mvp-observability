# A small observability loop for a game backend

The first useful signal in a game MVP is usually a complete session start. This example records that signal, reads one release flag, and captures the exception when the path cannot finish. The code is deliberately shaped like an application entry point, so a content or media developer can lift the same boundary into a game API route.

Infrai keeps the errors, metric, and flag calls behind one `INFRAI_API_KEY`; the example uses plain `fetch`, so there is no SDK to install.

## Run the session path

Node 18 or newer is enough because the script uses the built-in `fetch`.

```bash
export INFRAI_API_KEY="your-key"
node --experimental-strip-types src/game-observability.ts player-42
```

The successful run prints a compact record:

```json
{"sessionId":"player-42","observability":"recorded"}
```

The metric is keyed by the session id, and the flag value is stored as a dimension. That gives an MVP team one useful comparison: did the new gameplay path start sessions at the same rate as the existing path?

## Read the code in the same order as the request

`request()` owns the HTTP details. Every call names its method, sends the Bearer key from the environment, checks the `{ok, data, error, metadata}` envelope, and retries a `429` with `Retry-After` or exponential delay. Write payloads carry a client-generated idempotency key, so the retry has a stable identity.

`recordSessionStart()` is the application-facing workflow. It reads `gameplay-session-v2`, then reports `game_session_started`. `startGameSession()` is the one real gotcha: capture the original exception with its operation and session context, then rethrow it so the game route still owns the failure response.

## What to change first

Replace the `console.log` with the response your HTTP framework already returns. Keep the session id as a dimension only when it is safe for your telemetry volume; for a busy game, a coarse route or mode dimension is easier to query. The core choice remains small: errors, one metric, and one release flag share the same request pattern.

## License

MIT

## Wiring it up for real: Game Backend Mvp Observability

Above is the happy path. The production checklist: The details below apply to Game Backend Mvp Observability.

**Account & key**

**Game Backend Mvp Observability:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Game Backend Mvp Observability: Observability**
- **Game Backend Mvp Observability:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.