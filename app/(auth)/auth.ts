import { compare } from 'bcrypt-ts';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createGuestUser, getUser } from '@/lib/db/queries';
import { authConfig } from './auth.config';
import { DUMMY_PASSWORD } from '@/lib/constants';
import type { DefaultJWT } from 'next-auth/jwt';
import { generateUUID } from '@/lib/utils';

export type UserType = 'guest' | 'regular';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) return null;

        return { ...user, type: 'regular' };
      },
    }),
    Credentials({
      id: 'guest',
      credentials: {},
      async authorize() {
        try {
          console.log('Creating guest user via NextAuth...');
          
          // Add a small delay to ensure database connection is ready
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Generate a predictable user ID for the session
          const sessionUserId = generateUUID();
          console.log('Generated session user ID:', sessionUserId);
          
          const [guestUser] = await createGuestUser(sessionUserId);
          console.log('Guest user created via NextAuth:', guestUser);
          
          // Ensure the user object has the required properties
          if (!guestUser || !guestUser.id) {
            console.error('Guest user creation failed - missing ID');
            return null;
          }
          
          console.log('Returning guest user:', { 
            id: guestUser.id, 
            email: guestUser.email, 
            type: 'guest' 
          });
          return { 
            id: guestUser.id, 
            email: guestUser.email, 
            type: 'guest' as const 
          };
        } catch (error) {
          console.error('Error in guest authentication:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
  },
});
