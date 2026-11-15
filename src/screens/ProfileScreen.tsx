/**
 * ProfileScreen — User profile, preferences, language, security settings
 */
import React, { useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../contexts/AuthContext';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { confirmAction, notify } from '../components/Feedback';
import { C, themed, ThemeName } from '../theme';

type Language = 'zh-HK' | 'zh-CN' | 'en';

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh-HK', label: '🇭🇰 繁體中文' },
  { value: 'zh-CN', label: '🇨🇳 簡體中文' },
  { value: 'en', label: '🇺🇸 English' },
];

/**
 * The theme options.
 *
 * The choice is stored on the account, so it follows the person to
 * another device rather than living in this browser.
 */
const THEMES: {
  value: ThemeName;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'dark', label: '深色', icon: 'moon-outline' },
  { value: 'light', label: '淺色', icon: 'sunny-outline' },
];

const ProfileScreen: React.FC = () => {
  const { t, setTheme, setLanguage } = useAppearance();

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
  // A user with no reviews yet has no positiveReviews field at all, so
  // the division was `undefined / 1` and the screen said "NaN%".
  const positiveCount = profile?.positiveReviews ?? 0;
  const negativeCount = profile?.negativeReviews ?? 0;
  const totalReviews = positiveCount + negativeCount;
  const positiveRate = totalReviews > 0
    ? Math.round((positiveCount / totalReviews) * 100)
    : 0;

  const handleChangeTheme = (theme: ThemeName) => {
    setTheme(theme);
  };

  const handleChangeLanguage = (lang: Language) => {
    setChangingLang(true);
    setLanguage(lang);
    setChangingLang(false);
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
            if (!pin || pin.length < 6) { notify(t('錯誤'), '密碼最少 6 位數字'); return; }
            if (!/^\d+$/.test(pin)) { notify(t('錯誤'), '密碼只能包含數字'); return; }
            setChangingPin(true);
            try {
              await setTransactionPin(pin);
              notify(t('已設定'), '交易密碼已成功設定');
            } catch (e: any) {
              notify('設定失敗', e.message);
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
      '升級訪客帳戶',
      '輸入 Email 與密碼以升級帳戶，現有資料將會保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '升級',
          onPress: async (email?: string) => {
            if (!email || !email.includes('@')) {
              notify(t('錯誤'), '請輸入有效 Email');
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
                      notify(t('錯誤'), '密碼最少 6 位');
                      return;
                    }
                    setUpgrading(true);
                    try {
                      const r = await upgradeFromAnonymous(email.trim().toLowerCase(), password);
                      if (r.kind === 'ok') {
                        notify(t('升級成功'), '帳戶已升級，現有資料保留');
                      } else {
                        notify('升級失敗', r.message);
                      }
                    } catch (e: any) {
                      notify('升級失敗', e?.message ?? '請稍後再試');
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
      'default',
      undefined,
      'email-address'
    );
  };

  const handleSignOut = () => {
    confirmAction(t('登出'), '確定要登出嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出', style: 'destructive',
        onPress: async () => {
          try {
            await authSignOut();
            // Reset nav stack so back button can't go to MainTabs after logout
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          } catch (e: any) {
            notify('登出失敗', e?.message ?? '請稍後再試');
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
        notify(t('評價'), '暫時未有評價');
      } else {
        const summary = reviews.slice(0, 5).map((r: any) =>
          `${r.type === 'positive' ? '' : ''} ${r.comment || '(no comment)'}`
        ).join('\n');
        notify(`評價（${totalReviews} 個）`, summary);
      }
    } catch (e: any) {
      notify(t('載入失敗'), e.message);
    }
  };

  if (!profile) {
    return <View style={styles.container}><ActivityIndicator size="large" color={C.action} /></View>;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="person-outline" size={18} color={C.text} />
          <Text style={styles.headerTitle}>{t('個人')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          style={styles.notifBell}
          accessibilityRole="button"
          accessibilityLabel={t('通知')}
        >
          <Ionicons name="notifications-outline" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* ── Anonymous user CTA ────────────────────────────────────────── */}
      {isAnonymous && (
        <View style={styles.anonBanner}>
          <Text style={styles.anonBannerTitle}>{t('👻 你正在以訪客身份瀏覽')}</Text>
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
              : <Text style={styles.anonBannerBtnText}>{t('升級帳戶 →')}</Text>}
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
            {profile.memberSince
              ? `加入於 ${new Date(profile.memberSince).toLocaleDateString('zh-HK', { year: 'numeric', month: 'long', day: 'numeric' })}`
              : '新會員'}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
            <Text style={styles.editProfile}>{t('編輯個人資料 →')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="phone-portrait-outline" size={15} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t('聯絡方式')}</Text></View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t('電話')}</Text>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="star-outline" size={12} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t('信用評價')}</Text></View>
          <Text style={styles.sectionArrow}>{t('查看全部 →')}</Text>
        </View>
        <View style={styles.ratingRow}>
          <View style={styles.ratingPositive}>
            <Text style={styles.ratingBig}>{profile.positiveReviews}</Text>
            <View style={styles.ratingLabelRow}>
              <Ionicons name="thumbs-up" size={12} color={C.up} />
              <Text style={[styles.ratingLabel, { color: C.up }]}>{t('好評')}</Text>
            </View>
          </View>
          <View style={styles.ratingDivider} />
          <View style={styles.ratingNegative}>
            <Text style={styles.ratingBig}>{profile.negativeReviews}</Text>
            <View style={styles.ratingLabelRow}>
              <Ionicons name="thumbs-down" size={12} color={C.down} />
              <Text style={[styles.ratingLabel, { color: C.down }]}>{t('差評')}</Text>
            </View>
          </View>
          <View style={styles.ratingDivider} />
          <View style={styles.ratingRate}>
            <Text style={[styles.ratingBig, { color: positiveRate >= 70 ? C.up : C.gold }]}>
              {positiveRate}%
            </Text>
            <Text style={styles.ratingLabel}>{t('好評率')}</Text>
          </View>
        </View>
        {totalReviews === 0 && (
          <Text style={styles.noReview}>{t('暫時未有評價，快完成第一單交易啦 🎉')}</Text>
        )}
      </TouchableOpacity>

      {/* Selling */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('🏪 賣家設定')}</Text>
        <TouchableOpacity
          style={styles.actionRow}
          onPress={() => navigation.navigate('SellerOnboarding')}
        >
          <Text style={styles.actionIcon}>💳</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>{t('收款帳戶')}</Text>
            <Text style={styles.actionSub}>
              設定 Stripe 收款戶口，賣出嘅卡收到嘅錢會直接入你嘅銀行
            </Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="settings-outline" size={16} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t('偏好設定')}</Text></View>

        {/* Language */}
        <View style={styles.prefRow}>
          <View style={styles.prefLabelRow}>
            <Ionicons name="globe-outline" size={15} color={C.textSecondary} />
            <Text style={styles.prefLabel}>{t('語言')}</Text>
          </View>
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

        {/* Theme */}
        <View style={styles.prefRow}>
          <View style={styles.prefLabelRow}>
            <Ionicons name="contrast-outline" size={15} color={C.textSecondary} />
            <Text style={styles.prefLabel}>主題</Text>
          </View>
          <View style={styles.langOptions}>
            {THEMES.map(th => {
              const active = (profile.theme ?? 'dark') === th.value;
              return (
                <TouchableOpacity
                  key={th.value}
                  style={[styles.themeBtn, active ? styles.langBtnActive : null]}
                  onPress={() => handleChangeTheme(th.value)}
                >
                  <Ionicons name={th.icon} size={14} color={active ? C.ruby : C.textSecondary} />
                  <Text style={[styles.langBtnText, active ? styles.langBtnTextActive : null]}>
                    {th.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Notification Toggle */}
        <TouchableOpacity style={styles.toggleRow}>
          <View>
            <View style={styles.prefLabelRow}>
              <Ionicons name="notifications-outline" size={15} color={C.textSecondary} />
              <Text style={styles.prefLabel}>{t('通知')}</Text>
            </View>
            <Text style={styles.prefSub}>{t('接收交易及價格更新通知')}</Text>
          </View>
          <View style={[styles.toggle, profile.notificationsEnabled ? styles.toggleActive : null]}>
            <View style={[styles.toggleKnob, profile.notificationsEnabled ? styles.toggleKnobActive : null]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('🔐 安全性')}</Text>
        <TouchableOpacity style={styles.actionRow} onPress={handleSetPin}>
          <Text style={styles.actionIcon}>🔑</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionLabel}>
              {profile.transactionPinHash ? '更改交易密碼' : '設定交易密碼'}
            </Text>
            <Text style={styles.actionSub}>{t('每筆交易都需要驗證')}</Text>
          </View>
          <Text style={styles.actionArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutBtnText}>{t('登出帳戶')}</Text>
      </TouchableOpacity>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prefLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800' },
  notifBell: { padding: 4 },
  avatarSection: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    marginBottom: 24,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.ruby,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 28, fontWeight: '900' },
  nameSection: { marginLeft: 16, flex: 1 },
  displayName: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 4 },
  memberSince: { color: C.textSecondary, fontSize: 12, marginBottom: 6 },
  editProfile: { color: C.ruby, fontSize: 13, fontWeight: '600' },
  section: {
    backgroundColor: C.card, marginHorizontal: 16, borderRadius: 18,
    padding: 18, marginBottom: 14,
  },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionArrow: { color: C.ruby, fontSize: 12, fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabel: { color: C.textSecondary, fontSize: 13 },
  infoValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingPositive: { flex: 1, alignItems: 'center' },
  ratingNegative: { flex: 1, alignItems: 'center' },
  ratingRate: { flex: 1, alignItems: 'center' },
  ratingDivider: { width: 1, height: 40, backgroundColor: C.border },
  ratingBig: { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  ratingLabel: { color: C.textSecondary, fontSize: 11 },
  noReview: { color: C.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 10 },
  prefRow: { marginBottom: 16 },
  prefLabel: { color: C.text, fontSize: 14, fontWeight: '600', marginBottom: 10 },
  prefSub: { color: C.textDisabled, fontSize: 11, marginTop: 2 },
  langOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: C.void, borderWidth: 1, borderColor: C.border,
  },
  langBtnActive: { backgroundColor: 'rgba(255,60,60,0.15)', borderColor: C.ruby },
  themeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: C.void, borderWidth: 1, borderColor: C.border,
  },
  langBtnText: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  langBtnTextActive: { color: C.ruby },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: {
    width: 50, height: 28, borderRadius: 14, backgroundColor: C.border,
    justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleActive: { backgroundColor: C.up },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF' },
  toggleKnobActive: { alignSelf: 'flex-end' },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionIcon: { fontSize: 22, marginRight: 12 },
  actionContent: { flex: 1 },
  actionLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  actionSub: { color: C.textDisabled, fontSize: 11, marginTop: 2 },
  actionArrow: { color: C.textDisabled, fontSize: 16 },
  signOutBtn: {
    backgroundColor: 'rgba(255,60,60,0.08)', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,60,60,0.2)',
  },
  signOutBtnText: { color: C.ruby, fontSize: 14, fontWeight: '700' },
  // Anonymous user upgrade CTA
  anonBanner: {
    backgroundColor: 'rgba(255,107,53,0.10)', marginHorizontal: 16, marginBottom: 14,
    borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)',
  },
  anonBannerTitle: { color: C.warn, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  anonBannerDesc: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  anonBannerBtn: {
    backgroundColor: C.warn, borderRadius: 12, paddingVertical: 12,
    alignItems: 'center',
  },
  anonBannerBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
}))

export default ProfileScreen;
