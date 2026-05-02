/**
 * FeatureShowcaseScreen — Key Feature Cards for PokeMarket
 * NEW: Obsidian Gallery design system — dark premium collectibles aesthetic
 * Deep layered surfaces with warm gold and ember accents
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Dimensions, Animated, Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const { width } = Dimensions.get('window');
const CARD_W = width - 32;

// NEW: Obsidian Gallery constants
const COLORS = {
  bgVoid: '#080810',
  bgSurface: '#0E0E1A',
  bgCard: '#14142A',
  bgElevated: '#1C1C38',
  borderSubtle: '#2A2A50',
  borderActive: '#3D3D70',
  textPrimary: '#F0F0FF',
  textSecondary: '#8888CC',
  textTertiary: '#4A4A70',
  accentGold: '#D4AF37',
  accentEmber: '#FF6B35',
  accentJade: '#00C896',
  accentRuby: '#FF4060',
  accentViolet: '#8B5CF6',
};

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

// Updated tags with refined colors
const FEATURES: FeatureCard[] = [
  {
    id: 'prices',
    tag: '實時行情',
    tagColor: '#D4AF37',   // gold
    emoji: '📊',
    title: 'Live Market Prices',
    subtitle: '秒級更新・覆蓋全球',
    bullets: [
      'TCGdex API CardMarket EUR + TCGPlayer USD',
      '每 6 小時自動同步 15 張熱門卡',
      '',
      '所有價格即時轉換為港幣（HKD）',
    ],
    accent: '#D4AF37',
  },
  {
    id: 'escrow',
    tag: '交易保障',
    tagColor: '#FF6B35',   // ember
    emoji: '🔐',
    title: '資金託付保障',
    subtitle: '資金托管・零風險交易',
    bullets: [
      '款項由平台托管，確認收貨後釋放',
      'Day 5 自動發預警告示通知',
      '買家可延長期限最多 14 日',
      '爭議時可提交 Dispute，款項暫停釋放',
    ],
    accent: '#FF6B35',
  },
  {
    id: 'auth',
    tag: '用戶認證',
    tagColor: '#00C896',   // jade
    emoji: '🔑',
    title: 'Secure Authentication',
    subtitle: '電話・Email・生物識別',
    bullets: [
      'Firebase Auth 電話 SMS OTP 驗證',
      'Email + 密碼登入（自動註冊）',
      '交易 PIN（SHA-256）每筆交易驗證',
      'Biometric 原生支援 FaceID / Fingerprint',
    ],
    accent: '#00C896',
  },
  {
    id: 'reviews',
    tag: '信用評價',
    tagColor: '#8B5CF6',   // violet
    emoji: '⭐',
    title: 'Peer Review System',
    subtitle: '好評差評・建立信任',
    bullets: [
      '每筆交易完成後可留 👍 好評 或 👎 差評',
      '信用評價影響用戶排名與曝光',
      '公開好評率%，雙方均可評價',
      '所有評價存入區塊鏈般不可篡改日誌',
    ],
    accent: '#8B5CF6',
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
    tagColor: '#FF6B35',
    emoji: '💬',
    title: 'In-App Messaging',
    subtitle: '買賣雙方即時溝通',
    bullets: [
      'Firestore 即時訊息，無需刷新',
      '每筆訂單自動創建 Chat Thread',
      '支援文字、圖片、報價訊息類型',
      '已讀/未讀狀態指示燈',
    ],
    accent: '#FF6B35',
  },
  {
    id: 'portfolio',
    tag: '收藏管理',
    tagColor: '#FF4060',   // ruby
    emoji: '💼',
    title: 'Portfolio Tracker',
    subtitle: '持倉成本・帳面盈虧',
    bullets: [
      '追蹤所有持有卡牌的均價與數量',
      '實時計算總市值與帳面 P&L',
      '成交記錄完整保存，随時查閱',
      '一鍵「放售」直接進入掛牌流程',
    ],
    accent: '#FF4060',
  },
  {
    id: 'payments',
    tag: '支付結算',
    tagColor: '#00C896',
    emoji: '💳',
    title: 'Stripe Payments',
    subtitle: 'Stripe Connect・秒級結算',
    bullets: [
      'Stripe Connect 托管款項，平台零接觸資金',
      '買家付款 → 資金託付 → 確認 → 自動結算',
      '支援信用卡/轉數快/FPS 多種方式',
      '每筆交易手續費透明，無隱藏收費',
    ],
    accent: '#00C896',
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
        useNativeDriver: false // RN 0.81+ Android,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        delay: index * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false // RN 0.81+ Android,
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
  const { currentUser, isAnonymous, loading } = useAuth();

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080810' }}>
      <ActivityIndicator size="large" color="#D4AF37" />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🎴 PokeMarket</Text>
        <Text style={styles.headerSub}>Pokemon 卡片交易平台</Text>
        <Text style={styles.headerTagline}>安全 ・ 快速 ・ 全球行情</Text>
      </View>

      {/* Stats strip — elevated card with gold accents */}
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
          <TouchableOpacity style={styles.ctaBtn} onPress={() => {
            if (currentUser) {
              navigation.navigate('Main');
            } else {
              navigation.navigate('Login');
            }
          }}>
            <Text style={styles.ctaBtnText}>進入市場 →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
};

// NEW: Obsidian Gallery design system
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },  // void background
  header: { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20, alignItems: 'center' },
  logo: {
    color: '#D4AF37',  // gold logo
    fontSize: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  headerSub: { color: '#F0F0FF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  headerTagline: { color: '#8888CC', fontSize: 13, letterSpacing: 2 },
  // Elevated stats strip with subtle border
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: '#14142A',  // card surface
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { color: '#F0F0FF', fontSize: 22, fontWeight: '900', marginBottom: 2 },
  statLabel: { color: '#8888CC', fontSize: 10, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  // Elevated card with subtle glow
  card: {
    backgroundColor: '#14142A',  // card surface
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2A50',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  cardGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  cardHeader: { marginBottom: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '800' },
  emoji: { fontSize: 32 },
  cardTitle: { color: '#F0F0FF', fontSize: 18, fontWeight: '900', marginBottom: 4 },
  cardSubtitle: { color: '#8888CC', fontSize: 12 },
  divider: { height: 1, marginBottom: 16 },
  bullets: { gap: 10 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, flexShrink: 0 },
  bulletText: { color: '#CCCCEE', fontSize: 13, lineHeight: 20, flex: 1 },
  bottomAccent: { height: 3, borderRadius: 2, marginTop: 18, opacity: 0.6 },
  // CTA section — elevated with gold button
  ctaSection: {
    alignItems: 'center',
    marginTop: 30,
    paddingVertical: 30,
    backgroundColor: '#14142A',
    borderRadius: 24,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  ctaTitle: { color: '#F0F0FF', fontSize: 22, fontWeight: '900', marginBottom: 8 },
  ctaSub: { color: '#8888CC', fontSize: 13, marginBottom: 24 },
  ctaBtn: {
    backgroundColor: '#D4AF37',  // gold CTA
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaBtnText: { color: '#080810', fontSize: 16, fontWeight: '800' },
});

export default FeatureShowcaseScreen;