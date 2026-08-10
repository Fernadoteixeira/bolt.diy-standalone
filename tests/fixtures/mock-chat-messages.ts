/**
 * Mock chat message fixtures for tests.
 *
 * These objects mirror the shape of messages exchanged in the bolt.diy chat
 * interface and API. All content is synthetic test data.
 */

export interface MockChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: number;
}

/**
 * A simple two-turn conversation (user → assistant).
 */
export const simpleConversation: MockChatMessage[] = [
  {
    id: 'msg-test-001',
    role: 'user',
    content: 'Hello, can you help me with a test?',
    createdAt: 1700000000000,
  },
  {
    id: 'msg-test-002',
    role: 'assistant',
    content: 'Of course! This is a test response.',
    createdAt: 1700000001000,
  },
];

/**
 * A conversation that begins with a system message.
 */
export const conversationWithSystem: MockChatMessage[] = [
  {
    id: 'msg-test-sys-001',
    role: 'system',
    content: 'You are a test assistant. Respond concisely.',
    createdAt: 1700000000000,
  },
  {
    id: 'msg-test-101',
    role: 'user',
    content: 'What is 2 + 2?',
    createdAt: 1700000001000,
  },
  {
    id: 'msg-test-102',
    role: 'assistant',
    content: '2 + 2 = 4.',
    createdAt: 1700000002000,
  },
];

/**
 * A longer multi-turn conversation for testing streaming / history logic.
 */
export const longConversation: MockChatMessage[] = [
  {
    id: 'msg-test-201',
    role: 'user',
    content: 'Create a simple HTML page.',
    createdAt: 1700000000000,
  },
  {
    id: 'msg-test-202',
    role: 'assistant',
    content: 'Here is a simple HTML page:\n```html\n<!DOCTYPE html>\n<html><body>Hello</body></html>\n```',
    createdAt: 1700000001000,
  },
  {
    id: 'msg-test-203',
    role: 'user',
    content: 'Add a heading to the page.',
    createdAt: 1700000002000,
  },
  {
    id: 'msg-test-204',
    role: 'assistant',
    content: 'Updated with a heading:\n```html\n<!DOCTYPE html>\n<html><body><h1>Hello</h1></body></html>\n```',
    createdAt: 1700000003000,
  },
  {
    id: 'msg-test-205',
    role: 'user',
    content: 'Make the heading blue.',
    createdAt: 1700000004000,
  },
  {
    id: 'msg-test-206',
    role: 'assistant',
    content: 'Added blue styling:\n```html\n<h1 style="color:blue">Hello</h1>\n```',
    createdAt: 1700000005000,
  },
];

/**
 * An empty message array (no history).
 */
export const emptyConversation: MockChatMessage[] = [];

/**
 * A conversation containing a message with empty content to test edge cases.
 */
export const conversationWithEmptyContent: MockChatMessage[] = [
  {
    id: 'msg-test-301',
    role: 'user',
    content: '',
    createdAt: 1700000000000,
  },
  {
    id: 'msg-test-302',
    role: 'assistant',
    content: 'I received an empty message.',
    createdAt: 1700000001000,
  },
];

/**
 * A single user message with no response yet.
 */
export const singleUserMessage: MockChatMessage[] = [
  {
    id: 'msg-test-401',
    role: 'user',
    content: 'This is a standalone test message.',
    createdAt: 1700000000000,
  },
];