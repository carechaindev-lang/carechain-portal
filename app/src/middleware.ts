import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export default async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const url = new URL(request.url);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in: send to the right auth screen
  if (!user) {
    if (url.pathname.startsWith("/hospital")) {
      return NextResponse.redirect(new URL("/auth/admin", request.url));
    }
    return supabaseResponse; // keep any cookie ops
  }

  // Look up roles via your domain tables
  const { data: adminRow } = await supabase
    .from("admin")
    .select("id")
    .eq("admin_id", user.id)
    .maybeSingle();

  // Guard admin-only (hospital) routes
  if (url.pathname.startsWith("/hospital")) {
    if (!adminRow) {
      return NextResponse.redirect(new URL("/hospital/dashboard", request.url));
    }
  }
  return supabaseResponse;
}

export const config = {
  matcher: ["/hospital/:path*"],
};
