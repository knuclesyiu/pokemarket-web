/**
 * FeatureShowcaseScreen — Key Feature Cards for PokeMarket
 * Dark premium fintech aesthetic with staggered card reveals.
 * Designed for investor/product demos.
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');
const CARD_W = width - 32;

interface FeatureCard {
  id: string;
  tag: string;
  tagColor: string;
  emoji: string;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: string;
}

const FEATURES: FeatureCard[] = [
  {
    id: 'prices',
    tag: '實時行情',
    tagColor: '#FF3C3C',
    emoji: '📊',
    title: 'Live Market Prices',
    subtitle: '秒級更新・覆蓋全球',
    bullets: [
      'TCGdex API CardMarket EUR + TCGPlayer USD',
      '每 6 小時自動同步 15 張熱門卡',
      'PSA/BGS 等級估價倍數顯示',
      '所有價格即時轉換為港幣（HKD）',
    ],
    accent: '#FF3C3C',
  },
  {
    id: 'escrow',
    tag: '交易保障',
    tagColor: '#FFB800',
    emoji: '🔐',
    title: 'Escrow Protection',
    subtitle: '資金托管・零風險交易',
    bullets: [
      '款項由平台托管，確認收貨後釋放',
      'Day 5 自動發預警告示通知',
      '買家可延長期限最多 14 日',
      '爭議時可提交 Dispute，款項暫停釋放',
    ],
    accent: '#FFB800',
  },
  {
    id: 'auth',
    tag: '用戶認證',
    tagColor: '#00C864',
    emoji: '🔑',
    title: 'Secure Authentication',
    subtitle: '電話・Email・生物識別',
    bullets: [
      'Firebase Auth 電話 SMS OTP 驗證',
      'Email + 密碼登入（自動註冊）',
      '交易 PIN（SHA-256）每筆交易驗證',
      'Biometric 原生支援 FaceID / Fingerprint',
    ],
    accent: '#00C864',
  },
  {
    id: 'reviews',
    tag: '信用評價',
    tagColor: '#AA66FF',
    emoji: '⭐',
    title: 'Peer Review System',
    subtitle: '好評差評・建立信任',
    bullets: [
      '每筆交易完成後可留 👍 好評 或 👎 差評',
      '信用評價影響用戶排名與曝光',
      '公開好評率%，雙方均可評價',
      '所有評價存入區塊鏈般不可篡改日誌',
    ],
    accent: '#AA66FF',
  },
  {
    id: 'i18n',
    tag: '多語言',
    tagColor: '#00AADD',
    emoji: '🌐',
    title: 'Multi-Language',
    subtitle: '繁中・簡中・English',
    bullets: [
      'UI 完全支援三種語言即時切換',
      '語言偏好存於用戶個人設定',
      '所有市場資訊、價格貨幣自動本地化',
      '未來可擴展至日語、英語市場',
    ],
    accent: '#00AADD',
  },
  {
    id: 'chat',
    tag: '即時通訊',
    tagColor: '#FF8C00',
    emoji: '💬',
    title: 'In-App Messaging',
    subtitle: '買賣雙方即時溝通',
    bullets: [
      'Firestore 即時訊息，無需刷新',
      '每筆訂單自動創建 Chat Thread',
      '支援文字、圖片、報價訊息類型',
      '已讀/未讀狀態指示燈',
    ],
    accent: '#FF8C00',
  },
  {
    id: 'portfolio',
    tag: '收藏管理',
    tagColor: '#FF4081',
    emoji: '💼',
    title: 'Portfolio Tracker',
    subtitle: '持倉成本・帳面盈虧',
    bullets: [
      '追蹤所有持有卡牌的均價與數量',
      '實時計算總市值與帳面 P&L',
      '成交記錄完整保存，随時查閱',
      '一鍵「放售」直接進入掛牌流程',
    ],
    accent: '#FF4081',
  },
  {
    id: 'payments',
    tag: '支付結算',
    tagColor: '#00E5CC',
    emoji: '💳',
    title: 'Stripe Payments',
    subtitle: 'Stripe Connect・秒級結算',
    bullets: [
      'Stripe Connect 托管款項，平台零接觸資金',
      '買家付款 → Escrow → 確認 → 自動結算',
      '支援信用卡/轉數快/FPS 多種方式',
      '每筆交易手續費透明，無隱藏收費',
    ],
    accent: '#00E5CC',
  },
];

const FeatureCard: React.FC<{ feature: FeatureCard; index: number }> = ({ feature, index }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        delay: index * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: index * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {/* Card glow accent */}
      <View style={[styles.cardGlow, { backgroundColor: feature.accent + '15' }]} />

      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTop}>
          <View style={[styles.tag, { backgroundColor: feature.tagColor + '20' }]}>
            <Text style={[styles.tagText, { color: feature.tagColor }]}>{feature.tag}</Text>
          </View>
          <Text style={styles.emoji}>{feature.emoji}</Text>
        </View>
        <Text style={styles.cardTitle}>{feature.title}</Text>
        <Text style={styles.cardSubtitle}>{feature.subtitle}</Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: feature.accent + '40' }]} />

      {/* Bullets */}
      <View style={styles.bullets}>
        {feature.bullets.map((b, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: feature.accent }]} />
            <Text style={styles.bulletText}>{b}</Text>
          </View>
        ))}
      </View>

      {/* Bottom accent line */}
      <View style={[styles.bottomAccent, { backgroundColor: feature.accent }]} />
    </Animated.View>
  );
};

const FeatureShowcaseScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🎴 PokeMarket</Text>
        <Text style={styles.headerSub}>Pokemon 卡片交易平台</Text>
        <Text style={styles.headerTagline}>安全 ・ 快速 ・ 全球行情</Text>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        {[
          { val: '8+', label: '功能模組' },
          { val: '27+', label: 'Cloud Functions' },
          { val: '3', label: '語言' },
          { val: 'HKD', label: '結算貨幣' },
        ].map((s, i) => (
          <View key={i} style={styles.stat}>
            <Text style={styles.statVal}>{s.val}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Feature Cards */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.id} feature={f} index={i} />
        ))}

        {/* CTA */}
        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>準備好了嗎？</Text>
          <Text style={styles.ctaSub}>立即開始你的第一筆安全交易</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.ctaBtnText}>進入市場 →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, alignItems: 'center' },
  logo: { color: '#FF3C3C', fontSize: 32, fontWeight: '900', fontStyle: 'italic', marginBottom: 6 },
  headerSub: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  headerTagline: { color: '#8888AA', fontSize: 13, letterSpacing: 2 },
  statsStrip: {
    flexDirection: 'row', backgroundColor: '#1A1A2E',
    marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 2 },
  statLabel: { color: '#6666AA', fontSize: 10, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  card: {
    backgroundColor: '#12121F',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 160, height: 160, borderRadius: 80,
  },
  cardHeader: { marginBottom: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '800' },
  emoji: { fontSize: 32 },
  cardTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  cardSubtitle: { color: '#8888AA', fontSize: 12 },
  divider: { height: 1, marginBottom: 16 },
  bullets: { gap: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  bulletText: { color: '#CCCCEE', fontSize: 13, lineHeight: 20, flex: 1 },
  bottomAccent: { height: 3, borderRadius: 2, marginTop: 18, opacity: 0.6 },
  ctaSection: { alignItems: 'center', marginTop: 30, paddingVertical: 30, backgroundColor: '#1A1A2E', borderRadius: 24, marginBottom: 10 },
  ctaTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  ctaSub: { color: '#8888AA', fontSize: 13, marginBottom: 24 },
  ctaBtn: {
    backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 40,
  },
  ctaBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});

export default FeatureShowcaseScreen;
