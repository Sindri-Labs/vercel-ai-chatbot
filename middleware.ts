import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/app/(auth)/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith('/ping')) {
    return new Response('pong', { status: 200 });
  }

  // Allow auth API routes to pass through
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Allow login and register pages to be accessed without authentication
  if (['/login', '/register'].includes(pathname)) {
    return NextResponse.next();
  }

  // Check if user is authenticated
  const session = await auth();

  if (!session) {
    const redirectUrl = encodeURIComponent(request.url);
    return NextResponse.redirect(
      new URL(`/api/auth/guest?redirectUrl=${redirectUrl}`, request.url),
    );
  }

  // If authenticated user tries to access login/register, redirect to home
  if (session.user && session.user.type === 'regular' && ['/login', '/register'].includes(pathname)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/chat/:id',
    '/api/:path*',
    '/login',
    '/register',

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
