import { api } from '@/lib/apiClient';

/**
 * Ask Baydar (ADR-038). The browser sends a question and a conversation id,
 * never the history: the server keeps the conversation, so nothing the
 * model reads was written by the client.
 */
export function listConversations() {
  return api.get('/assistant/conversations');
}

export function getConversation(id) {
  return api.get(`/assistant/conversations/${id}`);
}

export function ask({ message, conversationId }) {
  return api.post('/assistant/messages', {
    message,
    ...(conversationId ? { conversation_id: conversationId } : {}),
  });
}

export function deleteConversation(id) {
  return api.delete(`/assistant/conversations/${id}`);
}
