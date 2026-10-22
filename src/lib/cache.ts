// Tiny TTL cache. Uses Upstash Redis (REST) when configured so the cache
// survives across serverless instances; otherwise falls back to process memory.
// Product search quota is scarce, so every outbound lookup goes through here.

const memory: Map<string, { value: unknown; expires: number }> =
  ((globalThis as Record<string, unknown>).__wraptCache as Map<string, { value: unknown; expires: number }>) ??
  ((globalThis as Record<string, unknown>).__wraptCache = new Map());

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(redisUrl!, {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  if (redisUrl && redisToken) {
    try {
      const hit = await redis(["GET", key]);
      if (typeof hit === "string") return JSON.parse(hit) as T;
    } catch {
      // Cache is best-effort; fall through to a live call.
    }
    const value = await load();
    redis(["SET", key, JSON.stringify(value), "EX", ttlSeconds]).catch(() => {});
    return value;
  }

  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  return value;
}
