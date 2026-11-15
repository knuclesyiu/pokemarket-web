import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { C } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

const CURRENT_USER_ID = 'placeholder_user';

const NotificationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (CURRENT_USER_ID === 'placeholder_user') {
        setLoading(false);
        return;
      }
      try {
        const getNotifs = httpsCallable(getFunctions(), 'getNotifications');
        const result = await getNotifs({ limit: 50 });
        const data = result.data as any;
        setNotifications(data?.notifications ?? []);
      } catch (e) {
        console.warn('[Notifications] getNotifications failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const markRead = async (notifId: string) => {
    try {
      setNotifications(prev =>
        prev.map(n => n.id === notifId ? { ...n, read: true } : n)
      );
    } catch (_) {}
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.notifItem, !item.read ? styles.notifItemUnread : null]}
      onPress={() => {
        markRead(item.id);
        if (item.orderId) {
          navigation.navigate('OrderStatus', { orderId: item.orderId });
        }
      }}
      activeOpacity={0.7}
    >
      {!item.read && <View style={styles.unreadDot} />}
      <View style={styles.notifContent}>
        <Text style={[styles.notifTitle, !item.read ? styles.notifTitleUnread: null]}>
          {item.title ?? '通知'}
        </Text>
        <Text style={styles.notifBody} numberOfLines={2}>
          {item.body ?? ''}
        </Text>
        <Text style={styles.notifTime}>
          {item.createdAt
            ? new Date(item.createdAt).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : ''}
        </Text>
      </View>
      {item.type === 'escrow_warning' && (
        <View style={styles.notifBadge}>
          <Ionicons name="warning-outline" size={16} color={C.textTertiary} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="notifications-outline" size={18} color={C.textTertiary} /><Text style={styles.headerTitle}>通知</Text></View>
        {notifications.filter(n => !n.read).length > 0 && (
          <Text style={styles.unreadCount}>
            {notifications.filter(n => !n.read).length} 未讀
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={C.ruby} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={18} color={C.textTertiary} />
              <Text style={styles.emptyTitle}>暂无通知</Text>
              <Text style={styles.emptySub}>有新消息時再通知你</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
  },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800' },
  unreadCount: {
    backgroundColor: C.ruby, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    color: '#FFF', fontSize: 11, fontWeight: '700',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notifItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.card,
    gap: 12,
  },
  notifItemUnread: { backgroundColor: 'rgba(255,60,60,0.04)' },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.ruby,
    marginTop: 6, flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifTitle: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  notifTitleUnread: { fontWeight: '800' },
  notifBody: { color: C.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 6 },
  notifTime: { color: C.textDisabled, fontSize: 11 },
  notifBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,184,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  notifBadgeText: { fontSize: 16 },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: C.textDisabled, fontSize: 13 },
});

export default NotificationScreen;