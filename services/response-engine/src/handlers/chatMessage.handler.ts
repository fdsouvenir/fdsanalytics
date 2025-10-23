import { Request, Response } from 'express';
import { ResponseEngine, ChatMessageRequest } from '../core/ResponseEngine';
import { postMessageToChat } from '../utils/chatApi';

/**
 * Handle incoming Google Chat message
 */
export async function handleChatMessage(
  req: Request,
  res: Response,
  responseEngine: ResponseEngine
): Promise<void> {
  try {
    // Debug logging to see what Google Chat is sending
    console.log('=== INCOMING WEBHOOK ===');
    console.log('Body keys:', Object.keys(req.body));
    console.log('Has chat object:', !!req.body.chat);
    console.log('Has messagePayload:', !!req.body.chat?.messagePayload);
    console.log('Has message:', !!req.body.chat?.messagePayload?.message);
    console.log('Message text:', req.body.chat?.messagePayload?.message?.text);
    console.log('========================');

    const chat = req.body.chat;

    // Check if this is a valid Google Chat webhook
    if (!chat) {
      console.error('Invalid webhook: no chat object found');
      console.log('Full body:', JSON.stringify(req.body));
      res.status(400).json({
        text: "Invalid request format. Expected Google Chat webhook structure."
      });
      return;
    }

    const messagePayload = chat.messagePayload;

    // Check if this is a message event or other event type (like ADDED_TO_SPACE)
    if (!messagePayload || !messagePayload.message) {
      // This might be an ADDED_TO_SPACE or other non-message event
      // For now, respond with a greeting
      console.log('Non-message event detected (possibly ADDED_TO_SPACE)');
      res.json({
        text: "👋 Hi! I'm your restaurant analytics assistant. Ask me about sales, trends, and forecasts!\n\nTry asking:\n• \"How are sales today?\"\n• \"Show me beer sales this week\"\n• \"What's the forecast for next week?\""
      });
      return;
    }

    // Handle MESSAGE event

    // Parse Google Chat webhook payload
    const chatRequest = parseGoogleChatWebhook(req.body);

    if (!chatRequest) {
      console.error('Failed to parse MESSAGE event', {
        body: JSON.stringify(req.body)
      });
      res.status(400).json({
        text: 'Sorry, I couldn\'t understand that message format. Please try again.'
      });
      return;
    }

    // Extract space name and thread for async response
    const spaceName = messagePayload.space?.name;
    const threadName = messagePayload.message.thread?.name;

    if (!spaceName) {
      console.error('No space name found in message payload');
      res.status(400).json({
        text: 'Invalid message: missing space information.'
      });
      return;
    }

    console.log('Message parsed successfully:', {
      messageText: chatRequest.message,
      spaceName,
      threadName
    });

    // CRITICAL: Return 200 immediately (< 1 second)
    res.status(200).json({});

    // Process message asynchronously (don't await!)
    processMessageAsync(
      chatRequest,
      spaceName,
      threadName,
      responseEngine
    ).catch(error => {
      console.error('Async message processing failed:', {
        error: error.message,
        stack: error.stack
      });
    });

  } catch (error: any) {
    console.error('Error in chatMessage handler', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      text: 'Sorry, I encountered an error processing your message. Please try again.'
    });
  }
}

/**
 * Process message asynchronously and post response back to Chat
 */
async function processMessageAsync(
  chatRequest: ChatMessageRequest,
  spaceName: string,
  threadName: string | undefined,
  responseEngine: ResponseEngine
): Promise<void> {
  try {
    console.log('Processing message asynchronously:', chatRequest.message);

    // Generate response (this takes 9+ seconds)
    const response = await responseEngine.handleMessage(chatRequest);

    console.log('Response generated, posting to Chat API...');

    // Post back to Google Chat using Chat API
    await postMessageToChat(spaceName, {
      text: response.text,
      cards: response.cards,
      thread: threadName ? { name: threadName } : undefined
    });

    console.log('Response posted successfully to Chat');

  } catch (error: any) {
    console.error('Failed to process message:', {
      error: error.message,
      stack: error.stack
    });

    // Try to post error message to user
    try {
      await postMessageToChat(spaceName, {
        text: 'Sorry, I encountered an error processing your message. Please try again.',
        thread: threadName ? { name: threadName } : undefined
      });
    } catch (postError: any) {
      console.error('Failed to post error message:', {
        error: postError.message
      });
    }
  }
}

/**
 * Parse Google Chat webhook payload
 */
function parseGoogleChatWebhook(body: any): ChatMessageRequest | null {
  try {
    // Google Chat webhook format (actual structure):
    // {
    //   chat: {
    //     user: {
    //       name: 'users/...',
    //       displayName: '...',
    //       email: '...'
    //     },
    //     messagePayload: {
    //       message: {
    //         name: 'spaces/.../messages/...',
    //         text: 'user message',
    //         argumentText: 'user message',
    //         thread: { name: 'spaces/.../threads/...' }
    //       },
    //       space: {
    //         name: 'spaces/...',
    //         type: 'ROOM'
    //       }
    //     }
    //   }
    // }

    const chat = body.chat;
    if (!chat || !chat.messagePayload || !chat.messagePayload.message) {
      return null;
    }

    const message = chat.messagePayload.message;
    const space = chat.messagePayload.space;
    const user = chat.user;

    // Use argumentText if available (contains the text without @mentions),
    // otherwise fall back to text
    const messageText = message.argumentText || message.text;

    if (!messageText || !messageText.trim()) {
      return null;
    }

    // Extract IDs
    const workspaceId = space?.name || 'default';
    const userId = user?.name || 'anonymous';
    const threadId = message.thread?.name || message.name;
    const messageId = message.name || `msg_${Date.now()}`;

    return {
      workspaceId,
      userId,
      message: messageText.trim(),
      threadId,
      messageId,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    console.error('Failed to parse Google Chat webhook', {
      error: error.message
    });
    return null;
  }
}
