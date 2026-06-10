import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PROTECTED_PATHS = ["/dashboard", "/app", "/codex", "/security"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const accessToken =
    req.cookies.get("sb-access-token")?.value ??
    req.cookies.get(
      `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`,
    )?.value;

  if (!accessToken) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    let token = accessToken;
    try {
      const parsed = JSON.parse(accessToken);
      token = parsed.access_token ?? accessToken;
    } catch {}

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }

    const dbAdmin = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await dbAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const plan = profile?.plan ?? "free";

    if (plan === "free") {
      const pricingUrl = req.nextUrl.clone();
      pricingUrl.pathname = "/pricing";
      pricingUrl.searchParams.set("msg", "choose-plan");
      return NextResponse.redirect(pricingUrl);
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*", "/codex/:path*", "/security/:path*"],
};
