/**
 * Mock messages for testing
 */

import { ConversationMessage } from '../../src/storage/BigQueryStorage';

export const mockMessages: ConversationMessage[] = [
  {
    conversationId: 'senso-sushi-thread123-1729584000000',
    tenantId: 'senso-sushi',
    userId: 'user@sensosushi.com',
    threadId: 'thread123',
    workspaceId: 'workspace456',
    role: 'user',
    content: 'How are beer sales this week?',
    timestamp: new Date('2025-10-22T14:00:00Z'),
    messageId: 'msg_001',
  },
  {
    conversationId: 'senso-sushi-thread123-1729584060000',
    tenantId: 'senso-sushi',
    userId: 'user@sensosushi.com',
    threadId: 'thread123',
    workspaceId: 'workspace456',
    role: 'assistant',
    content: 'Beer sales this week are $5,234, up 12% from last week.',
    timestamp: new Date('2025-10-22T14:01:00Z'),
    messageId: 'msg_002',
  },
  {
    conversationId: 'senso-sushi-thread123-1729584120000',
    tenantId: 'senso-sushi',
    userId: 'user@sensosushi.com',
    threadId: 'thread123',
    workspaceId: 'workspace456',
    role: 'user',
    content: 'What about (Sushi) category?',
    timestamp: new Date('2025-10-22T14:02:00Z'),
    messageId: 'msg_003',
  },
  {
    conversationId: 'senso-sushi-thread123-1729584180000',
    tenantId: 'senso-sushi',
    userId: 'user@sensosushi.com',
    threadId: 'thread123',
    workspaceId: 'workspace456',
    role: 'assistant',
    content: 'Sushi sales this week are $8,456, down 3% from last week.',
    timestamp: new Date('2025-10-22T14:03:00Z'),
    messageId: 'msg_004',
  },
  {
    conversationId: 'senso-sushi-thread123-1729584240000',
    tenantId: 'senso-sushi',
    userId: 'user@sensosushi.com',
    threadId: 'thread123',
    workspaceId: 'workspace456',
    role: 'user',
    content: 'Show me the trend for this month',
    timestamp: new Date('2025-10-22T14:04:00Z'),
    messageId: 'msg_005',
  },
];

export const mockEmptyConversation: ConversationMessage[] = [];

export const mockLongConversation: ConversationMessage[] = Array.from({ length: 15 }, (_, i) => ({
  conversationId: `senso-sushi-thread456-${1729584000000 + i * 60000}`,
  tenantId: 'senso-sushi',
  userId: 'user@sensosushi.com',
  threadId: 'thread456',
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: i % 2 === 0 ? `User question ${i / 2 + 1}` : `Assistant response ${(i + 1) / 2}`,
  timestamp: new Date(1729584000000 + i * 60000),
  messageId: `msg_${String(i).padStart(3, '0')}`,
}));
