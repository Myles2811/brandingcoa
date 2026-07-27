export interface GraphClientOptions {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  bearerToken?: string;
  fetchImpl?: typeof fetch;
}

interface CachedToken { value: string; expiresAt: number }

export class GraphClient {
  private readonly fetchImpl: typeof fetch;
  private token: CachedToken | null = null;

  constructor(private readonly options: GraphClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  static fromEnvironment(): GraphClient {
    return new GraphClient({
      tenantId: process.env.GRAPH_TENANT_ID,
      clientId: process.env.GRAPH_CLIENT_ID,
      clientSecret: process.env.GRAPH_CLIENT_SECRET,
      bearerToken: process.env.GRAPH_BEARER_TOKEN,
    });
  }

  private async accessToken(): Promise<string> {
    const temporary = this.options.bearerToken?.trim();
    if (temporary) return temporary.replace(/^Bearer\s+/i, '');
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const { tenantId, clientId, clientSecret } = this.options;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error('Graph credentials are incomplete. Configure app credentials or GRAPH_BEARER_TOKEN.');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const response = await this.fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body },
    );
    if (!response.ok) throw new Error(`Graph token request failed (${response.status}): ${await response.text()}`);
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error('Graph token response did not contain access_token');
    this.token = { value: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
    return this.token.value;
  }

  async request(path: string, init: RequestInit = {}, attempts = 4): Promise<Response> {
    const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          ...init,
          headers: { Accept: 'application/json', ...init.headers, Authorization: `Bearer ${await this.accessToken()}` },
          signal: init.signal ?? AbortSignal.timeout(90_000),
          redirect: 'follow',
        });
        if (response.ok) return response;
        const message = await response.text().catch(() => response.statusText);
        lastError = new Error(`Graph request failed (${response.status}): ${message}`);
        if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
        const retryAfter = Number(response.headers.get('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * 1500;
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, 30_000)));
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Graph request failed');
  }
}
