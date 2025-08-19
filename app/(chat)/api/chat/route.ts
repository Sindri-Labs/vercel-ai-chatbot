import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
  generateText,
} from 'ai';
import { type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider, MAX_COMPLETION_TOKENS } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import { auth } from '@/app/(auth)/auth';


export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    console.error('Request body validation failed:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    const userType: UserType = session.user.type;
    
    let messageCount = 0;
    // Check rate limiting for regular users
    if (userType === 'regular') {
      messageCount = await getMessageCountByUserId({
        id: session.user.id,
        differenceInHours: 24,
      });

      if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
        return new ChatSDKError('rate_limit:chat').toResponse();
      }
    }

    let chat = null;
    // Always try to get or create chat for message persistence
    chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else {
      // Check ownership for private chats
      if (chat.visibility === 'private' && chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    let previousMessages: any[] = [];
    // Always get previous messages for conversation continuity
    previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    let streamId: string;
    // Always save messages for persistence
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Use USE_TOOLS environment variable to control whether tools are enabled
    const useTools = process.env.USE_TOOLS === 'true';
    // Use ENABLE_STREAMING environment variable to control streaming vs non-streaming
    const enableStreaming = process.env.ENABLE_STREAMING !== 'false';
    
    if (enableStreaming) {
      // Streaming mode (original implementation)
      const stream = createDataStream({
        execute: (dataStream) => {
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt({ selectedChatModel, requestHints }),
            messages,
            maxSteps: 5,
            maxTokens: MAX_COMPLETION_TOKENS,
            experimental_activeTools: useTools ? (
              selectedChatModel === 'chat-model-reasoning'
                ? []
                : [
                    'getWeather',
                    'createDocument',
                    'updateDocument',
                    'requestSuggestions',
                  ]
            ) : [],
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: useTools ? {
              getWeather,
              createDocument: createDocument({ 
                session: { 
                  user: { id: session.user.id, type: session.user.type, email: session.user.email },
                  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
                }, 
                dataStream 
              }),
              updateDocument: updateDocument({ 
                session: { 
                  user: { id: session.user.id, type: session.user.type, email: session.user.email },
                  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
                }, 
                dataStream 
              }),
              requestSuggestions: requestSuggestions({
                session: { 
                  user: { id: session.user.id, type: session.user.type, email: session.user.email },
                  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
                },
                dataStream,
              }),
            } : {},
            onFinish: async ({ response }) => {
              // Always save assistant messages for persistence
              if (session.user?.id) {
                try {
                  const assistantId = getTrailingMessageId({
                    messages: response.messages.filter(
                      (message) => message.role === 'assistant',
                    ),
                  });

                  if (!assistantId) {
                    throw new Error('No assistant message found!');
                  }

                  const [, assistantMessage] = appendResponseMessages({
                    messages: [message],
                    responseMessages: response.messages,
                  });

                  await saveMessages({
                    messages: [
                      {
                        id: assistantId,
                        chatId: id,
                        role: assistantMessage.role,
                        parts: assistantMessage.parts,
                        attachments:
                          assistantMessage.experimental_attachments ?? [],
                        createdAt: new Date(),
                      },
                    ],
                  });
                } catch (_) {
                  console.error('Failed to save chat');
                }
              }
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });

          result.consumeStream();

          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });
        },
        onError: () => {
          return 'Oops, an error occurred!';
        },
      });

      const streamContext = getStreamContext();

      if (streamContext) {
        return new Response(
          await streamContext.resumableStream(streamId, () => stream),
        );
      } else {
        return new Response(stream);
      }
    } else {
      // Non-streaming mode
      try {
        const { text: responseText } = await generateText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages,
          maxTokens: MAX_COMPLETION_TOKENS,
        });

        // Create a mock response structure for non-streaming
        const assistantMessage = {
          id: generateUUID(),
          role: 'assistant' as const,
          content: responseText,
          parts: [{ type: 'text' as const, text: responseText }],
        };

        // Save the assistant message to database for persistence
        if (session.user?.id) {
          await saveMessages({
            messages: [
              {
                id: assistantMessage.id,
                chatId: id,
                role: assistantMessage.role,
                parts: assistantMessage.parts,
                attachments: [],
                createdAt: new Date(),
              },
            ],
          });
        }

        // For non-streaming, we need to simulate the streaming format
        // that the frontend expects. Let's create a proper stream response.
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Send the text delta
            const textDelta = encoder.encode(`0:${JSON.stringify(responseText)}\n`);
            controller.enqueue(textDelta);
            
            // Send the finish event
            const finishEvent = encoder.encode(`e:${JSON.stringify({
              finishReason: "stop",
              usage: { 
                completionTokens: responseText.length, 
                promptTokens: 0 
              },
              isContinued: false
            })}\n`);
            controller.enqueue(finishEvent);
            
            // Send the final data event
            const dataEvent = encoder.encode(`d:${JSON.stringify({
              finishReason: "stop",
              usage: { 
                completionTokens: responseText.length, 
                promptTokens: 0 
              }
            })}\n`);
            controller.enqueue(dataEvent);
            
            controller.close();
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      } catch (error) {
        console.error('Error in non-streaming mode:', error);
        return new ChatSDKError('bad_request:api').toResponse();
      }
    }
  } catch (error) {
    console.error('Error in POST /api/chat:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    
    return new ChatSDKError('bad_request:api').toResponse();
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  // Get guest user ID from cookies instead of NextAuth session
  const guestUserId = request.headers.get('cookie')?.match(/guest_user_id=([^;]+)/)?.[1];
  
  if (!guestUserId) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  // Check ownership for private chats
  if (chat.userId !== guestUserId) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:chat').toResponse();
  }

  // Get guest user ID from cookies instead of NextAuth session
  const guestUserId = request.headers.get('cookie')?.match(/guest_user_id=([^;]+)/)?.[1];
  
  if (!guestUserId) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  // Check ownership for private chats
  if (chat.visibility === 'private' && chat.userId !== guestUserId) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  try {
    await deleteChatById({ id });
  } catch {
    return new ChatSDKError('bad_request:chat').toResponse();
  }

  return new Response(null, { status: 204 });
}
