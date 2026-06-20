import { Ratelimit } from "npm:@upstash/ratelimit@2";
import { Redis } from "npm:@upstash/redis@1";

const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL")!,
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!,
});

const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, max: number, windowSec: number): Ratelimit {
  const key = `${prefix}:${max}:${windowSec}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `ratelimit:${prefix}`,
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

export type RateLimitConfig = {
  prefix: string;
  max: number;
  windowSec: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

export function getIdentifier(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || "unknown";
  return `ip:${ip}`;
}

export async function checkRateLimit(
  identifier: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  try {
    const limiter = getLimiter(cfg.prefix, cfg.max, cfg.windowSec);
    const r = await limiter.limit(identifier);
    return { allowed: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  } catch (err) {
    console.error("[rate-limit] Redis indisponible, fail-open:", err);
    return {
      allowed: true,
      limit: cfg.max,
      remaining: cfg.max,
      reset: Date.now() + cfg.windowSec * 1000,
    };
  }
}

export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(Math.max(0, r.remaining)),
    "X-RateLimit-Reset": String(Math.ceil(r.reset / 1000)),
  };
}

export function tooManyRequests(
  r: RateLimitResult,
  corsHeaders: Record<string, string> = {},
): Response {
  const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: "Trop de requêtes. Réessaie dans un instant.",
      retry_after: retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        ...rateLimitHeaders(r),
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
