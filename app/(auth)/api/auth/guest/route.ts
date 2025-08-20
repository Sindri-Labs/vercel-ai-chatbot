import { signIn } from '@/app/(auth)/auth';
import { auth } from '@/app/(auth)/auth';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const redirectUrl = searchParams.get('redirectUrl') || '/';

    console.log('Guest auth route called with redirectUrl:', redirectUrl);

    const session = await auth();

    if (session) {
      console.log('User already has session, redirecting to home');
      return NextResponse.redirect(new URL('/', request.url));
    }

    console.log('No session found, attempting guest sign in...');
    
    const result = await signIn('guest', { redirect: false });
    
    if (result?.error) {
      console.error('Guest sign in failed:', result.error);
      return new Response('Guest authentication failed', { status: 500 });
    }
    
    console.log('Guest sign in successful, redirecting to:', redirectUrl);
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (error) {
    console.error('Error in guest auth route:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
