/**
 * The Airwallex client.
 *
 * One bearer token for everything: accounts, beneficiaries, transfers
 * and payment intents. The token is fetched per call rather than
 * cached — an HTTP function is short-lived, so a cache would only
 * ever hold one token anyway.
 *
 *   sandbox: https://api.sandbox.airwallex.com
 *   live:    https://api.airwallex.com
 */

export const airwallexBase = (): string =>
  process.env.AIRWALLEX_ENV === 'production'
    ? 'https://api.airwallex.com'
    : 'https://api.sandbox.airwallex.com';

/**
 * Whether the rail can actually move money.
 *
 * The placeholder pushed before the real credentials arrive is not a
 * configuration: a seller must not be shown a form that will fail
 * when they fill it in.
 */
export function airwallexConfigured(): boolean {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) return false;
  if (clientId === 'NOT_CONFIGURED' || apiKey === 'NOT_CONFIGURED') return false;
  return true;
}

/**
 * The bearer token, cached.
 *
 * Airwallex's token lasts thirty minutes and the documentation is
 * explicit that the authentication endpoint should not be called
 * before every request. An instance keeps the token in memory and
 * reuses it until it is nearly expired.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * A bearer token for the client API.
 *
 * The key and the client id go in the request HEADERS — `x-api-key` and
 * `x-client-id`. Older documentation showed them in a JSON body, and
 * an account can be issued either an admin key or a scoped key, so
 * both shapes are sent: the headers are what the API documents, and
 * the body is harmless.
 */
export async function airwallexToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;
  if (!clientId || !apiKey) {
    throw new Error('AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY 未設定');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'x-client-id': clientId,
  };
  const bodies = [
    { client_id: clientId, api_key: apiKey, grant_type: 'client_credentials' },
    { client_id: clientId, client_secret: apiKey, grant_type: 'client_credentials' },
  ];

  let lastError = '';
  for (const body of bodies) {
    const res = await fetch(`${airwallexBase()}/api/v1/authentication/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.access_token) {
          const expiresIn = Number(parsed.expires_in ?? 1800);
          cachedToken = {
            token: parsed.access_token as string,
            expiresAt: Date.now() + expiresIn * 1000,
          };
          return cachedToken.token;
        }
      } catch {
        /* fall through to the next shape */
      }
      lastError = '回應冇 access_token';
      continue;
    }
    lastError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
    if (![400, 401, 403].includes(res.status)) break;
  }
  throw new Error(`Airwallex 登入失敗：${lastError}`);
}

export async function airwallexFetch<T = any>(
  path: string,
  body?: unknown,
  method: 'POST' | 'GET' = 'POST',
): Promise<T> {
  const token = await airwallexToken();
  const res = await fetch(`${airwallexBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Airwallex ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Airwallex ${path} 回應唔係 JSON：${text.slice(0, 200)}`);
  }
}
