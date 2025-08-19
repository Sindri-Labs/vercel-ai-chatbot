import { ChatSDKError } from '@/lib/errors';
import { getChatsByUserId } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit');
  const startingAfter = searchParams.get('startingAfter');
  const endingBefore = searchParams.get('endingBefore');

  if (!limit) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    const { chats, hasMore } = await getChatsByUserId({
      id: session.user.id,
      limit: parseInt(limit, 10),
      startingAfter,
      endingBefore,
    });

    return Response.json({ chats, hasMore });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError('bad_request:history').toResponse();
  }
}
