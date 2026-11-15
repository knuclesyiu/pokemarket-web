import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { releaseFundsToSeller, raiseDispute } from '../services/stripeService';
import { notify } from '../components/Feedback';
import { C } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type RouteProps = RouteProp<{ params: { txId?: string; orderId?: string } }, 'params'>;

type EscrowStep = 'paid' | 'awaiting_ship' | 'shipped' | 'confirmed' | 'released' | 'disputed' | 'pending_seller_consent';

interface TimelineStep {
  key: EscrowStep;
  label: string;
  sublabel: string;
  icon: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'paid', label: '已付款', sublabel: '款項由平台托管', icon: '💳' },
  { key: 'awaiting_ship', label: '等待發貨', sublabel: '賣家準備中', icon: '📦' },
  { key: 'shipped', label: '已發貨', sublabel: '快件運輸中', icon: '🚚' },
  { key: 'confirmed', label: '已確認收貨', sublabel: '等待資金釋放', icon: '' },
  { key: 'released', label: '資金已釋放', sublabel: '交易完成', icon: '🎉' },
];

const OrderStatusScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const orderId = route.params.orderId ?? route.params.txId ?? '';
  const uid = getAuth().currentUser?.uid;

  // ── Real order data — subscribe to Firestore so UI updates when webhook
  //    changes the status (paid → shipped → confirmed → released). ────────
  const [order, setOrder] = useState<any | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setOrderError('缺少 orderId');
      setLoadingOrder(false);
      return;
    }
    setLoadingOrder(true);
    const unsub = onSnapshot(
      doc(db, 'orders', orderId),
      (snap) => {
        if (snap.exists()) setOrder({ id: snap.id, ...snap.data() });
        else setOrderError('訂單不存在或已刪除');
        setLoadingOrder(false);
      },
      (err) => {
        console.warn('[OrderStatus] snapshot error:', err);
        setOrderError(err.message);
        setLoadingOrder(false);
      }
    );
    return unsub;
  }, [orderId]);

  const isSeller = order ? order.sellerId === uid : false;
  const currentStep = order
    ? mapStatusToStep(order.status)
    : 0;

  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [releaseAmountText, setReleaseAmountText] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [showSellerConsentModal, setShowSellerConsentModal] = useState(false);
  const [sellerConsenting, setSellerConsenting] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isExtended, setIsExtended] = useState(false);
  const [extending, setExtending] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'funds_escrowed' | 'released' | 'disputed'>('funds_escrowed');

  // Map Firestore order.status string → timeline index
  function mapStatusToStep(status: string): number {
    switch (status) {
      case 'pending':
      case 'awaiting_fps':
      case 'awaiting_payment':
        return 0; // paid (just created)
      case 'paid':
      case 'funds_escrowed':
        return 1; // awaiting ship
      case 'shipped':
      case 'in_transit':
        return 2; // shipped
      case 'confirmed':
      case 'pending_release':
      case 'pending_seller_consent':
        return 3; // confirmed
      case 'released':
      case 'completed':
        return 4; // released
      case 'disputed':
      case 'refunded':
        return 5; // disputed (out of timeline)
      default:
        return 0;
    }
  }

  const handleExtendEscrow = async () => {
    if (isExtended || extending) return;
    setExtending(true);
    try {
      const extendFn = httpsCallable(getFunctions(), 'extendEscrow');
      await extendFn({ orderId });
      setIsExtended(true);
      notify('已延長', '款項釋放期限已延長至 14 日，請放心。');
    } catch (e: any) {
      notify('延長失敗', e.message ?? '請稍後再試');
    } finally {
      setExtending(false);
    }
  };

  const handleCreateDispute = async () => {
    if (!disputeReason.trim()) {
      notify('請輸入', '請描述問題原因才能提交 dispute');
      return;
    }
    setDisputing(true);
    try {
      await raiseDispute({ orderId, reason: disputeReason.trim() });
      setShowDisputeModal(false);
      setOrderStatus('disputed');
      notify('Dispute 已提交', '我們會在 24 小時內處理，請留意通知。');
    } catch (e: any) {
      notify('提交失敗', e?.message ?? '請稍後再試');
    } finally {
      setDisputing(false);
    }
  };

  // Real card data comes from order.card (snapshotted at checkout time)
  const card = order
    ? {
        name: order.cardName ?? 'Pokemon Card',
        set: order.cardSet ?? '',
        imageUrl: order.cardImageUrl ?? '',
        price: order.amountHkd ?? 0,
        counterparty: isSeller ? order.buyerName ?? '買家' : order.sellerName ?? '賣家',
        deliveryMethod: order.deliveryMethod ?? 'sf',
        trackingNumber: order.trackingNumber ?? '',
      }
    : null;

  const handleConfirmReceipt = async () => {
    // For meetup: buyer marks card received → order moves to 'confirmed'
    try {
      const fn = getFunctions();
      const confirmFn = httpsCallable(fn, 'confirmReceipt');
      await confirmFn({ orderId });
      // Real-time listener will update the UI
    } catch (e: any) {
      notify('確認失敗', e?.message ?? '請稍後再試');
    }
  };

  const handleReleaseFund = () => {
    setReleaseAmountText(String(card?.price ?? ''));
    setShowReleaseModal(true);
  };

  const confirmRelease = async () => {
    const enteredAmount = parseFloat(releaseAmountText);
    if (isNaN(enteredAmount) || enteredAmount <= 0) return;
    if (!card || enteredAmount > card.price) return;
    setReleasing(true);
    setShowReleaseModal(false);
    try {
      const sellerStripeAccountId = order?.sellerStripeAccountId ?? '';
      const result = await releaseFundsToSeller({
        orderId,
        sellerStripeAccountId,
      });
      if ((result as any)?.status === 'pending_seller_consent') {
        setShowSellerConsentModal(true);
        return;
      }
      // Successful release — Firestore listener will move us to 'released' step
    } catch (e: any) {
      console.error('[OrderStatus] release failed:', e);
      notify('釋放失敗', e?.message ?? '請稍後再試');
    } finally {
      setReleasing(false);
    }
  };

  const handleSellerAccept = async () => {
    setSellerConsenting(true);
    setShowSellerConsentModal(false);
    try {
      const fn = getFunctions();
      const fn2 = httpsCallable(fn, 'sellerRespondToModification');
      await fn2({ orderId, accept: true });
    } catch (e) { console.warn('[OrderStatus] seller accept failed:', e); }
    setSellerConsenting(false);
  };

  const handleSellerReject = async () => {
    setSellerConsenting(true);
    setShowSellerConsentModal(false);
    try {
      const fn = getFunctions();
      const fn2 = httpsCallable(fn, 'sellerRespondToModification');
      await fn2({ orderId, accept: false });
    } catch (e) { console.warn('[OrderStatus] seller reject failed:', e); }
    setSellerConsenting(false);
  };

  if (loadingOrder) {
    return (
      <View style={{ flex: 1, backgroundColor: C.void, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.gold} size="large" />
        <Text style={{ color: C.textSecondary, marginTop: 12 }}>載入訂單中…</Text>
      </View>
    );
  }
  if (orderError || !order || !card) {
    return (
      <View style={{ flex: 1, backgroundColor: C.void, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: C.text, fontSize: 18, marginBottom: 8 }}>😕 訂單未找到</Text>
        <Text style={{ color: C.textSecondary, fontSize: 13, textAlign: 'center' }}>{orderError ?? `orderId: ${orderId}`}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 24, padding: 12 }}>
          <Text style={{ color: C.gold, fontSize: 14, fontWeight: '700' }}>← 返回</Text>
        </TouchableOpacity>
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
        <Text style={styles.headerTitle}>訂單詳情</Text>
        <TouchableOpacity style={styles.chatBtn}>
          <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Escrow Banner */}
      <View style={styles.escrowBanner}>
        <Text style={styles.escrowBannerIcon}>🔐</Text>
        <View style={styles.escrowBannerText}>
          <Text style={styles.escrowBannerTitle}>
            {currentStep < 3 ? '資金由平台託付中' : currentStep === 4 ? '資金已釋放俾賣家' : '資金已釋放'}
          </Text>
          <Text style={styles.escrowBannerDesc}>
            {currentStep < 3
              ? `HK$ ${card.price.toLocaleString()} 擔保中，確認收卡後自動轉俾賣家`
              : '交易完成，資金已轉俾賣家'}
          </Text>
        </View>
        {currentStep < 3 && (
          <View style={styles.escrowAmountBadge}>
            <Text style={styles.escrowAmountBadgeText}>HK$4,200</Text>
          </View>
        )}
      </View>

      {/* Card info */}
      <View style={styles.cardSummary}>
        <Image source={{ uri: card.imageUrl }} style={styles.cardThumb} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{card.name}</Text>
          <Text style={styles.cardSet}>{card.set}</Text>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>{isSeller ? '你是賣家' : '你是買家'}</Text>
          </View>
        </View>
        <Text style={styles.cardPrice}>HK${card.price.toLocaleString()}</Text>
      </View>

      {/* Escrow Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 交易進度</Text>
        <View style={styles.timeline}>
          {TIMELINE_STEPS.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            const isPending = index > currentStep;

            return (
              <View key={step.key} style={styles.timelineStep}>
                {/* Connector line */}
                {index > 0 && (
                  <View style={[
                    styles.timelineConnector,
                    isCompleted ? styles.timelineConnectorDone : null
                  ]} />
                )}
                {/* Step circle */}
                <View style={[
                  styles.stepCircle,
                  isCompleted ? styles.stepCircleDone : null,
                  isCurrent ? styles.stepCircleCurrent : null,
                  isPending ? styles.stepCirclePending : null,
                ]}>
                  {isCompleted ? (
                    <Text style={styles.stepCheck}>✓</Text>
                  ) : (
                    <Text style={styles.stepIcon}>{step.icon}</Text>
                  )}
                </View>
                {/* Step content */}
                <View style={styles.stepContent}>
                  <Text style={[
                    styles.stepLabel,
                    isCompleted ? styles.stepLabelDone : null,
                    isCurrent ? styles.stepLabelCurrent : null,
                    isPending ? styles.stepLabelPending : null,
                  ]}>
                    {step.label}
                  </Text>
                  <Text style={styles.stepSublabel}>{step.sublabel}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Delivery info */}
      {(currentStep >= 2) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚚 物流資訊</Text>
          <View style={styles.deliveryCard}>
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>方式</Text>
              <Text style={styles.deliveryValue}>
                {card.deliveryMethod === 'sf' ? '📦 順豐快遞' : '🤝 面交'}
              </Text>
            </View>
            {card.trackingNumber && (
              <View style={styles.deliveryRow}>
                <Text style={styles.deliveryLabel}>運單號</Text>
                <Text style={styles.deliveryValue}>{card.trackingNumber}</Text>
              </View>
            )}
            <View style={styles.deliveryRow}>
              <Text style={styles.deliveryLabel}>對方</Text>
              <Text style={styles.deliveryValue}>{card.counterparty}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Counterparty info */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="person-outline" size={14} color={C.textTertiary} /><Text style={styles.sectionTitle}>交易對方</Text></View>
        <View style={styles.counterpartyCard}>
          <View style={styles.counterpartyAvatar}>
            <Text style={styles.counterpartyInitial}>
              {card.counterparty.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.counterpartyInfo}>
            <Text style={styles.counterpartyName}>{card.counterparty}</Text>
            <Text style={styles.counterpartyStats}>4.8 ⭐ · 328 筆成交</Text>
          </View>
          <TouchableOpacity style={styles.chatBtnLarge}>
            <Ionicons name="chatbubble-ellipses-outline" size={15} color={C.textTertiary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Action area — varies by role and step */}
      {currentStep === 1 && !isSeller && (
        <View style={styles.actionArea}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="time-outline" size={14} color={C.textTertiary} /><Text style={styles.actionHint}>等待賣家發貨中...</Text></View>
          <Text style={styles.actionSub}>通常 1-2 個工作天內發貨</Text>
        </View>
      )}

      {currentStep === 2 && !isSeller && (
        <View style={styles.actionArea}>
          <View style={styles.shippedAlert}>
            <Text style={styles.shippedAlertText}>📦 賣家已發貨！</Text>
            <Text style={styles.shippedAlertSub}>
              收到卡後，請檢查卡牌狀態再確認。如有問題可提出爭議。
            </Text>
          </View>
          <TouchableOpacity style={styles.confirmReceiptBtn} onPress={handleConfirmReceipt}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.confirmReceiptBtnText}>確認收貨</Text></View>
          </TouchableOpacity>
          
          {/* Extend button - only show if not yet extended */}
          {!isExtended && (
            <TouchableOpacity style={styles.extendBtn} onPress={handleExtendEscrow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="time-outline" size={13} color={C.textTertiary} /><Text style={styles.extendBtnText}>延長期限 (14日)</Text></View>
            </TouchableOpacity>
          )}
          {isExtended && (
            <View style={styles.extendedBadge}>
              <Text style={styles.extendedBadgeText}>✓ 已延長至 14 日</Text>
            </View>
          )}
          
          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={() => setShowDisputeModal(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="shield-checkmark-outline" size={15} color={C.textTertiary} /><Text style={styles.disputeBtnText}>有問題？提出爭議</Text></View>
          </TouchableOpacity>
        </View>
      )}

      {currentStep === 3 && !isSeller && (
        <View style={styles.actionArea}>
          <View style={styles.confirmingAlert}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.confirmingAlertText}>已確認收貨</Text></View>
            <Text style={styles.confirmingAlertSub}>
              資金將自動釋放俾賣家，交易完成！
            </Text>
          </View>
          <TouchableOpacity style={styles.releaseBtn} onPress={handleReleaseFund}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="lock-open-outline" size={13} color={C.textTertiary} /><Text style={styles.releaseBtnText}>立即釋放款項</Text></View>
          </TouchableOpacity>
        </View>
      )}

      {currentStep === 4 && (
        <View style={styles.actionArea}>
          <View style={styles.completeCard}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>交易完成！</Text>
            <Text style={styles.completeSub}>資金已轉俾 {card.counterparty}</Text>
          </View>
          
          {/* Report Problem button - visible within 30 days of release */}
          <TouchableOpacity 
            style={styles.reportProblemBtn}
            onPress={() => setShowDisputeModal(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="shield-checkmark-outline" size={15} color={C.textTertiary} /><Text style={styles.reportProblemBtnText}>報告問題（30日內）</Text></View>
          </TouchableOpacity>
        </View>
      )}

      {/* Dispute section — always visible if step < released */}
      {currentStep < 4 && (
        <TouchableOpacity
          style={styles.disputeBanner}
          onPress={() => setShowDisputeModal(true)}
        >
          <Ionicons name="shield-checkmark-outline" size={15} color={C.textTertiary} />
          <View style={styles.disputeBannerText}>
            <Text style={styles.disputeBannerTitle}>需要提出爭議？</Text>
            <Text style={styles.disputeBannerDesc}>
              如卡牌與描述不符、未能如期交收，平台將在 24 小時內審查
            </Text>
          </View>
          <Text style={styles.disputeArrow}>→</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />

      {/* Dispute Modal */}
      {/* Release Confirm Modal — Double Confirm */}
      <Modal visible={showReleaseModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="lock-open-outline" size={13} color={C.textTertiary} /><Text style={modalStyles.title}>確認釋放款項？</Text></View>
            <Text style={modalStyles.subtitle}>
              資金將直接轉俾賣家，交易完成後無法撤回。{'\n'}
              請確認已收到卡牌且狀態滿意。
            </Text>
            <View style={modalStyles.releaseCard}>
              <Text style={modalStyles.releaseAmount}>HK$ {card.price.toLocaleString()}</Text>
              <Text style={modalStyles.releaseTo}>款項將轉俾 {card.counterparty}</Text>
            </View>
            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => setShowReleaseModal(false)}
              >
                <Text style={modalStyles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modalStyles.releaseConfirmBtn}
                onPress={confirmRelease}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={modalStyles.releaseConfirmBtnText}>確認釋放款項</Text></View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showDisputeModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>提出爭議</Text>
            <Text style={modalStyles.subtitle}>
              請詳細描述問題，並上傳卡牌相片作為證據
            </Text>

            <Text style={modalStyles.fieldLabel}>問題類型</Text>
            <View style={modalStyles.reasonOptions}>
              {['卡牌與描述不符', '收到爛卡/假卡', '未能如期交收', '賣家無回應', '其他'].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[
                    modalStyles.reasonChip,
                    disputeReason === r && modalStyles.reasonChipActive,
                  ]}
                  onPress={() => setDisputeReason(r)}
                >
                  <Text style={[
                    modalStyles.reasonChipText,
                    disputeReason === r && modalStyles.reasonChipTextActive,
                  ]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={modalStyles.fieldLabel}>詳細描述</Text>
            <View style={modalStyles.textArea}>
              <Text style={modalStyles.textAreaPlaceholder}>
                請描述你遇到的問題...
              </Text>
            </View>

            <Text style={modalStyles.fieldLabel}>上傳圖片（最多 3 張）</Text>
            <TouchableOpacity
              style={modalStyles.uploadBtn}
              onPress={() => setShowImagePicker(true)}
            >
              <Text style={modalStyles.uploadBtnText}>📷 添加圖片</Text>
            </TouchableOpacity>

            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={modalStyles.submitBtn}
                disabled={!disputeReason}
              >
                <Text style={modalStyles.submitBtnText}>提交爭議</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => setShowDisputeModal(false)}
              >
                <Text style={modalStyles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
  },
  backBtnText: { color: C.text, fontSize: 20, fontWeight: '700' },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  chatBtn: {
    width: 36, height: 36,
    borderRadius: 12,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnText: { fontSize: 16 },
  escrowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,60,60,0.1)',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.2)',
  },
  escrowBannerIcon: { fontSize: 24 },
  escrowBannerText: { flex: 1 },
  escrowBannerTitle: { color: C.ruby, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowBannerDesc: { color: C.textSecondary, fontSize: 11 },
  escrowAmountBadge: {
    backgroundColor: C.ruby,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  escrowAmountBadgeText: { color: C.text, fontSize: 12, fontWeight: '800' },
  cardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  cardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: C.border },
  cardInfo: { flex: 1 },
  cardName: { color: C.text, fontSize: 14, fontWeight: '700' },
  cardSet: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  roleTag: {
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleTagText: { color: C.ruby, fontSize: 10, fontWeight: '700' },
  cardPrice: { color: C.text, fontSize: 16, fontWeight: '800' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 12 },
  timeline: { backgroundColor: C.card, borderRadius: 16, padding: 16 },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    position: 'relative',
  },
  timelineConnector: {
    position: 'absolute',
    left: 15,
    top: -12,
    width: 2,
    height: 20,
    backgroundColor: C.border,
  },
  timelineConnectorDone: { backgroundColor: C.up },
  stepCircle: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
    zIndex: 1,
  },
  stepCircleDone: { backgroundColor: C.up },
  stepCircleCurrent: { backgroundColor: C.ruby },
  stepCirclePending: { backgroundColor: C.border },
  stepCheck: { color: C.text, fontSize: 14, fontWeight: '700' },
  stepIcon: { fontSize: 14 },
  stepContent: { flex: 1, paddingTop: 4 },
  stepLabel: { color: C.text, fontSize: 13, fontWeight: '700' },
  stepLabelDone: { color: C.up },
  stepLabelCurrent: { color: C.ruby },
  stepLabelPending: { color: C.textDisabled },
  stepSublabel: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  deliveryCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 14,
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  deliveryLabel: { color: C.textSecondary, fontSize: 12 },
  deliveryValue: { color: C.text, fontSize: 12, fontWeight: '600' },
  counterpartyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  counterpartyAvatar: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: '#7B306C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterpartyInitial: { color: C.text, fontSize: 18, fontWeight: '700' },
  counterpartyInfo: { flex: 1 },
  counterpartyName: { color: C.text, fontSize: 14, fontWeight: '700' },
  counterpartyStats: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  chatBtnLarge: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnLargeText: { fontSize: 18 },
  actionArea: { paddingHorizontal: 16, marginBottom: 20 },
  actionHint: { color: C.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 4 },
  actionSub: { color: C.textDisabled, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  shippedAlert: {
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.2)',
  },
  shippedAlertText: { color: C.ruby, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  shippedAlertSub: { color: C.textSecondary, fontSize: 12 },
  confirmReceiptBtn: {
    backgroundColor: C.up,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmReceiptBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  disputeBtn: {
    backgroundColor: 'rgba(255,60,60,0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.3)',
  },
  disputeBtnText: { color: C.ruby, fontSize: 13, fontWeight: '600' },
  confirmingAlert: {
    backgroundColor: 'rgba(0,200,100,0.1)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,200,100,0.2)',
  },
  confirmingAlertText: { color: C.up, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  confirmingAlertSub: { color: C.textSecondary, fontSize: 12 },
  releaseBtn: {
    backgroundColor: C.up,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  releaseBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  completeCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,200,100,0.3)',
  },
  completeEmoji: { fontSize: 48, marginBottom: 12 },
  completeTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  completeSub: { color: C.textSecondary, fontSize: 13 },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  disputeBannerIcon: { fontSize: 24 },
  disputeBannerText: { flex: 1 },
  disputeBannerTitle: { color: C.text, fontSize: 13, fontWeight: '700' },
  disputeBannerDesc: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  disputeArrow: { color: C.ruby, fontSize: 18, fontWeight: '700' },
  extendBtn: { backgroundColor: C.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  extendBtnText: { color: C.text, fontSize: 13, fontWeight: '600' },
  extendedBadge: { backgroundColor: 'rgba(0,200,100,0.15)', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
  extendedBadgeText: { color: C.up, fontSize: 12, fontWeight: '700' },
  reportProblemBtn: { backgroundColor: 'rgba(255,60,60,0.1)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,60,60,0.3)' },
  reportProblemBtnText: { color: C.ruby, fontSize: 13, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A4E', alignSelf: 'center', marginBottom: 16 },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: C.textSecondary, fontSize: 12, marginBottom: 20, lineHeight: 18 },
  fieldLabel: { color: C.textSecondary, fontSize: 12, marginBottom: 8, marginTop: 12 },
  reasonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: C.border, borderWidth: 1, borderColor: 'transparent' },
  reasonChipActive: { backgroundColor: 'rgba(255,60,60,0.15)', borderColor: C.ruby },
  reasonChipText: { color: C.textSecondary, fontSize: 12 },
  reasonChipTextActive: { color: C.ruby, fontWeight: '600' },
  textArea: { backgroundColor: C.border, borderRadius: 12, padding: 14, minHeight: 80 },
  textAreaPlaceholder: { color: C.textDisabled, fontSize: 13 },
  uploadBtn: { backgroundColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  uploadBtnText: { color: C.text, fontSize: 13, fontWeight: '600' },
  actions: { marginTop: 20, gap: 10 },
  submitBtn: { backgroundColor: C.ruby, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: C.text, fontSize: 15, fontWeight: '700' },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: C.textSecondary, fontSize: 14 },
  releaseCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  releaseAmount: { color: C.gold, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  releaseTo: { color: C.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 4 },
  releaseConfirmBtn: {
    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14, flex: 1, marginLeft: 8, alignItems: 'center',
  },
  releaseConfirmBtnText: { color: C.void, fontSize: 15, fontWeight: '800' },
  amountInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.gold,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8,
  },
  currencyPrefix: { color: C.gold, fontSize: 20, fontWeight: '700', marginRight: 6 },
  amountInput: { color: C.text, fontSize: 24, fontWeight: '800', flex: 1, padding: 0 },
  warningText: { color: C.warn, fontSize: 12, marginBottom: 12, textAlign: 'center' },
  btnDisabled: { opacity: 0.4 },
  consentCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: C.border, marginBottom: 16,
  },
  consentLabel: { color: C.textSecondary, fontSize: 11, marginBottom: 2 },
  consentOriginal: { color: C.textSecondary, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  consentRequested: { color: C.gold, fontSize: 24, fontWeight: '800' },
});

export default OrderStatusScreen;
