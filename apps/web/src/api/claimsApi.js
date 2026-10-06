/**
 * Tiny API client. Relative URLs — Vite proxies /api to NestJS in dev,
 * and in production the SPA is served behind the same gateway as the API.
 */
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    // Nest returns { message: string | string[] } for validation errors.
    const msg = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    throw new Error(msg || `Request failed with status ${res.status}`);
  }
  return body;
}

export const claimsApi = {
  assess: (payload) => request('/claims/assess', { method: 'POST', body: JSON.stringify(payload) }),
  recent: (limit = 8) => request(`/claims?limit=${limit}`),
  health: () => request('/health'),
};
