import { NextResponse } from 'next/server';

export default function proxy(request) {
  // Let the request continue and prepare response
  const response = NextResponse.next();
  
  // Look for the aum_user_id cookie
  const userId = request.cookies.get('aum_user_id')?.value;
  
  if (!userId) {
    const newUserId = crypto.randomUUID();
    // Assign a long-lived cookie (1 year)
    response.cookies.set('aum_user_id', newUserId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
      httpOnly: false
    });
  }
  
  return response;
}

export const config = {
  matcher: [
    // Run proxy for all routes except static assets
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
