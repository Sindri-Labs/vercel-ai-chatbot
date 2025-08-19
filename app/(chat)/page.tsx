import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { Chat } from '@/components/chat';
import { generateUUID } from '@/lib/utils';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  const chatModel = modelIdFromCookie ? modelIdFromCookie.value : DEFAULT_CHAT_MODEL;
  
  // Generate a new chat ID for the new chat
  const newChatId = generateUUID();

  return (
    <>
      <Chat
        id={newChatId}
        initialMessages={[]}
        initialChatModel={chatModel}
        initialVisibilityType="private"
        isReadonly={false}
        session={session}
        autoResume={false}
      />
    </>
  );
}
