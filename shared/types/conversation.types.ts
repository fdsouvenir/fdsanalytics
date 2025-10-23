/**
 * Conversation and message types
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ConversationMessage {
  conversation_id: string;
  user_id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tenant_id: string;
}
