import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const hasAccessToken = request.cookies.has("access_token");

  if (!hasAccessToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
