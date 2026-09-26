import assert from 'node:assert/strict';
import test from 'node:test';

import { orderByChatActivity, recordPersistedChatActivity } from './chatActivity.ts';

test('reading an older conversation preserves canonical activity order', () => {
  const conversations = [
    { id: 'a', updatedAt: 14_30 },
    { id: 'b', updatedAt: 13_00 }
  ];

  // Hydration is a read-only client concern: the server timestamp is retained.
  assert.deepEqual(orderByChatActivity(conversations).map((conversation) => conversation.id), ['a', 'b']);
});

test('a successfully persisted message moves its conversation to the top', () => {
  const conversations = [
    { id: 'a', updatedAt: 14_30 },
    { id: 'b', updatedAt: 13_00 }
  ];

  assert.deepEqual(recordPersistedChatActivity(conversations, 'b', 15_00).map((conversation) => conversation.id), ['b', 'a']);
});
