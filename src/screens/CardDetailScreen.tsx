import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TouchableOpacity, Dimensions, Modal, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type { RouteProp } from '@react-navigation/native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../services/firebase';
import PriceChart from '../components/PriceChart';
import { generatePriceHistory, MOCK_LISTINGS } from '../data/mockData';
import { PokemonCard } from '../types';

type RouteProps = RouteProp<{ params: { card: PokemonCard } }, 'params'>;
const { width } = Dimensions.get('window');

const CardDetailScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { card } = route.params;
  const [activeTab, setActiveTab] = useState<'listings' | 'history'>('listings');
  const [showSellModal, setShowSellModal] = useState(false);
  const [priceData, setPriceData] = useState<{ priceHkd: number; change24h: number; source: string; ageMs: number } | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const priceHistory = generatePriceHistory(card.price);

  const isGain = (priceData?.change24h ?? card.priceChange24h) >= 0;

  useEffect(() => {
    (async () => {
      try {
        const fn = getFunctions();
        const getCardPrice = httpsCallable(fn, 'getCardPrice');
        const result = await getCardPrice({ cardId: card.id });
        const data = result.data as any;
        if (data && !data.error) {
          setPriceData({
            priceHkd: data.priceHkd ?? card.price,
            change24h: data.change24h ?? card.priceChange24h,
            source: data.source ?? 'cache',
            ageMs: data.ageMs ?? 0,
          });
        }
      } catch (e) {
        console.warn('[CardDetail] getCardPrice failed:', e);
      } finally {
        setPriceLoading(false);
      }
    })();
  }, [card.id]);

  const formatPrice = (p: number) =>
    p >= 1000 ? `HK$ ${(p / 1000).toFixed(1)}K` : `HK$ ${p}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{card.name}</Text>
        <TouchableOpacity style={styles.shareBtn}>
          <Text>📤</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Card Hero */}
        <View style={styles.cardHero}>
          <View style={styles.cardImageWrap}>
            <Image source={{ uri: card.imageUrl }} style={styles.cardImage} />
            {card.rarity === 'Rare Ultra' && (
              <View style={styles.rareBadge}>
                <Text style={styles.rareBadgeText}>★ ULTRA RARE</Text>
              </View>
            )}
          </View>
          <View style={styles.cardMeta}>
            <Text style={styles.cardName}>{card.name}</Text>
            <Text style={styles.cardSet}>{card.set} · {card.number}</Text>
            <Text style={styles.cardRarity}>{card.rarity}</Text>
            <View style={styles.priceSection}>
              {priceLoading ? (
                <ActivityIndicator size="small" color="#FF3C3C" />
              ) : (
                <>
                  <Text style={styles.currentPrice}>
                    {formatPrice(priceData?.priceHkd ?? card.price)}
                  </Text>
                  <View style={styles.priceSourceBadge}>
                    <View style={[
                      styles.sourceDot,
                      { backgroundColor: priceData?.source === 'live' ? '#00C896' : '#8888AA' }
                    ]} />
                    <Text style={styles.priceSourceText}>
                      {priceData?.source === 'live' ? 'Live' : 'Cache'}
                      {priceData?.ageMs ? ` · ${Math.round(priceData.ageMs/3600000)}h ago` : ''}
                    </Text>
                  </View>
                </>
              )}
              <View style={[styles.badge, isGain ? styles.badgeGain : styles.badgeLoss]}>
                <Text style={[styles.badgeText, isGain ? styles.textGain : styles.textLoss]}>
                  {isGain ? '▲' : '▼'} {Math.abs(priceData?.change24h ?? card.priceChange24h).toFixed(1)}%
                </Text>
              </View>
            </View>
            <Text style={styles.listingCount}>📦 {card.listingCount} 個掛牌</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.buyBtn]}
            onPress={() => setActiveTab('listings')}
          >
            <Text style={styles.actionBtnText}>立即購買</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.sellBtn]}
            onPress={() => setShowSellModal(true)}
          >
            <Text style={styles.sellBtnText}>放售</Text>
          </TouchableOpacity>
        </View>

        {/* 💬 Contact Seller */}
        <TouchableOpacity
          style={styles.contactBtn}
          onPress={async () => {
            try {
              const fns = getFunctions();
              const createChatThread = httpsCallable(fns, 'createChatThread');
              // FIRESTORE: real data — use real uid, derive sellerId from card.id
              const currentUid = auth.currentUser?.uid ?? 'placeholder_user';
              const sellerId = `seller_${card.id}`;  // deterministic mock seller per card
              const result = await createChatThread({
                listingId: card.id,
                parties: [currentUid, sellerId],
              });
              const { threadId } = result.data as { threadId: string };
              navigation.navigate('ChatDetail', { threadId, otherPartyId: sellerId, otherPartyName: card.set });
            } catch {
              // Navigate to ChatList to show instructions
              navigation.navigate('ChatList');
            }
          }}
        >
          <Text style={styles.contactBtnText}>💬 聯絡賣家</Text>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(['listings', 'history'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t === 'listings' ? '📋 掛牌列表' : '📈 歷史價格'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'listings' && (
          <View style={styles.listingsSection}>
            {MOCK_LISTINGS.filter(l => l.cardId === card.id || true).map(listing => (
              <View key={listing.id} style={styles.listingCard}>
                <View style={styles.listingLeft}>
                  <Text style={styles.listingSeller}>{listing.sellerName}</Text>
                  <Text style={styles.listingCondition}>{listing.condition}</Text>
                </View>
                <View style={styles.listingRight}>
                  <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
                  <TouchableOpacity style={styles.bidBtn}>
                    <Text style={styles.bidBtnText}>
                      {listing.type === 'auction' ? '競投 →' : '購買 →'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'history' && (
          <View style={styles.chartSection}>
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>30天價格走势</Text>
              <Text style={styles.chartRange}>
                HK$ {Math.min(...priceHistory.map(p => p.price)).toLocaleString()}
                {' → '}
                HK$ {Math.max(...priceHistory.map(p => p.price)).toLocaleString()}
              </Text>
            </View>
            <PriceChart data={priceHistory} />
          </View>
        )}

        {/* Card Details */}
        <View style={styles.detailSection}>
          <Text style={styles.detailTitle}>卡牌資料</Text>
          {[
            ['Series', card.series],
            ['Set', card.set],
            ['Rarity', card.rarity],
            ['Card No.', card.number],
            ['Condition', card.condition],
          ].map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sell Modal */}
      <Modal visible={showSellModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>放售 {card.name}</Text>
            <Text style={modalStyles.subtitle}>選擇掛牌方式</Text>
            <TouchableOpacity style={modalStyles.option}>
              <Text style={modalStyles.optionTitle}>💰 定價出售</Text>
              <Text style={modalStyles.optionDesc}>設定固定價格，買家即時購買</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalStyles.option}>
              <Text style={modalStyles.optionTitle}>🏷️ 拍賣</Text>
              <Text style={modalStyles.optionDesc}>設定底價，讓買家競標</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.option, modalStyles.cancelBtn]}
              onPress={() => setShowSellModal(false)}
            >
              <Text style={modalStyles.cancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#080810',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#14142A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { color: '#F0F0FF', fontSize: 20, fontWeight: '700' },
  headerTitle: {
    flex: 1,
    color: '#F0F0FF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#14142A',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  },
  cardHero: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 20,
    marginBottom: 12,
    gap: 16,
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: 130,
    height: 182,
    borderRadius: 12,
    backgroundColor: '#2A2A50',
  },
  rareBadge: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  rareBadgeText: {
    color: '#D4AF37',
    fontSize: 8,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  cardMeta: { flex: 1, justifyContent: 'space-between' },
  cardName: { color: '#F0F0FF', fontSize: 16, fontWeight: '800', lineHeight: 20 },
  cardSet: { color: '#8888CC', fontSize: 11, marginTop: 4 },
  cardRarity: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  priceSection: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  priceSourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  priceSourceText: { color: '#4A4A70', fontSize: 10 },
  gradeTable: {
    backgroundColor: '#14142A', borderRadius: 14, padding: 14, marginTop: 12,
  },
  gradeTableTitle: { color: '#F0F0FF', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  gradeRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2A2A50',
  },
  gradeLabel: { color: '#8888CC', fontSize: 12 },
  gradeValue: { color: '#F0F0FF', fontSize: 12, fontWeight: '700' },
  gradePremium: { color: '#00C896', fontSize: 12 },
  sourceBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#14142A', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  sourceBadgeText: { color: '#4A4A70', fontSize: 10 },
  disclaimer: {
    backgroundColor: 'rgba(136,136,170,0.1)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10,
  },
  disclaimerText: { color: '#4A4A70', fontSize: 10, lineHeight: 16 },
  currentPrice: { color: '#F0F0FF', fontSize: 22, fontWeight: '800' },
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  badgeGain: { backgroundColor: 'rgba(0,200,150,0.15)' },
  badgeLoss: { backgroundColor: 'rgba(255,64,96,0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  textGain: { color: '#00C896' },
  textLoss: { color: '#FF4060' },
  listingCount: { color: '#4A4A70', fontSize: 11, marginTop: 6 },
  contactBtn: {
    backgroundColor: '#14142A',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  contactBtnText: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  buyBtn: { backgroundColor: '#D4AF37' },
  sellBtn: {
    backgroundColor: '#14142A',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  actionBtnText: { color: '#F0F0FF', fontSize: 15, fontWeight: '700' },
  sellBtnText: { color: '#D4AF37', fontSize: 15, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#14142A',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#D4AF37' },
  tabText: { color: '#8888CC', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#F0F0FF' },
  listingsSection: { paddingHorizontal: 16, gap: 10, display: 'flex' },
  listingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#14142A',
    borderRadius: 14,
    padding: 14,
  },
  listingLeft: {},
  listingSeller: { color: '#F0F0FF', fontSize: 14, fontWeight: '600' },
  listingCondition: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  listingRight: { alignItems: 'flex-end' },
  listingPrice: { color: '#F0F0FF', fontSize: 16, fontWeight: '700' },
  bidBtn: { marginTop: 6 },
  bidBtnText: { color: '#D4AF37', fontSize: 12, fontWeight: '600' },
  chartSection: {
    marginHorizontal: 16,
    backgroundColor: '#14142A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  chartHeader: { marginBottom: 8 },
  chartTitle: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  chartRange: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  detailSection: {
    marginHorizontal: 16,
    backgroundColor: '#14142A',
    borderRadius: 16,
    padding: 16,
  },
  detailTitle: { color: '#F0F0FF', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A50',
  },
  detailLabel: { color: '#8888CC', fontSize: 12 },
  detailValue: { color: '#F0F0FF', fontSize: 12, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#14142A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A4E',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { color: '#F0F0FF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#8888CC', fontSize: 13, marginBottom: 20 },
  option: {
    backgroundColor: '#2A2A50',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  optionTitle: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  optionDesc: { color: '#8888CC', fontSize: 12 },
  cancelBtn: { alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3A3A4E' },
  cancelText: { color: '#8888CC', fontSize: 14, fontWeight: '600' },
  contactBtn: {
    backgroundColor: '#14142A',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  contactBtnText: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
});

export default CardDetailScreen;
