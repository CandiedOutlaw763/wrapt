/**
 * fetch that retries network failures ("fetch failed", resets) and gateway timeouts a
 * couple of times. Other HTTP errors are returned as-is for the caller to handle.
 */
export async function fetchRetry(url: string, init?: RequestInit, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < tries) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}
