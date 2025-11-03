import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";

// Configuration
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

// Routes protégées et publiques (même chose)
const PROTECTED_PATHS = [
  "/api/:path*",
  "/me/:path*",
  "/cart",
  "/payment",
  "/review-order",
  "/confirmation",
];

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/product",
  "/_next/",
  "/favicon.ico",
  "/images/",
];

const pathCache = new Map();

export async function middleware(req) {
  const path = req.nextUrl.pathname;

  if (!IS_PRODUCTION && DEBUG) {
    console.log("[Middleware] Path:", path);
  }

  // Vérification rapide avec cache
  if (pathCache.has(path)) {
    const cached = pathCache.get(path);
    if (cached === "public") return NextResponse.next();
  }

  // Routes publiques - sortie rapide
  const isPublic = PUBLIC_PATHS.some((publicPath) =>
    path.startsWith(publicPath),
  );
  if (isPublic) {
    pathCache.set(path, "public");
    return NextResponse.next();
  }

  // Vérifier si c'est une route protégée
  const isProtected = PROTECTED_PATHS.some((protectedPath) =>
    path.startsWith(protectedPath),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  try {
    // ✅ VALIDATION COMPLÈTE avec Better Auth (Next.js 15.2.0+)
    const auth = await getAuth();
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      // Pas de session valide - rediriger vers login
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", path);

      const response = NextResponse.redirect(loginUrl);
      response.headers.set("X-Redirect-Reason", "authentication-required");

      return response;
    }

    // Session valide
    const response = NextResponse.next();
    response.headers.set("X-User-Authenticated", "true");
    if (session.user?.id) {
      response.headers.set("X-User-Id", session.user.id);
    }

    return response;
  } catch (error) {
    if (IS_PRODUCTION) {
      console.error("[Middleware] Authentication error:", {
        path,
        error: error.message,
      });
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "auth_error");
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  runtime: "nodejs", // ✅ Requis pour Next.js 15.2.0+
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images|fonts|public).*)",
  ],
};
