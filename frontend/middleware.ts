import { NextResponse, type NextRequest } from "next/server";

/**
 * Enterprise Next.js Edge Middleware for Synapse
 * - Injects banking-grade Security Headers (OWASP recommended)
 * - Assigns unique correlation ID (x-request-id) for full-stack request tracing
 * - Provides hook for Auth / Session Guard (Milestone 1)
 */
export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const requestId = request.headers.get("x-request-id") || `req-fe-${crypto.randomUUID().slice(0, 12)}`;

  // Clone response headers
  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  // 1. Correlation & Telemetry Headers
  response.headers.set("x-request-id", requestId);
  response.headers.set("x-response-time", `${Date.now() - startTime}ms`);

  // 2. Enterprise Security Headers (Anti-Clickjacking, Anti-MIME Sniffing, Strict Referrer)
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // 3. Auth Guard Placeholder (Milestone 1)
  // When login/auth cookie is activated, unauthenticated requests to protected paths
  // (/draft, /documents, /settings) will be redirected to /login here.

  return response;
}

// Apply middleware across all application pages while skipping static Next.js assets
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets (/assets/*, images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|assets|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
