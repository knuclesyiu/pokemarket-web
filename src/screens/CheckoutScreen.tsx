import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PokemonCard } from '../types';
import { calculateFee, formatHkd } from '../utils/feeCalculator';

type RouteProps = RouteProp<{ params: { card: PokemonCard; seller?: string } }, 'params'>;
type NavProp = NativeStackNavigationProp<any>;

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
  accentGold: '#D4AF37',
  accentEmber: '#FF6B35',
  accentJade: '#00C896',
  accentRuby: '#FF4060',
};

const MTR_LINES = [
  { line: '觀塘線', stations: ['油麻地', '旺角', '太子', '九龍塘', '黃大仙', '彩虹', '鑽石山', 'Hob Art', '藍田', '觀塘'] },
  { line: '港島線', stations: ['上環', '中環', '金鐘', '灣仔', '銅鑼灣', '天后', '炮台山', '北角', '鰂魚涌', '太古'] },
  { line: '荃灣線', stations: ['中環', '金鐘', '尖沙咀', '佐敦', '油麻地', '旺角', '太子', '深水埗', '長沙灣', '荔枝角'] },
  { line: '將軍澳線', stations: ['北角', '鰂魚涌', '油塘', '將軍澳', '坑口', '寶琳'] },
];

const CheckoutScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProp>();
  const { card } = route.params;

  const [delivery, setDelivery] = useState<'meetup' | 'sf' | null>(null);
  const [payment, setPayment] = useState<'fps' | 'card' | null>(null);
  const [showMeetupModal, setShowMeetupModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedStation, setSelectedStation] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);

  const fee = calculateFee(card.price);
  const platformFee = fee.platformFeeHkd;
  const deliveryFee = delivery === 'sf' ? 35 : 0;
  const total = fee.buyerTotalHkd + deliveryFee;

  const handlePlaceOrder = () => {
    if (!delivery || !payment) return;
    setOrderPlaced(true);
  };

  if (orderPlaced) {
    return (
      <View style={styles.confirmContainer}>
        <View style={styles.confirmContent}>
          <Text style={styles.confirmEmoji}>✅</Text>
          <Text style={styles.confirmTitle}>訂單已確認！</Text>
          <Text style={styles.confirmSub}>
            款項 HK$ {total.toLocaleString()} 已由平台托管
          </Text>
          <View style={styles.escrowSummary}>
            <Text style={styles.escrowIcon}>🔐</Text>
            <Text style={styles.escrowSummaryText}>
              款項由 PokeMarket 托管，收卡確認後自動轉俾賣家
            </Text>
          </View>
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() => navigation.navigate('OrderStatus', { txId: 'new-order' })}
          >
            <Text style={styles.trackBtnText}>追蹤訂單 →</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backHome}>返回首頁</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>確認訂單</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Escrow Banner */}
      <View style={styles.escrowBanner}>
        <Text style={styles.escrowBannerIcon}>🔐</Text>
        <View style={styles.escrowBannerText}>
          <Text style={styles.escrowBannerTitle}>資金托管安全保障</Text>
          <Text style={styles.escrowBannerDesc}>
            款項由平台代為保管，收卡確認後先轉俾賣家，如有问题可提出争议
          </Text>
        </View>
      </View>

      {/* Card Summary */}
      <View style={styles.cardSummary}>
        <Image source={{ uri: card.imageUrl }} style={styles.cardThumb} />
        <View style={styles.cardSummaryInfo}>
          <Text style={styles.cardSummaryName}>{card.name}</Text>
          <Text style={styles.cardSummarySet}>{card.set} · {card.number}</Text>
          <Text style={styles.cardSummarySeller}>
            賣家：{route.params.seller ?? 'CardMaster_HK'}
          </Text>
        </View>
        <Text style={styles.cardSummaryPriceGold}>HK$ {card.price.toLocaleString()}</Text>
      </View>

      {/* Delivery Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📦 交收方式</Text>
        <View style={styles.optionGrid}>
          <TouchableOpacity
            style={[styles.optionCard, delivery === 'meetup' && styles.optionCardActive]}
            onPress={() => { setDelivery('meetup'); setShowMeetupModal(true); }}
          >
            <Text style={styles.optionIcon}>🤝</Text>
            <Text style={[styles.optionLabel, delivery === 'meetup' && styles.optionLabelActive]}>
              面交
            </Text>
            <Text style={styles.optionDesc}>地鐵站當面交收</Text>
            <Text style={[styles.optionPrice, delivery === 'meetup' && styles.optionPriceActive]}>
              免費
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionCard, delivery === 'sf' && styles.optionCardActive]}
            onPress={() => { setDelivery('sf'); setShowAddressModal(true); }}
          >
            <Text style={styles.optionIcon}>📦</Text>
            <Text style={[styles.optionLabel, delivery === 'sf' && styles.optionLabelActive]}>
              順豐快遞
            </Text>
            <Text style={styles.optionDesc}>送貨上門</Text>
            <Text style={[styles.optionPrice, delivery === 'sf' && styles.optionPriceActive]}>
              HK$ 35
            </Text>
          </TouchableOpacity>
        </View>

        {delivery === 'meetup' && selectedStation && (
          <View style={styles.selectedDetail}>
            <Text style={styles.selectedDetailLabel}>📍 面交站</Text>
            <Text style={styles.selectedDetailValue}>
              {selectedLine} · {selectedStation}
            </Text>
            <TouchableOpacity onPress={() => setShowMeetupModal(true)}>
              <Text style={styles.changeLink}>更換 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {delivery === 'sf' && address.length > 0 && (
          <View style={styles.selectedDetail}>
            <Text style={styles.selectedDetailLabel}>🏠 送貨地址</Text>
            <Text style={styles.selectedDetailValue} numberOfLines={2}>{address}</Text>
            <TouchableOpacity onPress={() => setShowAddressModal(true)}>
              <Text style={styles.changeLink}>更改 →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Payment Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💳 支付方式</Text>
        <View style={styles.paymentOptions}>
          <TouchableOpacity
            style={[styles.paymentCard, payment === 'fps' && styles.paymentCardActive]}
            onPress={() => setPayment('fps')}
          >
            <View style={styles.paymentLeft}>
              <Text style={styles.paymentIcon}>🏧</Text>
              <View>
                <Text style={[styles.paymentLabel, payment === 'fps' && styles.paymentLabelActive]}>
                  FPS 轉數快
                </Text>
                <Text style={styles.paymentSub}>即時轉帳</Text>
              </View>
            </View>
            <View style={[styles.paymentRadio, payment === 'fps' && styles.paymentRadioActive]}>
              {payment === 'fps' && <View style={styles.paymentRadioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentCard, payment === 'card' && styles.paymentCardActive]}
            onPress={() => setPayment('card')}
          >
            <View style={styles.paymentLeft}>
              <Text style={styles.paymentIcon}>💳</Text>
              <View>
                <Text style={[styles.paymentLabel, payment === 'card' && styles.paymentLabelActive]}>
                  信用卡 / 扣帳卡
                </Text>
                <Text style={styles.paymentSub}>Visa / Mastercard</Text>
              </View>
            </View>
            <View style={[styles.paymentRadio, payment === 'card' && styles.paymentRadioActive]}>
              {payment === 'card' && <View style={styles.paymentRadioDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Price breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 金額明細</Text>
        <View style={styles.breakdown}>
          {[
            ['商品金額', formatHkd(fee.cardPriceHkd)],
            ['Stripe 處理費 (2.9%)', formatHkd(fee.stripeFeeHkd)],
            ['平台服務費 (3%)', formatHkd(fee.platformFeeHkd)],
            ['最低手續費', formatHkd(fee.totalFeeHkd)],
            delivery === 'sf' ? ['運費（順豐到付）', `HK$ ${deliveryFee}`] : ['運費', '免費（面交）'],
          ].map(([label, value]) => (
            <View key={label as string} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{label}</Text>
              <Text style={styles.breakdownValue}>{value}</Text>
            </View>
          ))}
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.totalLabel}>總計</Text>
            <Text style={styles.totalValueGold}>HK$ {total.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Confirm button */}
      <View style={styles.footer}>
        <View style={styles.escrowReminder}>
          <Text style={styles.escrowReminderText}>
            🔒 點擊確認即表示同意款項由 PokeMarket 托管，收卡確認後自動轉俾賣家
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, (!delivery || !payment) && styles.confirmBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={!delivery || !payment}
        >
          <Text style={styles.confirmBtnText}>
            確認支付 HK$ {total.toLocaleString()}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* MTR Station Picker Modal */}
      <Modal visible={showMeetupModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>選擇面交站</Text>
            <ScrollView>
              {MTR_LINES.map(l => (
                <View key={l.line} style={modalStyles.lineGroup}>
                  <Text style={modalStyles.lineName}>{l.line}</Text>
                  <View style={modalStyles.stationGrid}>
                    {l.stations.map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[
                          modalStyles.stationChip,
                          selectedStation === s && modalStyles.stationChipActive,
                        ]}
                        onPress={() => {
                          setSelectedLine(l.line);
                          setSelectedStation(s);
                          setShowMeetupModal(false);
                          setDelivery('meetup');
                        }}
                      >
                        <Text style={[
                          modalStyles.stationText,
                          selectedStation === s && modalStyles.stationTextActive,
                        ]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setShowMeetupModal(false)}
            >
              <Text style={modalStyles.closeText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Address Modal */}
      <Modal visible={showAddressModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>填寫送貨地址</Text>
            <View style={modalStyles.addressForm}>
              <Text style={modalStyles.fieldLabel}>香港地址</Text>
              <View style={modalStyles.addressInput}>
                <Text style={modalStyles.addressPlaceholder}>
                  例子：九龍觀塘偉業街 163 號 10 樓
                </Text>
              </View>
              <TouchableOpacity
                style={modalStyles.confirmAddressBtn}
                onPress={() => {
                  setAddress('九龍觀塘偉業街 163 號 10 樓');
                  setShowAddressModal(false);
                  setDelivery('sf');
                }}
              >
                <Text style={modalStyles.confirmAddressBtnText}>確認地址</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setShowAddressModal(false)}
            >
              <Text style={modalStyles.closeText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080810' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 12,
    backgroundColor: '#14142A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  backBtnText: { color: '#F0F0FF', fontSize: 20, fontWeight: '700' },
  headerTitle: { color: '#F0F0FF', fontSize: 17, fontWeight: '700' },
  // NEW: gold tint escrow banner
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,175,55,0.1)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  escrowBannerIcon: { fontSize: 24 },
  escrowBannerText: { flex: 1 },
  escrowBannerTitle: { color: '#D4AF37', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowBannerDesc: { color: '#8888CC', fontSize: 11, lineHeight: 16 },
  // Elevated card summary with gold price
  cardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2A50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  cardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: '#1C1C38' },
  cardSummaryInfo: { flex: 1 },
  cardSummaryName: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  cardSummarySet: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  cardSummarySeller: { color: '#8888CC', fontSize: 11, marginTop: 4 },
  cardSummaryPriceGold: { color: '#D4AF37', fontSize: 16, fontWeight: '800' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1,
    backgroundColor: '#14142A',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // NEW: gold active state
  optionCardActive: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.08)' },
  optionIcon: { fontSize: 28, marginBottom: 8 },
  optionLabel: { color: '#F0F0FF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  optionLabelActive: { color: '#D4AF37' },
  optionDesc: { color: '#8888CC', fontSize: 10, marginBottom: 4 },
  optionPrice: { color: '#8888CC', fontSize: 12, fontWeight: '600' },
  optionPriceActive: { color: '#D4AF37' },
  selectedDetail: {
    backgroundColor: '#14142A',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  selectedDetailLabel: { color: '#8888CC', fontSize: 11 },
  selectedDetailValue: { color: '#F0F0FF', fontSize: 12, fontWeight: '600', flex: 1 },
  changeLink: { color: '#D4AF37', fontSize: 12, fontWeight: '600' },
  paymentOptions: { gap: 10 },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#14142A',
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentCardActive: { borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,0.08)' },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentIcon: { fontSize: 24 },
  paymentLabel: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  paymentLabelActive: { color: '#D4AF37' },
  paymentSub: { color: '#8888CC', fontSize: 11 },
  paymentRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#2A2A50', alignItems: 'center', justifyContent: 'center',
  },
  paymentRadioActive: { borderColor: '#D4AF37' },
  paymentRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D4AF37' },
  // Elevated breakdown with gold total
  breakdown: {
    backgroundColor: '#14142A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A50',
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownLabel: { color: '#8888CC', fontSize: 13 },
  breakdownValue: { color: '#F0F0FF', fontSize: 13 },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: '#2A2A50', paddingTop: 10, marginTop: 4, marginBottom: 0 },
  totalLabel: { color: '#F0F0FF', fontSize: 15, fontWeight: '700' },
  totalValueGold: { color: '#D4AF37', fontSize: 18, fontWeight: '800' },
  footer: { paddingHorizontal: 16 },
  escrowReminder: {
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  escrowReminderText: { color: '#8888CC', fontSize: 11, lineHeight: 16 },
  // NEW: gold CTA confirm button
  confirmBtn: {
    backgroundColor: '#D4AF37',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#2A2A50' },
  confirmBtnText: { color: '#080810', fontSize: 16, fontWeight: '800' },
  // Order success
  confirmContainer: { flex: 1, backgroundColor: '#080810', alignItems: 'center', justifyContent: 'center' },
  confirmContent: { alignItems: 'center', paddingHorizontal: 24 },
  confirmEmoji: { fontSize: 64, marginBottom: 16 },
  confirmTitle: { color: '#F0F0FF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  confirmSub: { color: '#8888CC', fontSize: 14, marginBottom: 20 },
  escrowSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#14142A', borderRadius: 12, padding: 14, gap: 10, marginBottom: 24, borderWidth: 1, borderColor: '#2A2A50' },
  escrowIcon: { fontSize: 24 },
  escrowSummaryText: { color: '#8888CC', fontSize: 12, flex: 1 },
  trackBtn: { backgroundColor: '#D4AF37', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 12 },
  trackBtnText: { color: '#080810', fontSize: 15, fontWeight: '700' },
  backHome: { color: '#8888CC', fontSize: 14 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1C1C38', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: '#2A2A50' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3D3D70', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#F0F0FF', fontSize: 18, fontWeight: '800', marginBottom: 20 },
  lineGroup: { marginBottom: 16 },
  lineName: { color: '#D4AF37', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  stationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stationChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#14142A', borderWidth: 1, borderColor: '#2A2A50' },
  stationChipActive: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  stationText: { color: '#8888CC', fontSize: 12 },
  stationTextActive: { color: '#080810', fontWeight: '600' },
  closeBtn: { alignItems: 'center', marginTop: 16 },
  closeText: { color: '#8888CC', fontSize: 14, fontWeight: '600' },
  addressForm: { marginBottom: 16 },
  fieldLabel: { color: '#8888CC', fontSize: 12, marginBottom: 8 },
  addressInput: { backgroundColor: '#14142A', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A50' },
  addressPlaceholder: { color: '#4A4A70', fontSize: 14 },
  confirmAddressBtn: { backgroundColor: '#D4AF37', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  confirmAddressBtnText: { color: '#080810', fontSize: 14, fontWeight: '700' },
});

export default CheckoutScreen;