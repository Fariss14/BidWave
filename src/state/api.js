export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
export async function api(path, { method = 'GET', body, signal } = {}) {
  const form = typeof FormData !== 'undefined' && body instanceof FormData;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', signal: signal || AbortSignal.timeout(form ? 60000 : 15000),
      headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { 'X-BidWave-Request': '1' }), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach BidWave. Check your connection and try again.', 0);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new ApiError('The account service is unavailable. Start the BidWave backend and try again.', response.status); }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') window.dispatchEvent(new Event('bidwave-session-expired'));
    throw new ApiError(result.error || 'The request could not be completed.', response.status);
  }
  return result;
}
