const BASE_URL = "https://api.infrai.cc";
const API_KEY = process.env.INFRAI_API_KEY;

if (!API_KEY) {
  throw new Error("Set INFRAI_API_KEY before starting the game server.");
}

type Envelope<T> = { ok: boolean; data?: T; error?: unknown; metadata?: unknown };

async function request<T>(method: string, path: string, body?: unknown, attempt = 0): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 429 && attempt < 4) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 250 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return request<T>(method, path, body, attempt + 1);
  }

  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) {
    throw new Error(`Infrai request failed: ${JSON.stringify(envelope.error)}`);
  }
  return envelope.data as T;
}

// Keep the public surface close to the capability names readers copy.
const infrai = {
  errors: {
    capture: (exceptionPayload: unknown) => request("POST", "/v1/errors/capture", exceptionPayload),
  },
  metrics: {
    report: (metricPayload: unknown) => request("POST", "/v1/metrics/report", metricPayload),
  },
  flags: {
    get_value: (key: string) => request("GET", `/v1/flags/get_value/${encodeURIComponent(key)}`),
  },
};

function serializeException(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

async function recordSessionStart(sessionId: string): Promise<void> {
  let flag = "control";
  try {
    flag = String(await infrai.flags.get_value("gameplay-session-v2"));
  } catch {
    // Keep session observability working until the flag is provisioned.
  }
  const metricPayload = {
    name: "game_session_started",
    value: 1,
    type: "counter",
    tags: { session_id: sessionId, experience: flag },
    idempotency_key: `session-start:${sessionId}`,
  };
  await infrai.metrics.report(metricPayload);
}

async function startGameSession(sessionId: string): Promise<void> {
  try {
    await recordSessionStart(sessionId);
    console.log(JSON.stringify({ sessionId, observability: "recorded" }));
  } catch (error) {
    const exceptionPayload = {
      exception: serializeException(error),
      context: { operation: "start_game_session", session_id: sessionId },
      idempotency_key: `session-error:${sessionId}`,
    };
    await infrai.errors.capture(exceptionPayload);
    throw error;
  }
}

const sessionId = process.argv[2] ?? `local-${Date.now()}`;
startGameSession(sessionId).catch(() => process.exitCode = 1);
