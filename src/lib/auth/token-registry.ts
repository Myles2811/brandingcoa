type BearerTokenProvider = () => Promise<string | null>;

let bearerTokenProvider: BearerTokenProvider | null = null;

export function registerBearerTokenProvider(provider: BearerTokenProvider | null) {
  bearerTokenProvider = provider;
}

export async function getBearerAuthHeaders() {
  const token = await bearerTokenProvider?.();

  if (!token) {
    return {} as Record<string, string>;
  }

  return {
    Authorization: `Bearer ${token}`,
  } as Record<string, string>;
}
