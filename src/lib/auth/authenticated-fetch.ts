import { getBearerAuthHeaders } from "./token-registry";

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const bearerHeaders = await getBearerAuthHeaders();

  for (const [key, value] of Object.entries(bearerHeaders)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
