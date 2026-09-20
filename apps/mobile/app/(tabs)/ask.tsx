import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getMobileConversation, listMobileConversations, optimisticMessage, sendMobileChatMessage } from '@/src/chat/chatApi';
import type { MobileChatMessage, MobileConversation } from '@/src/chat/types';
import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { IconButton, Surface } from '@/src/components/UI';
import { colors, radius, spacing } from '@/src/theme/tokens';

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AskSaviScreen() {
  const { accessToken } = useMobileAuth();
  const [draft, setDraft] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MobileChatMessage[]>([]);
  const [conversations, setConversations] = useState<MobileConversation[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList<MobileChatMessage>>(null);

  const refreshHistory = useCallback(async () => {
    if (!accessToken) return;
    try {
      setHistoryError(null);
      setConversations(await listMobileConversations(accessToken));
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'SAVI history is unavailable.');
    }
  }, [accessToken]);

  useEffect(() => { if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })); }, [messages, sending]);

  const startFreshDraft = () => { setConversationId(null); setMessages([]); setDraft(''); setError(null); setHistoryVisible(false); };
  useFocusEffect(useCallback(() => {
    startFreshDraft();
    void refreshHistory();
  }, [refreshHistory]));
  const openConversation = async (id: string) => {
    if (!accessToken) return;
    try {
      setHistoryError(null);
      const conversation = await getMobileConversation(accessToken, id);
      setConversationId(conversation.id);
      setMessages(conversation.messages || []);
      setError(null);
      setHistoryVisible(false);
    } catch (cause) { setHistoryError(cause instanceof Error ? cause.message : 'SAVI could not open this conversation.'); }
  };
  const send = async (retryMessage?: MobileChatMessage) => {
    const content = (retryMessage?.content || draft).trim();
    if (!content || sending || !accessToken) return;
    const userMessage = retryMessage || optimisticMessage(content);
    setDraft(''); setError(null); setSending(true);
    setMessages((current) => retryMessage ? current.filter((message) => !message.failed) : [...current, userMessage]);
    try {
      const result = await sendMobileChatMessage(accessToken, content, conversationId || undefined, userMessage.id);
      setConversationId(result.conversationId);
      setMessages((current) => [...current, { id: `assistant-${result.clientRequestId}`, role: 'assistant', content: result.response, createdAt: new Date().toISOString() }]);
      await refreshHistory();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'SAVI could not reply. Please try again.';
      setError(message);
      setMessages((current) => [...current, { id: `failed-${Date.now()}`, role: 'assistant', content: message, createdAt: new Date().toISOString(), failed: true }]);
    } finally { setSending(false); }
  };

  const empty = messages.length === 0;
  return <View style={styles.screen}>
    <View style={styles.header}><View><Text style={styles.title}>{conversationId ? 'Ask SAVI' : 'New chat'}</Text><Text style={styles.subtitle}>{conversationId ? 'Continue your conversation' : 'Ask SAVI anything'}</Text></View><View style={styles.headerActions}><IconButton icon="time-outline" label="Chat history" onPress={() => { setHistoryVisible(true); void refreshHistory(); }} muted /><IconButton icon="create-outline" label="Start a new chat" onPress={startFreshDraft} muted /></View></View>
    {empty ? <View style={styles.empty}><View style={styles.emptyMark}><Ionicons name="sparkles" color={colors.violet} size={28} /></View><Text style={styles.emptyTitle}>Where should we start?</Text><Text style={styles.emptyCopy}>Tell SAVI what you want to make, understand, or organise.</Text><View style={styles.prompts}>{['Plan a launch video', 'Turn this into an image brief', 'Help me organise PDFs'].map((prompt) => <Pressable key={prompt} accessibilityRole="button" onPress={() => setDraft(prompt)} style={styles.prompt}><Text style={styles.promptText}>{prompt}</Text><Ionicons name="arrow-up-outline" color={colors.textMuted} size={16} /></Pressable>)}</View></View> : <FlatList ref={listRef} data={messages} keyExtractor={(message) => message.id} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={[styles.message, item.role === 'user' ? styles.userMessage : styles.assistantMessage, item.failed && styles.failedMessage]}><Text style={styles.messageRole}>{item.role === 'user' ? 'YOU' : 'SAVI'}</Text><Text style={styles.messageText}>{item.content}</Text>{item.failed ? <Pressable accessibilityRole="button" onPress={() => void send(messages.filter((message) => message.role === 'user').at(-1))} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable> : null}</View>} ListFooterComponent={sending ? <View style={styles.thinking}><ActivityIndicator color={colors.violet} /><Text style={styles.thinkingText}>SAVI is thinking</Text></View> : null} />}
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} keyboardVerticalOffset={88}><Surface style={styles.composer}><TextInput accessibilityLabel="Ask SAVI message" editable={!sending} multiline onChangeText={setDraft} placeholder="Message SAVI..." placeholderTextColor={colors.textSubtle} style={styles.input} value={draft} /><View style={styles.controls}><IconButton icon="attach" label="Attachments are coming soon" muted /><Text style={styles.freeNote}>Chat is free</Text><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}>{sending ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name="arrow-up" color={colors.text} size={19} />}</Pressable></View></Surface>{error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}</KeyboardAvoidingView>
    <Modal animationType="slide" transparent visible={historyVisible} onRequestClose={() => setHistoryVisible(false)}><Pressable style={styles.backdrop} onPress={() => setHistoryVisible(false)}><Pressable style={styles.historySheet} onPress={(event) => event.stopPropagation()}><View style={styles.historyHeader}><Text style={styles.historyTitle}>Chat history</Text><IconButton icon="close" label="Close chat history" onPress={() => setHistoryVisible(false)} muted /></View><Pressable accessibilityRole="button" onPress={startFreshDraft} style={styles.newChat}><Ionicons name="add" color={colors.text} size={18} /><Text style={styles.newChatText}>New chat</Text></Pressable>{historyError ? <Text style={styles.error}>{historyError}</Text> : null}<FlatList data={conversations} keyExtractor={(conversation) => conversation.id} ListEmptyComponent={<Text style={styles.noHistory}>Your conversations will appear here after you send a message.</Text>} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => void openConversation(item.id)} style={styles.historyItem}><View style={styles.historyCopy}><Text numberOfLines={1} style={styles.historyItemTitle}>{item.title}</Text><Text style={styles.historyDate}>{dateLabel(item.updatedAt)}</Text></View><Ionicons name="chevron-forward" color={colors.textSubtle} size={18} /></Pressable>} /></Pressable></Pressable></Modal>
  </View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 52 }, headerActions: { flexDirection: 'row', gap: spacing.xs }, title: { color: colors.text, fontSize: 23, fontWeight: '800' }, subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 3 }, empty: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: spacing.xl }, emptyMark: { alignItems: 'center', backgroundColor: '#251D42', borderColor: '#443073', borderRadius: 24, borderWidth: 1, height: 72, justifyContent: 'center', marginBottom: spacing.lg, width: 72 }, emptyTitle: { color: colors.text, fontSize: 25, fontWeight: '800', marginBottom: spacing.xs }, emptyCopy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 280, textAlign: 'center' }, prompts: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.xxl }, prompt: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 13 }, promptText: { color: colors.textMuted, fontSize: 14 }, messages: { gap: spacing.sm, paddingVertical: spacing.lg }, message: { borderRadius: radius.md, maxWidth: '88%', padding: spacing.md }, userMessage: { alignSelf: 'flex-end', backgroundColor: colors.violetStrong }, assistantMessage: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }, failedMessage: { borderColor: '#A24A61' }, messageRole: { color: colors.textSubtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 6 }, messageText: { color: colors.text, fontSize: 15, lineHeight: 22 }, thinking: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, padding: spacing.sm }, thinkingText: { color: colors.textMuted, fontSize: 13 }, retry: { marginTop: spacing.sm }, retryText: { color: '#F19AB0', fontWeight: '800' }, composer: { padding: spacing.sm }, input: { color: colors.text, fontSize: 16, lineHeight: 22, maxHeight: 110, minHeight: 44, paddingHorizontal: spacing.xs, paddingTop: spacing.xs }, controls: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs }, freeNote: { color: colors.textSubtle, flex: 1, fontSize: 11, fontWeight: '700' }, send: { alignItems: 'center', backgroundColor: colors.violetStrong, borderRadius: 12, height: 42, justifyContent: 'center', width: 42 }, sendDisabled: { backgroundColor: colors.surfaceStrong }, error: { color: '#F19AB0', fontSize: 12, marginTop: spacing.xs, textAlign: 'center' }, backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1, justifyContent: 'flex-end' }, historySheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '72%', minHeight: 340, padding: spacing.lg }, historyHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }, historyTitle: { color: colors.text, fontSize: 21, fontWeight: '800' }, newChat: { alignItems: 'center', backgroundColor: colors.violetStrong, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md, padding: spacing.sm }, newChatText: { color: colors.text, fontWeight: '800' }, historyItem: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md }, historyCopy: { flex: 1, marginRight: spacing.sm }, historyItemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, historyDate: { color: colors.textSubtle, fontSize: 12, marginTop: 3 }, noHistory: { color: colors.textMuted, lineHeight: 20, paddingTop: spacing.lg, textAlign: 'center' }
});
