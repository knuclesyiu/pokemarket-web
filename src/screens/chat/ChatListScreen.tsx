import React, { useState, useEffect } from 'react';
import { useAppearance } from '../../contexts/AppearanceContext';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { onSnapshot, query, orderBy, where, collection } from 'firebase/firestore';
import { auth, db } from '../../services/firebase';
import { ChatThread } from '../../types/chat';
import { useAuth } from '../../contexts/AuthContext';
import { C, themed } from '../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

interface Props {
  onSelectThread?: (threadId: string) => void;
}

const ChatListScreen: React.FC<Props> = ({ onSelectThread }) => {
  const { t } = useAppearance();

  const navigation = useNavigation<any>();
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-subscribe whenever the user changes (sign in / out / switch account)
  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) {
      setThreads([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const q = query(
      collection(db, 'chat_threads'),
      where('parties', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc')
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
  }, [currentUser?.uid]);

  const totalUnread = threads.reduce((sum, t) => {
    if (!currentUser?.uid) return sum;
    const mine = t.unreadCount?.[currentUser.uid] ?? 0;
    return sum + mine;
  }, 0);

  const renderThread = ({ item }: { item: ChatThread }) => {
    if (!currentUser?.uid) return null;
    const otherPartyId = item.parties.find(p => p !== currentUser.uid) ?? item.parties[0];
    const unread = item.unreadCount?.[currentUser.uid] ?? 0;
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
            {item.listingId ? '📦' : ''}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.listingId ? `📦 交易對話` : (item.otherPartyName ?? '私訊')}
            </Text>
            {timeLabel && (
              <Text style={styles.threadTime}>{timeLabel}</Text>
            )}
          </View>
          <Text style={[styles.lastMessage, unread > 0 ? styles.lastMessageUnread : null]} numberOfLines={1}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} /><Text style={styles.headerTitle}>{t('我的訊息')}</Text></View>
        {totalUnread > 0 && (
          <View style={styles.totalBadge}>
            <Text style={styles.totalBadgeText}>{totalUnread} 未讀</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <Text style={{ color: C.textTertiary }}>{t('載入中...')}</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={item => item.id}
          renderItem={renderThread}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>{t('尚無訊息')}</Text>
              <Text style={styles.emptySub}>開始與賣家傾偈吧！{'\n'}去卡牌詳情頁撳「聯絡賣家」即可開始。</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800' },
  totalBadge: {
    backgroundColor: C.action, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
  },
  totalBadgeText: { color: C.text, fontSize: 11, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.elevated,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.elevated,
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
  threadName: { color: C.text, fontSize: 15, fontWeight: '600', flex: 1 },
  threadTime: { color: C.textTertiary, fontSize: 11, marginLeft: 8 },
  lastMessage: { color: C.textSecondary, fontSize: 13 },
  lastMessageUnread: { color: C.text, fontWeight: '600' },
  unreadBadge: {
    backgroundColor: C.action, borderRadius: 10,
    minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: C.text, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: C.textTertiary, fontSize: 13, textAlign: 'center', lineHeight: 22 },
}))

export default ChatListScreen;