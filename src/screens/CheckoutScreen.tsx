import React, { useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getAuth } from 'firebase/auth';
import { PokemonCard } from '../types';
import { calculateFee, formatHkd, PLATFORM_FEE_PERCENT, STRIPE_PERCENT_FEE } from '../utils/feeCalculator';
import { createEscrowPayment, confirmCardPayment } from '../services/stripeService';
import CardPaymentForm from '../components/CardPaymentForm';
import { notify } from '../components/Feedback';
import { C, themed } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type RouteProps = RouteProp<{ params: { card: PokemonCard; seller?: string } }, 'params'>;
type NavProp = NativeStackNavigationProp<any>;

// NEW: Obsidian Gallery constants
const COLORS = {
  bgVoid: C.void,
  bgSurface: C.surface,
  bgCard: C.card,
  bgElevated: C.elevated,
  borderSubtle: C.border,
  borderActive: C.borderActive,
  textPrimary: C.text,
  textSecondary: C.textSecondary,
  accentGold: C.gold,
  accentEmber: C.warn,
  accentJade: C.up,
  accentRuby: C.ruby,
};

const MTR_LINES = [
  { line: '觀塘線', stations: ['油麻地', '旺角', '太子', '九龍塘', '黃大仙', '彩虹', '鑽石山', 'Hob Art', '藍田', '觀塘'] },
  { line: '港島線', stations: ['上環', '中環', '金鐘', '灣仔', '銅鑼灣', '天后', '炮台山', '北角', '鰂魚涌', '太古'] },
  { line: '荃灣線', stations: ['中環', '金鐘', '尖沙咀', '佐敦', '油麻地', '旺角', '太子', '深水埗', '長沙灣', '荔枝角'] },
  { line: '將軍澳線', stations: ['北角', '鰂魚涌', '油塘', '將軍澳', '坑口', '寶琳'] },
];

const CheckoutScreen: React.FC = () => {
  const { t } = useAppearance();

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
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Card collection form
  const [showCardForm, setShowCardForm] = useState(false);
  const [getPaymentMethodId, setGetPaymentMethodId] = useState<
    (() => Promise<string | null>) | null
  >(null);

  const fee = calculateFee(card.price);
  const platformFee = fee.platformFeeHkd;
  const deliveryFee = delivery === 'sf' ? 35 : 0;
  const total = fee.buyerTotalHkd + deliveryFee;

  const handlePlaceOrder = async () => {
    if (!delivery || !payment) return;
    const uid = getAuth().currentUser?.uid;
    if (!uid) {
      notify(t('需要登入'), '請先登入再下單');
      return;
    }
    // Card payments require entering card details first
    if (payment === 'card' && !showCardForm) {
      setShowCardForm(true);
      return;
    }
    setSubmitting(true);
    try {
      // 1. Ask Cloud Function to create the PaymentIntent. The server
      //    works out the fees and charges the buyer; we send the card
      //    price and the shipping charge, not a total of our own.
      //    The charge stays on the platform account, so Stripe holds
      //    the money until the buyer confirms the card.
      const { clientSecret, paymentIntentId } = await createEscrowPayment({
        orderId: '', // server fills in
        cardPriceHkd: card.price,
        deliveryFeeHkd: deliveryFee,
        sellerId: route.params.seller ?? '',
        deliveryMethod: delivery,
        cardName: card.name,
        cardId: card.id,
      });
      // 2. If buyer chose card, confirm with Stripe SDK using clientSecret.
      //    FPS path skips this and waits for buyer to transfer manually;
      //    order stays in 'awaiting_fps' until webhook confirms receipt.
      if (payment === 'card') {
        // The card form hands us a factory that turns the card the user
        // entered (collected by Stripe's own element) into a
        // PaymentMethod. Stripe never lets raw card data touch our code.
        if (!getPaymentMethodId) {
          throw new Error('請先填寫信用卡資料');
        }
        await confirmCardPayment(clientSecret, { getPaymentMethodId });
        // paymentIntent.id === paymentIntentId once confirmed
      }
      // 3. Order created server-side; navigate to status screen with real ID.
      setCreatedOrderId(paymentIntentId);
      setOrderPlaced(true);
    } catch (e: any) {
      console.error('[Checkout] place order failed:', e);
      notify('下單失敗', e?.message ?? '請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  if (orderPlaced) {
    return (
      <View style={styles.confirmContainer}>
        <View style={styles.confirmContent}>
          <Ionicons name="checkmark-circle" size={14} color={C.textTertiary} />
          <Text style={styles.confirmTitle}>{t('訂單已確認！')}</Text>
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
            onPress={() => navigation.navigate('OrderStatus', { orderId: createdOrderId ?? '', txId: createdOrderId ?? '' })}
            disabled={!createdOrderId}
          >
            <Text style={styles.trackBtnText}>{t('追蹤訂單 →')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backHome}>{t('返回首頁')}</Text>
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
        <Text style={styles.headerTitle}>{t('確認訂單')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Escrow Banner */}
      <View style={styles.escrowBanner}>
        <Text style={styles.escrowBannerIcon}>🔐</Text>
        <View style={styles.escrowBannerText}>
          <Text style={styles.escrowBannerTitle}>{t('資金託付安全保障')}</Text>
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
        <Text style={styles.sectionTitle}>{t('📦 交收方式')}</Text>
        <View style={styles.optionGrid}>
          <TouchableOpacity
            style={[styles.optionCard, delivery === 'meetup' ? styles.optionCardActive : null]}
            onPress={() => { setDelivery('meetup'); setShowMeetupModal(true); }}
          >
            <Text style={styles.optionIcon}>🤝</Text>
            <Text style={[styles.optionLabel, delivery === 'meetup' ? styles.optionLabelActive : null]}>
              面交
            </Text>
            <Text style={styles.optionDesc}>{t('地鐵站當面交收')}</Text>
            <Text style={[styles.optionPrice, delivery === 'meetup' ? styles.optionPriceActive : null]}>
              免費
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionCard, delivery === 'sf' ? styles.optionCardActive : null]}
            onPress={() => { setDelivery('sf'); setShowAddressModal(true); }}
          >
            <Text style={styles.optionIcon}>📦</Text>
            <Text style={[styles.optionLabel, delivery === 'sf' ? styles.optionLabelActive : null]}>
              順豐快遞
            </Text>
            <Text style={styles.optionDesc}>{t('送貨上門')}</Text>
            <Text style={[styles.optionPrice, delivery === 'sf' ? styles.optionPriceActive : null]}>
              HK$ 35
            </Text>
          </TouchableOpacity>
        </View>

        {delivery === 'meetup' && selectedStation && (
          <View style={styles.selectedDetail}>
            <Text style={styles.selectedDetailLabel}>{t('📍 面交站')}</Text>
            <Text style={styles.selectedDetailValue}>
              {selectedLine} · {selectedStation}
            </Text>
            <TouchableOpacity onPress={() => setShowMeetupModal(true)}>
              <Text style={styles.changeLink}>{t('更換 →')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {delivery === 'sf' && address.length > 0 && (
          <View style={styles.selectedDetail}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="home-outline" size={14} color={C.textTertiary} /><Text style={styles.selectedDetailLabel}>{t('送貨地址')}</Text></View>
            <Text style={styles.selectedDetailValue} numberOfLines={2}>{address}</Text>
            <TouchableOpacity onPress={() => setShowAddressModal(true)}>
              <Text style={styles.changeLink}>{t('更改 →')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Payment Method */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('💳 支付方式')}</Text>
        <View style={styles.paymentOptions}>
          <TouchableOpacity
            style={[styles.paymentCard, payment === 'fps' ? styles.paymentCardActive : null]}
            onPress={() => setPayment('fps')}
          >
            <View style={styles.paymentLeft}>
              <Text style={styles.paymentIcon}>🏧</Text>
              <View>
                <Text style={[styles.paymentLabel, payment === 'fps' ? styles.paymentLabelActive : null]}>
                  FPS 轉數快
                </Text>
                <Text style={styles.paymentSub}>{t('即時轉帳')}</Text>
              </View>
            </View>
            <View style={[styles.paymentRadio, payment === 'fps' ? styles.paymentRadioActive : null]}>
              {payment === 'fps' && <View style={styles.paymentRadioDot} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentCard, payment === 'card' ? styles.paymentCardActive : null]}
            onPress={() => setPayment('card')}
          >
            <View style={styles.paymentLeft}>
              <Text style={styles.paymentIcon}>💳</Text>
              <View>
                <Text style={[styles.paymentLabel, payment === 'card' ? styles.paymentLabelActive : null]}>
                  信用卡 / 扣帳卡
                </Text>
                <Text style={styles.paymentSub}>Visa / Mastercard</Text>
              </View>
            </View>
            <View style={[styles.paymentRadio, payment === 'card' ? styles.paymentRadioActive : null]}>
              {payment === 'card' && <View style={styles.paymentRadioDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Price breakdown */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="wallet-outline" size={15} color={C.textTertiary} /><Text style={styles.sectionTitle}>{t('金額明細')}</Text></View>
        <View style={styles.breakdown}>
          {[
            ['商品金額', formatHkd(fee.cardPriceHkd)],
            [`Stripe 處理費 (${Math.round(STRIPE_PERCENT_FEE * 100)}% + HK$2.35)`, formatHkd(fee.stripeFeeHkd)],
            [`平台服務費 (${Math.round(PLATFORM_FEE_PERCENT * 100)}%)`, formatHkd(fee.platformFeeHkd)],
            ['總手續費', formatHkd(fee.totalFeeHkd)],
            delivery === 'sf' ? ['運費（順豐到付）', `HK$ ${deliveryFee}`] : ['運費', '免費（面交）'],
          ].map(([label, value]) => (
            <View key={label as string} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{label}</Text>
              <Text style={styles.breakdownValue}>{value}</Text>
            </View>
          ))}
          <View style={[styles.breakdownRow, styles.breakdownTotal]}>
            <Text style={styles.totalLabel}>{t('總計')}</Text>
            <Text style={styles.totalValueGold}>HK$ {total.toLocaleString()}</Text>
          </View>
        </View>
      </View>

      {/* Confirm button */}
      <View style={styles.footer}>
        <View style={styles.escrowReminder}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="lock-closed-outline" size={13} color={C.textTertiary} /><Text style={styles.escrowReminderText}>點擊確認即表示同意款項由 PokeMarket 托管，收卡確認後自動轉俾賣家
          </Text></View>
        </View>
        <TouchableOpacity
          style={[styles.confirmBtn, (!delivery || !payment || submitting) ? styles.confirmBtnDisabled : null]}
          onPress={handlePlaceOrder}
          disabled={!delivery || !payment || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={C.void} />
          ) : (
            <Text style={styles.confirmBtnText}>
              {payment === 'card' && !showCardForm
                ? '下一步：填寫信用卡資料'
                : `確認支付 HK$ ${total.toLocaleString()}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* MTR Station Picker Modal */}
      <Modal visible={showMeetupModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>{t('選擇面交站')}</Text>
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
              <Text style={modalStyles.closeText}>{t('關閉')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Address Modal */}
      <Modal visible={showAddressModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>{t('填寫送貨地址')}</Text>
            <View style={modalStyles.addressForm}>
              <Text style={modalStyles.fieldLabel}>{t('香港地址')}</Text>
              <TextInput
                style={modalStyles.addressInputField}
                placeholder={t('例：九龍觀塘偉業街 163 號 10 樓')}
                placeholderTextColor={C.textDisabled}
                value={address}
                onChangeText={setAddress}
                multiline
              />
              <TouchableOpacity
                style={modalStyles.confirmAddressBtn}
                onPress={() => {
                  if (!address.trim()) {
                    notify(t('請填地址'), '送貨地址不能空白');
                    return;
                  }
                  setShowAddressModal(false);
                  setDelivery('sf');
                }}
              >
                <Text style={modalStyles.confirmAddressBtnText}>{t('確認地址')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setShowAddressModal(false)}
            >
              <Text style={modalStyles.closeText}>{t('取消')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Card Details Modal — shown when buyer picks card payment */}
      <Modal visible={showCardForm} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>{t('💳 信用卡資料')}</Text>
            <Text style={modalStyles.subtitle}>
              透過 Stripe 加密處理。款項先由平台託管，收卡後釋放。
            </Text>

            <CardPaymentForm
              onPaymentMethodReady={setGetPaymentMethodId}
              submitting={submitting}
            />

            <TouchableOpacity
              style={modalStyles.confirmAddressBtn}
              onPress={handlePlaceOrder}
              disabled={submitting || !getPaymentMethodId}
            >
              {submitting ? (
                <ActivityIndicator color={C.void} />
              ) : (
                <Text style={modalStyles.confirmAddressBtnText}>
                  立即支付 HK$ {total.toLocaleString()}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setShowCardForm(false)}
            >
              <Text style={modalStyles.closeText}>{t('返回')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
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
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  backBtnText: { color: C.text, fontSize: 20, fontWeight: '700' },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
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
  escrowBannerTitle: { color: C.gold, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowBannerDesc: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
  // Elevated card summary with gold price
  cardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  cardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: C.elevated },
  cardSummaryInfo: { flex: 1 },
  cardSummaryName: { color: C.text, fontSize: 14, fontWeight: '700' },
  cardSummarySet: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  cardSummarySeller: { color: C.textSecondary, fontSize: 11, marginTop: 4 },
  cardSummaryPriceGold: { color: C.gold, fontSize: 16, fontWeight: '800' },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  optionGrid: { flexDirection: 'row', gap: 10 },
  optionCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // NEW: gold active state
  optionCardActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  optionIcon: { fontSize: 28, marginBottom: 8 },
  optionLabel: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  optionLabelActive: { color: C.gold },
  optionDesc: { color: C.textSecondary, fontSize: 10, marginBottom: 4 },
  optionPrice: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  optionPriceActive: { color: C.gold },
  selectedDetail: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  selectedDetailLabel: { color: C.textSecondary, fontSize: 11 },
  selectedDetailValue: { color: C.text, fontSize: 12, fontWeight: '600', flex: 1 },
  changeLink: { color: C.gold, fontSize: 12, fontWeight: '600' },
  paymentOptions: { gap: 10 },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentCardActive: { borderColor: C.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paymentIcon: { fontSize: 24 },
  paymentLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  paymentLabelActive: { color: C.gold },
  paymentSub: { color: C.textSecondary, fontSize: 11 },
  paymentRadio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  paymentRadioActive: { borderColor: C.gold },
  paymentRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.gold },
  // Elevated breakdown with gold total
  breakdown: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownLabel: { color: C.textSecondary, fontSize: 13 },
  breakdownValue: { color: C.text, fontSize: 13 },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 4, marginBottom: 0 },
  totalLabel: { color: C.text, fontSize: 15, fontWeight: '700' },
  totalValueGold: { color: C.gold, fontSize: 18, fontWeight: '800' },
  footer: { paddingHorizontal: 16 },
  escrowReminder: {
    backgroundColor: 'rgba(212,175,55,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  escrowReminderText: { color: C.textSecondary, fontSize: 11, lineHeight: 16 },
  // NEW: gold CTA confirm button
  confirmBtn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: C.border },
  confirmBtnText: { color: C.void, fontSize: 16, fontWeight: '800' },
  // Order success
  confirmContainer: { flex: 1, backgroundColor: C.void, alignItems: 'center', justifyContent: 'center' },
  confirmContent: { alignItems: 'center', paddingHorizontal: 24 },
  confirmEmoji: { fontSize: 64, marginBottom: 16 },
  confirmTitle: { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 8 },
  confirmSub: { color: C.textSecondary, fontSize: 14, marginBottom: 20 },
  escrowSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, gap: 10, marginBottom: 24, borderWidth: 1, borderColor: C.border },
  escrowIcon: { fontSize: 24 },
  escrowSummaryText: { color: C.textSecondary, fontSize: 12, flex: 1 },
  trackBtn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginBottom: 12 },
  trackBtnText: { color: C.void, fontSize: 15, fontWeight: '700' },
  backHome: { color: C.textSecondary, fontSize: 14 },
}))

const modalStyles = themed((C) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: C.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderActive, alignSelf: 'center', marginBottom: 16 },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 20 },
  lineGroup: { marginBottom: 16 },
  lineName: { color: C.gold, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  stationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stationChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  stationChipActive: { backgroundColor: C.gold, borderColor: C.gold },
  stationText: { color: C.textSecondary, fontSize: 12 },
  stationTextActive: { color: C.void, fontWeight: '600' },
  closeBtn: { alignItems: 'center', marginTop: 16 },
  closeText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  addressForm: { marginBottom: 16 },
  fieldLabel: { color: C.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 8 },
  addressInput: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  addressInputField: {
    backgroundColor: C.card, color: C.text, fontSize: 14,
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.border, minHeight: 60,
  },
  cardField: {
    backgroundColor: C.card, color: C.text, fontSize: 16,
    borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  subtitle: { color: C.textSecondary, fontSize: 12, marginBottom: 16, lineHeight: 18 },
  addressPlaceholder: { color: C.textDisabled, fontSize: 14 },
  confirmAddressBtn: { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  confirmAddressBtnText: { color: C.void, fontSize: 14, fontWeight: '700' },
}))

export default CheckoutScreen;