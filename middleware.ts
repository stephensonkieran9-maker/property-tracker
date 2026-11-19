import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

// The whole site sits behind the login.
// - Admins: everything (board + offers admin).
// - Staff: only /portal and the portal's own API. Anything else sends them to /portal.
// - Signed out: pages go to /login, APIs get 401.

// Reachable without signing in. /api/snapshot is the daily cron (it has its own CRON_SECRET check).
const PUBLIC = ["/login", "/api/portal/login", "/api/portal/logout", "/api/snapshot", "/manifest.webmanifest"];
// Any signed-in portal member; the routes check membership themselves.
const STAFF_OK = ["/portal", "/api/portal"];
// Admin areas that check admin in the route itself.
const SELF_CHECKED = ["/admin", "/api/portal/admin"];

const ROLE_COOKIE = "kp_role";
const ROLE_TTL = 5 * 60; // re-check someone's role at most every 5 minutes

const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export async function middleware(request: NextRequest) {
  // Until Supabase is connected there's no way to sign in, so leave the site as it was.
  if (!isSupabaseConfigured()) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  if (under(pathname, PUBLIC)) return response;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  response.headers.set("Cache-Control", "private, no-store");
  if (under(pathname, STAFF_OK) && !under(pathname, SELF_CHECKED)) return response;
  if (under(pathname, SELF_CHECKED)) return response;

  // Everything else is the board: admins only.
  const { role, cookie } = await roleFor(request, user.id);
  if (cookie) response.cookies.set(ROLE_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ROLE_TTL });
  if (role === "admin") return response;

  if (isApi) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const url = request.nextUrl.clone();
  url.pathname = "/portal";
  url.search = "";
  return NextResponse.redirect(url);
}

/** The person's portal role, using a short-lived signed cookie so board pages stay fast. */
async function roleFor(request: NextRequest, userId: string): Promise<{ role: string | null; cookie?: string }> {
  const secret = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!secret) return { role: null };

  const saved = request.cookies.get(ROLE_COOKIE)?.value;
  if (saved) {
    const [uid, role, exp, sig] = saved.split(".");
    if (uid === userId && Number(exp) > Date.now() / 1000 && sig === (await sign(`${uid}.${role}.${exp}`, secret))) {
      return { role };
    }
  }

  const db = createClient(supabaseUrl, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await db.from("portal_members").select("role, is_active").eq("user_id", userId).maybeSingle();
  const role = data && data.is_active ? String(data.role) : "none";
  const exp = Math.floor(Date.now() / 1000) + ROLE_TTL;
  const body = `${userId}.${role}.${exp}`;
  return { role, cookie: `${body}.${await sign(body, secret)}` };
}

async function sign(text: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const config = {
  // Everything except Next's own files and images/icons.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|css|js)$).*)"],
};
