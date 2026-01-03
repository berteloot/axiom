import { NextResponse } from "next/server"

// Force middleware to run in Node.js runtime (not edge runtime)
export const runtime = "nodejs"

export function middleware(req: any) {
  const { pathname } = req.nextUrl

  // Skip middleware for auth routes, API routes, static files, etc.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/billing") // Allow access to billing page
  ) {
    return NextResponse.next()
  }

  // For all other routes, let the client-side components handle authentication
  // The BillingGuard component will handle redirects for unauthenticated users
  return NextResponse.next()
}