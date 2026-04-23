import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ChatThread } from '../../types/chat';

interface Props {
  onSelectThread?: (threadId: string) => void;
}

// Placeholder — replace with real auth UID
const CURRENT_USER_ID = 'placeholder_user';

const ChatListScreen: React.FC<Props> = ({ onSelectThread }) => {
  const navigation = useNavigation<any>();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (CURRENT_USER_ID === 'placeholder_user') {
      setLoading(false);
      return;
    }

    const q = query(
      db.collection('chat_threads')
        .where('parties', 'array-contains', CURRENT_USER_ID)
        .orderBy('lastMessageAt', 'desc')
    );

    const unsub = onSnapshot(q,
      snap => {
        setThreads(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatThread)));
        setLoading(false);
      },
      err => {
        console.warn('[ChatList] snapshot error:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const totalUnread = threads.reduce((sum, t) => {
    const mine = t.unreadCount?.[CURRENT_USER_ID] ?? 0;
    return sum + mine;
  }, 0);

  const renderThread = ({ item }: { item: ChatThread }) => {
    const otherPartyId = item.parties.find(p => p !== CURRENT_USER_ID) ?? item.parties[0];
    const unread = item.unreadCount?.[CURRENT_USER_ID] ?? 0;
    const timeLabel = item.lastMessageAt
      ? new Date(item.lastMessageAt).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' })
      : '';

    return (
      <TouchableOpacity
        style={styles.threadItem}
        onPress={() => {
          if (onSelectThread) {
            onSelectThread(item.id);
          } else {
            navigation.navigate('ChatDetail', { threadId: item.id, otherPartyId });
          }
        }}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.listingId ? '📦' : '💬'}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.listingId ? `📦 交易對話` : (item.otherPartyName ?? '💬 私訊')}
            </Text>
            {timeLabel && (
              <Text style={styles.threadTime}>{timeLabel}</Text>
            )}
          </View>
          <Text style={[styles.lastMessage, unread > 0 && styles.lastMessageUnread]} numberOfLines={1}>
            {item.lastMessage ?? '尚無訊息'}
          </Text>
        </View>

        {/* Unread badge */}
        {unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💬 我的訊息</Text>
        {totalUnread > 0 && (
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{totalUnread} 未讀</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <Text style={{ color: '#6666AA' }}>載入中...</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={item => item.id}
          renderItem={renderThread}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>尚無訊息</Text>
              <Text style={styles.emptySub}>開始與賣家傾偈吧！{'\n'}去卡牌詳情頁點擊「💬 聯絡」即可開始。</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  totalBadge: {
    backgroundColor: '#FF3C3C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  totalBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1E1E2E',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 22 },
  threadContent: { flex: 1 },
  threadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  threadName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 },
  threadTime: { color: '#6666AA', fontSize: 11, marginLeft: 8 },
  lastMessage: { color: '#8888AA', fontSize: 13 },
  lastMessageUnread: { color: '#FFFFFF', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#FF3C3C', borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#6666AA', fontSize: 13, textAlign: 'center', lineHeight: 22 },
});

export default ChatListScreen;