import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  onSnapshot, addDoc, collection, query, orderBy,
  updateDoc, doc,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ChatMessage } from '../../types/chat';

// FIRESTORE: real data — uid resolver (avoids stale closure in useEffect)
const getCurrentUserId = (): string => {
  try {
    const { auth } = require('../../services/firebase');
    return auth.currentUser?.uid ?? 'placeholder_user';
  } catch {
    return 'placeholder_user';
  }
};

interface Props {
  route: {
    params: {
      threadId: string;
      otherPartyId?: string;
      otherPartyName?: string;
    };
  };
}

const ChatDetailScreen: React.FC<Props> = ({ route }) => {
  const { threadId, otherPartyName = '未知用戶' } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // FIRESTORE: real data — mark thread read using live uid
  const markThreadRead = async (uid: string) => {
    if (uid === 'placeholder_user') return;
    try {
      await updateDoc(doc(db, 'chat_threads', threadId), {
        [`unreadCount.${uid}`]: 0,
      });
    } catch (_) {}
  };

  // Real-time listener on messages subcollection
  useEffect(() => {
    const threadDoc = doc(db, 'chat_threads', threadId);
    const msgsRef = collection(threadDoc, 'messages');
    const q = query(msgsRef, orderBy('createdAt', 'asc'));

    const unsub = onSnapshot(q,
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
      },
      err => console.warn('[ChatDetail] snapshot error:', err)
    );

    // FIRESTORE: real data — mark as read after listener is live
    markThreadRead(getCurrentUserId());

    return () => unsub();
  }, [threadId]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setInputText('');
    setSending(true);

    try {
      const uid = getCurrentUserId();
      const threadDoc = doc(db, 'chat_threads', threadId);
      const msgsRef = collection(threadDoc, 'messages');
      await addDoc(msgsRef, {
        senderId: uid,
        senderName: '我',
        text,
        createdAt: Date.now(),
        readBy: [uid],
        type: 'text',
      });

      // Update thread metadata
      await updateDoc(doc(db, 'chat_threads', threadId), {
        lastMessage: text,
        lastMessageAt: Date.now(),
      });
    } catch (err) {
      console.error('[sendMessage] error:', err);
      setInputText(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    if (item.type === 'system') {
      return (
        <View style={styles.systemMsg}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }

    const isMe = item.senderId === getCurrentUserId();
    const timeStr = new Date(item.createdAt).toLocaleTimeString('zh-HK', {
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <View style={[
        styles.msgRow,
        isMe ? styles.msgRowMe : styles.msgRowOther,
      ]}>
        {!isMe && (
          <Text style={styles.senderName}>{item.senderName}</Text>
        )}
        <View style={[
          styles.msgBubble,
          isMe ? styles.msgBubbleMe : styles.msgBubbleOther,
        ]}>
          <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
            {item.text}
          </Text>
          <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
            {timeStr}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Other party header */}
      <View style={styles.chatHeader}>
        <Text style={styles.chatHeaderName}>
          💬 {otherPartyName}
        </Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyList}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>開始新對話吧！</Text>
            <Text style={styles.emptySub}>你可以在卡牌詳情頁主動聯絡賣家</Text>
          </View>
        }
      />

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="輸入訊息..."
          placeholderTextColor="#6666AA"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending) ? styles.sendBtnDisabled : null]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending}
        >
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  chatHeader: {
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E1E2E',
    backgroundColor: '#1A1A2E',
  },
  chatHeaderName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  msgRow: { marginBottom: 10, maxWidth: '78%' },
  msgRowMe: { alignSelf: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  senderName: { color: '#6666AA', fontSize: 10, marginBottom: 3, marginLeft: 4 },
  msgBubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18,
  },
  msgBubbleMe: {
    backgroundColor: '#FF3C3C',
    borderBottomRightRadius: 4,
  },
  msgBubbleOther: {
    backgroundColor: '#1E1E2E',
    borderBottomLeftRadius: 4,
  },
  msgText: { fontSize: 14, lineHeight: 20 },
  msgTextMe: { color: '#FFFFFF' },
  msgTextOther: { color: '#FFFFFF' },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMe: { color: 'rgba(255,255,255,0.6)' },
  msgTimeOther: { color: '#6666AA' },
  systemMsg: {
    alignItems: 'center', marginVertical: 8,
  },
  systemText: {
    color: '#6666AA', fontSize: 11, fontStyle: 'italic',
    backgroundColor: '#1E1E2E', paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 12,
  },
  emptyList: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  emptySub: { color: '#6666AA', fontSize: 12, marginTop: 6 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: 12, paddingBottom: 16,
    borderTopWidth: 1, borderTopColor: '#1E1E2E',
    backgroundColor: '#1A1A2E',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A3E',
    borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10,
    color: '#FFFFFF', fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#FF3C3C',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#3A3A4E' },
  sendBtnText: { color: '#FFFFFF', fontSize: 20 },
});

export default ChatDetailScreen;