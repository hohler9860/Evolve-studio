import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

export const config = {
  matcher: ['/admin/dashboard', '/admin'],
};

export default async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Redirect /admin to /admin/dashboard
  if (pathname === '/admin') {
    return NextResponse.redirect(new URL('/admin/dashboard', req.url));
  }

  // Check for auth token
  const token = req.cookies.get('auth_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/admin/login', req.url));
  }
}
