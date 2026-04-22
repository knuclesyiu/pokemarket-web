import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PokemonCard } from '../types';

type RouteProps = RouteProp<{ params: { card: PokemonCard; seller?: string } }, 'params'>;
type NavProp = NativeStackNavigationProp<any>;

const MTR_LINES = [
  { line: '觀塘線', stations: ['油麻地', '旺角', '太子', '九龍塘', '黃大仙', '彩虹', '鑽石山', ' Hob Art', '藍田', '觀塘'] },
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

  const platformFee = Math.round(card.price * 0.03);
  const deliveryFee = delivery === 'sf' ? 35 : 0;
  const total = card.price + platformFee + deliveryFee;

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
        <Text style={styles.cardSummaryPrice}>HK$ {card.price.toLocaleString()}</Text>
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

        {/* Selected meetup station */}
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

        {/* Selected address */}
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
            ['商品金額', `HK$ ${card.price.toLocaleString()}`],
            ['平台服務費 (3%)', `HK$ ${platformFee.toLocaleString()}`],
            delivery === 'sf' ? ['運費（順豐到付）', `HK$ ${deliveryFee}`] : ['運費', '免費（面交）'],
          ].map(([label, value]) => (
            <View key={label as string} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{label}</Text>
              <Text style={styles.breakdownValue}>{value}</Text>
            </View>
          ))}
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.totalLabel}>總計</Text>
            <Text style={styles.totalValue}>HK$ {total.toLocaleString()}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
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
    backgroundColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,184,0,0.1)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.25)',
  },
  escrowBannerIcon: { fontSize: 24 },
  escrowBannerText: { flex: 1 },
  escrowBannerTitle: { color: '#FFB800', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowBannerDesc: { color: '#8888AA', fontSize: 11, lineHeight: 16 },
  cardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  cardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: '#2A2A3E' },
  cardSummaryInfo: { flex: 1 },
  cardSummaryName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  cardSummarySet: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  cardSummarySeller: { color: '#8888AA', fontSize: 11, marginTop: 4 },
  cardSummaryPrice: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1,
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: { borderColor: '#FF3C3C', backgroundColor: 'rgba(255,60,60,0.08)' },
  optionIcon: { fontSize: 28, marginBottom: 8 },
  optionLabel: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  optionLabelActive: { color: '#FF3C3C' },
  optionDesc: { color: '#8888AA', fontSize: 10, marginBottom: 4 },
  optionPrice: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  optionPriceActive: { color: '#FF3C3C' },
  selectedDetail: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedDetailLabel: { color: '#8888AA', fontSize: 11 },
  selectedDetailValue: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', flex: 1 },
  changeLink: { color: '#FF3C3C', fontSize: 11, fontWeight: '600' },
  paymentOptions: { gap: 10 },
  paymentCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentCardActive: { borderColor: '#FF3C3C' },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentIcon: { fontSize: 24 },
  paymentLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  paymentLabelActive: { color: '#FF3C3C' },
  paymentSub: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  paymentRadio: {
    width: 22, height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#3A3A4E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentRadioActive: { borderColor: '#FF3C3C' },
  paymentRadioDot: {
    width: 10, height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3C3C',
  },
  breakdown: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  breakdownLabel: { color: '#8888AA', fontSize: 13 },
  breakdownValue: { color: '#FFFFFF', fontSize: 13 },
  breakdownTotal: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A3E',
    marginTop: 8,
    paddingTop: 14,
  },
  totalLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  totalValue: { color: '#FF3C3C', fontSize: 18, fontWeight: '800' },
  footer: { paddingHorizontal: 16 },
  escrowReminder: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  escrowReminderText: { color: '#8888AA', fontSize: 11, lineHeight: 16 },
  confirmBtn: {
    backgroundColor: '#FF3C3C',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: '#3A3A4E' },
  confirmBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  // confirm screen
  confirmContainer: {
    flex: 1,
    backgroundColor: '#12121F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmContent: { alignItems: 'center', width: '100%' },
  confirmEmoji: { fontSize: 64, marginBottom: 16 },
  confirmTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  confirmSub: { color: '#8888AA', fontSize: 14, marginBottom: 16 },
  escrowSummary: {
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.2)',
    width: '100%',
  },
  escrowIcon: { fontSize: 20 },
  escrowSummaryText: { color: '#FFB800', fontSize: 12, flex: 1, lineHeight: 18 },
  trackBtn: {
    backgroundColor: '#FF3C3C',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  backHome: { color: '#8888AA', fontSize: 13 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1E1E2E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A4E', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  lineGroup: { marginBottom: 16 },
  lineName: { color: '#FF3C3C', fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 1 },
  stationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stationChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#2A2A3E', borderWidth: 1, borderColor: 'transparent' },
  stationChipActive: { backgroundColor: '#FF3C3C', borderColor: '#FF3C3C' },
  stationText: { color: '#8888AA', fontSize: 12 },
  stationTextActive: { color: '#FFFFFF', fontWeight: '600' },
  addressForm: { marginBottom: 16 },
  fieldLabel: { color: '#8888AA', fontSize: 12, marginBottom: 8 },
  addressInput: { backgroundColor: '#2A2A3E', borderRadius: 12, padding: 14, minHeight: 60 },
  addressPlaceholder: { color: '#6666AA', fontSize: 13 },
  confirmAddressBtn: { backgroundColor: '#FF3C3C', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  confirmAddressBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  closeBtn: { alignItems: 'center', marginTop: 16 },
  closeText: { color: '#8888AA', fontSize: 14, fontWeight: '600' },
});

export default CheckoutScreen;
