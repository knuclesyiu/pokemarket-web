/**
 * ProfileScreen — User profile, preferences, language, security settings
 */
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { httpsCallable, getFunctions } from 'firebase/functions';

type Language = 'zh-HK' | 'zh-CN' | 'en';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh-HK', label: '🇭🇰 繁體中文' },
  { value: 'zh-CN', label: '🇨🇳 簡體中文' },
  { value: 'en', label: '🇺🇸 English' },
];

const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  // All hooks at the top — never destructure inside callbacks
  const {
    currentUser, userProfile, updateProfile, signOut: authSignOut,
    setTransactionPin, isAnonymous, upgradeFromAnonymous, refreshSession,
  } = useAuth();
  const [changingLang, setChangingLang] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const profile = userProfile;
  const positiveRate = profile
    ? Math.round((profile.positiveReviews / (profile.positiveReviews + profile.negativeReviews || 1)) * 100)
    : 0;
  const totalReviews = (profile?.positiveReviews ?? 0) + (profile?.negativeReviews ?? 0);

  const handleChangeLanguage = async (lang: Language) => {
    setChangingLang(true);
    try {
      await updateProfile({ language: lang });
    } catch (e: any) {
      Alert.alert('錯誤', e.message);
    } finally {
      setChangingLang(false);
    }
  };

  const handleSetPin = () => {
    Alert.prompt(
      '🔐 設定交易密碼',
      '請輸入 6 位數字交易密碼',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '確認',
          onPress: async (pin?: string) => {
            if (!pin || pin.length < 6) { Alert.alert('錯誤', '密碼最少 6 位數字'); return; }
            if (!/^\d+$/.test(pin)) { Alert.alert('錯誤', '密碼只能包含數字'); return; }
            setChangingPin(true);
            try {
              await setTransactionPin(pin);
              Alert.alert('✅ 已設定', '交易密碼已成功設定');
            } catch (e: any) {
              Alert.alert('❌ 設定失敗', e.message);
            } finally {
              setChangingPin(false);
            }
          },
        },
      ],
      'secure-text'
    );
  };

  const handleUpgradeFromAnonymous = () => {
    Alert.prompt(
      '🔓 升級訪客帳戶',
      '輸入 Email 與密碼以升級帳戶，現有資料將會保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '升級',
          onPress: async (email?: string) => {
            if (!email || !email.includes('@')) {
              Alert.alert('錯誤', '請輸入有效 Email');
              return;
            }
            // Re-prompt for password (Alert.prompt is single-input)
            Alert.prompt(
              '🔐 設定密碼',
              '設定新密碼（最少 6 位）',
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '確認升級',
                  onPress: async (password?: string) => {
                    if (!password || password.length < 6) {
                      Alert.alert('錯誤', '密碼最少 6 位');
                      return;
                    }
                    setUpgrading(true);
                    try {
                      const r = await upgradeFromAnonymous(email.trim().toLowerCase(), password);
                      if (r.kind === 'ok') {
                        Alert.alert('✅ 升級成功', '帳戶已升級，現有資料保留');
                      } else {
                        Alert.alert('❌ 升級失敗', r.message);
                      }
                    } catch (e: any) {
                      Alert.alert('❌ 升級失敗', e?.message ?? '請稍後再試');
                    } finally {
                      setUpgrading(false);
                    }
                  },
                },
              ],
              'secure-text'
            );
          },
        },
      ],
      'email-address'
    );
  };

  const handleSignOut = () => {
    Alert.alert('登出', '確定要登出嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出', style: 'destructive',
        onPress: async () => {
          try {
            await authSignOut();
            // Reset nav stack so back button can't go to MainTabs after logout
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (e: any) {
            Alert.alert('登出失敗', e?.message ?? '請稍後再試');
          }
        },
      },
    ]);
  };

  const handleViewReviews = async () => {
    if (!currentUser) return;
    try {
      const fn = httpsCallable(getFunctions(), 'getUserReviews');
      const result = await fn({ uid: currentUser.uid, limit: 20 });
      const data = result.data as any;
      const reviews = data?.reviews ?? [];
      if (reviews.length === 0) {
        Alert.alert('評價', '暫時未有評價');
      } else {
        const summary = reviews.slice(0, 5).map((r: any) =>
          `${r.type === 'positive' ? '👍' : '👎'} ${r.comment || '(no comment)'}`
        ).join('\n');
        Alert.alert(`評價（${totalReviews} 個）`, summary);
      }
    } catch (e: any) {
      Alert.alert('載入失敗', e.message);
    }
  };

  if (!profile) {
    return <View style={styles.container}><ActivityIndicator size="large" color="#FF3C3C" /></View>;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👤 個人</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.notifBell}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* ── Anonymous user CTA ────────────────────────────────────────── */}
      {isAnonymous && (
        <View style={styles.anonBanner}>
          <Text style={styles.anonBannerTitle}>👻 你正在以訪客身份瀏覽</Text>
          <Text style={styles.anonBannerDesc}>
            升級為正式帳戶以建立掛牌、完成交易、保留收藏資料。
          </Text>
          <TouchableOpacity
            style={styles.anonBannerBtn}
            onPress={handleUpgradeFromAnonymous}
            disabled={upgrading}
          >
            {upgrading
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.anonBannerBtnText}>升級帳戶 →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Avatar + Name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile.displayName?.charAt(0).toUpperCase() ?? 'U'}
          </Text>
        </View>
        <View style={styles.nameSection}>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <Text style={styles.memberSince}>
            會員since {profile.memberSince ? new Date(profile.memberSince).toLocaleDateString('zh-HK', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <Text style={styles.editProfile}>編輯個人資料 →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📱 聯絡方式</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>電話</Text>
          <Text style={styles.infoValue}>{profile.phone || '未設定'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue}>{profile.email || '未設定'}</Text>
        </View>
      </View>

      {/* Rating */}
      <TouchableOpacity style={styles.section} onPress={handleViewReviews}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>⭐ 信用評價</Text>
          <Text style={styles.sectionArrow}>查看全部 →</Text>
        </View>
        <View style={styles.ratingRow}>
          <View style={styles.ratingPositive}>
            <Text style={styles.ratingBig}>{profile.positiveReviews}</Text>
            <Text style={styles.ratingLabel}>👍 好評</Text>
          </View>
          <View style={styles.ratingDivider} />
          <View style={styles.ratingNegative}>
            <Text style={styles.ratingBig}>{profile.negativeReviews}</Text>
            <Text style={styles.ratingLabel}>👎 差評</Text>
          </View>
          <View style={styles.ratingDivider} />
          <View style={styles.ratingRate}>
            <Text style={[styles.ratingBig, { color: positiveRate >= 70 ? '#00C896' : '#D4AF37' }]}>
              {positiveRate}%
            </Text>
            <Text style={styles.ratingLabel}>好評率</Text>
          </View>
        </View>
        {totalReviews === 0 && (
          <Text style={styles.noReview}>暫時未有評價，快完成第一單交易啦 🎉</Text>
        )}
      </TouchableOpacity>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚙️ 偏好設定</Text>

        {/* Language */}
        <View style={styles.prefRow}>
          <Text style={styles.prefLabel}>🌐 語言</Text>
          <View style={styles.langOptions}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.value}
                style={[styles.langBtn, profile.language === lang.value ? styles.langBtnActive : null]}
                onPress={() => handleChangeLanguage(lang.value)}
                disabled={changingLang}
              >
                <Text style={[styles.langBtnText, profile.language === lang.value ? styles.langBtnTextActive : null]}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notification Toggle */}
        <TouchableOpacity style={styles.toggleRow}>
          <View>
            <Text style={styles.prefLabel}>🔔 通知</Text>
            <Text style={styles.prefSub}>接收交易及價格更新通知</Text>
          </View>
          <View style={[styles.toggle, profile.notificationsEnabled ? styles.toggleActive : null]}>
            <View style={[styles.toggleKnob, profile.notificationsEnabled ? styles.toggleKnobActive : null]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔐 安全性</Text>
        <TouchableOpacity style={styles.actionRow} onPress={handleSetPin}>
          <Text style={styles.actionIcon}>🔑</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>
              {profile.transactionPinHash ? '更改交易密碼' : '設定交易密碼'}
            </Text>
            <Text style={styles.actionSub}>每筆交易都需要驗證</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutBtnText}>登出帳戶</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  headerTitle: { color: '#F0F0FF', fontSize: 24, fontWeight: '800' },
  notifBell: { fontSize: 24 },
  avatarSection: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#FF4060',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  nameSection: { marginLeft: 16, flex: 1 },
  displayName: { color: '#F0F0FF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  memberSince: { color: '#8888CC', fontSize: 12, marginBottom: 6 },
  editProfile: { color: '#FF4060', fontSize: 13, fontWeight: '600' },
  section: {
    backgroundColor: '#14142A', marginHorizontal: 16, borderRadius: 18,
    padding: 18, marginBottom: 14,
  },
  sectionTitle: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionArrow: { color: '#FF4060', fontSize: 12, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A50' },
  infoLabel: { color: '#8888CC', fontSize: 13 },
  infoValue: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingPositive: { flex: 1, alignItems: 'center' },
  ratingNegative: { flex: 1, alignItems: 'center' },
  ratingRate: { flex: 1, alignItems: 'center' },
  ratingDivider: { width: 1, height: 40, backgroundColor: '#2A2A50' },
  ratingBig: { color: '#F0F0FF', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  ratingLabel: { color: '#8888CC', fontSize: 11 },
  noReview: { color: '#8888CC', fontSize: 12, textAlign: 'center', marginTop: 10 },
  prefRow: { marginBottom: 16 },
  prefLabel: { color: '#F0F0FF', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  prefSub: { color: '#4A4A70', fontSize: 11, marginTop: 2 },
  langOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#080810', borderWidth: 1, borderColor: '#2A2A50',
  },
  langBtnActive: { backgroundColor: 'rgba(255,60,60,0.15)', borderColor: '#FF4060' },
  langBtnText: { color: '#8888CC', fontSize: 12, fontWeight: '600' },
  langBtnTextActive: { color: '#FF4060' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: {
    width: 50, height: 28, borderRadius: 14, backgroundColor: '#2A2A50',
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleActive: { backgroundColor: '#00C896' },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  toggleKnobActive: { alignSelf: 'flex-end' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionIcon: { fontSize: 22, marginRight: 12 },
  actionContent: { flex: 1 },
  actionLabel: { color: '#F0F0FF', fontSize: 14, fontWeight: '600' },
  actionSub: { color: '#4A4A70', fontSize: 11, marginTop: 2 },
  actionArrow: { color: '#4A4A70', fontSize: 16 },
  signOutBtn: {
    backgroundColor: 'rgba(255,60,60,0.08)', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,60,60,0.2)',
  },
  signOutBtnText: { color: '#FF4060', fontSize: 14, fontWeight: '700' },
  // Anonymous user upgrade CTA
  anonBanner: {
    backgroundColor: 'rgba(255,107,53,0.10)', marginHorizontal: 16, marginBottom: 14,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)',
  },
  anonBannerTitle: { color: '#FF6B35', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  anonBannerDesc: { color: '#8888CC', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  anonBannerBtn: {
    backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center',
  },
  anonBannerBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});

export default ProfileScreen;
