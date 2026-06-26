const ALLOWED_ORIGINS: string[] = [
  "https://ti-lex-v10.vercel.app",
  "https://ceauprevost812-3889s-projects.vercel.app",
  "https://ti-lex-al.vercel.app",
  "https://ti-lex-al.com",
  "https://www.ti-lex-al.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const ALLOW_VERCEL_PREVIEWS = true;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOW_VERCEL_PREVIEWS) {
    try {
      const host = new URL(origin).hostname;
      if (host === "vercel.app" || host.endsWith(".vercel.app")) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-anthropic-key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin!;
  }
  return headers;
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}
