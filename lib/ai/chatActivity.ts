type ChatSessionActivity = {
  id: string;
  updatedAt: number;
};

export function orderByChatActivity<Session extends ChatSessionActivity>(sessions: Session[]) {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function recordPersistedChatActivity<Session extends ChatSessionActivity>(sessions: Session[], sessionId: string, activityAt: number) {
  return orderByChatActivity(sessions.map((session) => session.id === sessionId ? { ...session, updatedAt: activityAt } : session));
}
