import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

type RouteProps = RouteProp<{ params: { txId: string } }, 'params'>;

type EscrowStep = 'paid' | 'awaiting_ship' | 'shipped' | 'confirmed' | 'released' | 'disputed';

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
  { key: 'confirmed', label: '已確認收貨', sublabel: '等待款項釋放', icon: '✅' },
  { key: 'released', label: '款項已釋放', sublabel: '交易完成', icon: '🎉' },
];

const OrderStatusScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation();
  const { txId } = route.params;

  const [currentStep, setCurrentStep] = useState<number>(2); // Demo: step 2 = shipped
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [isExtended, setIsExtended] = useState(false);
  const [extending, setExtending] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'funds_escrowed' | 'released' | 'disputed'>('funds_escrowed');

  const handleExtendEscrow = async () => {
    if (isExtended || extending) return;
    setExtending(true);
    try {
      const extendFn = httpsCallable(getFunctions(), 'extendEscrow');
      await extendFn({ orderId: txId });
      setIsExtended(true);
      Alert.alert('✅ 已延長', '款項釋放期限已延長至 14 日，請放心。');
    } catch (e: any) {
      Alert.alert('❌ 延長失敗', e.message ?? '請稍後再試');
    } finally {
      setExtending(false);
    }
  };

  const handleCreateDispute = async () => {
    if (!disputeReason.trim()) {
      Alert.alert('請輸入', '請描述問題原因才能提交 dispute');
      return;
    }
    setDisputing(true);
    try {
      const disputeFn = httpsCallable(getFunctions(), 'createDispute');
      await disputeFn({ orderId: txId, reason: disputeReason.trim() });
      setShowDisputeModal(false);
      setOrderStatus('disputed');
      Alert.alert('✅ Dispute 已提交', '我們會在 24 小時內處理，請留意通知。');
    } catch (e: any) {
      Alert.alert('❌ 提交失敗', e.message ?? '請稍後再試');
    } finally {
      setDisputing(false);
    }
  };

  const card = {
    name: 'Charizard VMAX',
    set: 'Darkness Ablaze',
    imageUrl: 'https://images.pokemontcg.io/swsh5/115.png',
    price: 4200,
    counterparty: 'CardMaster_HK',
    deliveryMethod: 'sf',
    trackingNumber: 'SF1234567890',
  };

  const isSeller = false; // Demo buyer view

  const handleConfirmReceipt = () => {
    setCurrentStep(3);
  };

  const handleReleaseFund = () => {
    setShowReleaseModal(true);
  };

  const confirmRelease = async () => {
    setShowReleaseModal(false);
    // Call releasePayment cloud function
    try {
      const fn = getFunctions();
      const releaseFn = httpsCallable(fn, 'releasePayment');
      await releaseFn({ orderId: txId });
    } catch (e) {
      // Proceed optimistically in demo mode
    }
    setCurrentStep(4);
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>訂單詳情</Text>
        <TouchableOpacity style={styles.chatBtn}>
          <Text style={styles.chatBtnText}>💬</Text>
        </TouchableOpacity>
      </View>

      {/* Escrow Banner */}
      <View style={styles.escrowBanner}>
        <Text style={styles.escrowBannerIcon}>🔐</Text>
        <View style={styles.escrowBannerText}>
          <Text style={styles.escrowBannerTitle}>
            {currentStep < 3 ? '款項由平台托管中' : currentStep === 4 ? '款項已釋放俾賣家' : '款項已釋放'}
          </Text>
          <Text style={styles.escrowBannerDesc}>
            {currentStep < 3
              ? `HK$ ${card.price.toLocaleString()} 擔保中，確認收卡後自動轉俾賣家`
              : '交易完成，款項已轉俾賣家'}
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
            <Text style={styles.roleTagText}>{isSeller ? '👤 你是賣家' : '🛒 你是買家'}</Text>
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
                    isCompleted && styles.timelineConnectorDone,
                  ]} />
                )}
                {/* Step circle */}
                <View style={[
                  styles.stepCircle,
                  isCompleted && styles.stepCircleDone,
                  isCurrent && styles.stepCircleCurrent,
                  isPending && styles.stepCirclePending,
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
                    isCompleted && styles.stepLabelDone,
                    isCurrent && styles.stepLabelCurrent,
                    isPending && styles.stepLabelPending,
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
        <Text style={styles.sectionTitle}>👤 交易對方</Text>
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
            <Text style={styles.chatBtnLargeText}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Action area — varies by role and step */}
      {currentStep === 1 && !isSeller && (
        <View style={styles.actionArea}>
          <Text style={styles.actionHint}>⏳ 等待賣家發貨中...</Text>
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
            <Text style={styles.confirmReceiptBtnText}>✅ 確認收貨</Text>
          </TouchableOpacity>
          
          {/* Extend button - only show if not yet extended */}
          {!isExtended && (
            <TouchableOpacity style={styles.extendBtn} onPress={handleExtendEscrow}>
              <Text style={styles.extendBtnText}>⏰ 延長期限 (14日)</Text>
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
            <Text style={styles.disputeBtnText}>🛡️ 有問題？提出爭議</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentStep === 3 && !isSeller && (
        <View style={styles.actionArea}>
          <View style={styles.confirmingAlert}>
            <Text style={styles.confirmingAlertText}>✅ 已確認收貨</Text>
            <Text style={styles.confirmingAlertSub}>
              款項將自動釋放俾賣家，交易完成！
            </Text>
          </View>
          <TouchableOpacity style={styles.releaseBtn} onPress={handleReleaseFund}>
            <Text style={styles.releaseBtnText}>🔓 立即釋放款項</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentStep === 4 && (
        <View style={styles.actionArea}>
          <View style={styles.completeCard}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>交易完成！</Text>
            <Text style={styles.completeSub}>款項已轉俾 {card.counterparty}</Text>
          </View>
          
          {/* Report Problem button - visible within 30 days of release */}
          <TouchableOpacity 
            style={styles.reportProblemBtn}
            onPress={() => setShowDisputeModal(true)}
          >
            <Text style={styles.reportProblemBtnText}>🛡️ 報告問題（30日內）</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Dispute section — always visible if step < released */}
      {currentStep < 4 && (
        <TouchableOpacity
          style={styles.disputeBanner}
          onPress={() => setShowDisputeModal(true)}
        >
          <Text style={styles.disputeBannerIcon}>🛡️</Text>
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
            <Text style={modalStyles.title}>🔓 確認釋放款項？</Text>
            <Text style={modalStyles.subtitle}>
              款項將直接轉俾賣家，交易完成後無法撤回。{'\n'}
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
                <Text style={modalStyles.releaseConfirmBtnText}>✅ 確認釋放款項</Text>
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
  },
  backBtnText: { color: '#F0F0FF', fontSize: 20, fontWeight: '700' },
  headerTitle: { color: '#F0F0FF', fontSize: 17, fontWeight: '700' },
  chatBtn: {
    width: 36, height: 36,
    borderRadius: 12,
    backgroundColor: '#14142A',
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
  escrowBannerTitle: { color: '#FF4060', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  escrowBannerDesc: { color: '#8888CC', fontSize: 11 },
  escrowAmountBadge: {
    backgroundColor: '#FF4060',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  escrowAmountBadgeText: { color: '#F0F0FF', fontSize: 12, fontWeight: '800' },
  cardSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  cardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: '#2A2A50' },
  cardInfo: { flex: 1 },
  cardName: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  cardSet: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  roleTag: {
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleTagText: { color: '#FF4060', fontSize: 10, fontWeight: '700' },
  cardPrice: { color: '#F0F0FF', fontSize: 16, fontWeight: '800' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { color: '#F0F0FF', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  timeline: { backgroundColor: '#14142A', borderRadius: 16, padding: 16 },
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
    backgroundColor: '#2A2A50',
  },
  timelineConnectorDone: { backgroundColor: '#00C896' },
  stepCircle: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
    zIndex: 1,
  },
  stepCircleDone: { backgroundColor: '#00C896' },
  stepCircleCurrent: { backgroundColor: '#FF4060' },
  stepCirclePending: { backgroundColor: '#2A2A50' },
  stepCheck: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  stepIcon: { fontSize: 14 },
  stepContent: { flex: 1, paddingTop: 4 },
  stepLabel: { color: '#F0F0FF', fontSize: 13, fontWeight: '700' },
  stepLabelDone: { color: '#00C896' },
  stepLabelCurrent: { color: '#FF4060' },
  stepLabelPending: { color: '#4A4A70' },
  stepSublabel: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  deliveryCard: {
    backgroundColor: '#14142A',
    borderRadius: 14,
    padding: 14,
  },
  deliveryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A50',
  },
  deliveryLabel: { color: '#8888CC', fontSize: 12 },
  deliveryValue: { color: '#F0F0FF', fontSize: 12, fontWeight: '600' },
  counterpartyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
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
  counterpartyInitial: { color: '#F0F0FF', fontSize: 18, fontWeight: '700' },
  counterpartyInfo: { flex: 1 },
  counterpartyName: { color: '#F0F0FF', fontSize: 14, fontWeight: '700' },
  counterpartyStats: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  chatBtnLarge: {
    width: 40, height: 40,
    borderRadius: 12,
    backgroundColor: '#2A2A50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnLargeText: { fontSize: 18 },
  actionArea: { paddingHorizontal: 16, marginBottom: 20 },
  actionHint: { color: '#8888CC', fontSize: 14, textAlign: 'center', marginBottom: 4 },
  actionSub: { color: '#4A4A70', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  shippedAlert: {
    backgroundColor: 'rgba(255,184,0,0.1)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.2)',
  },
  shippedAlertText: { color: '#FF4060', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  shippedAlertSub: { color: '#8888CC', fontSize: 12 },
  confirmReceiptBtn: {
    backgroundColor: '#00C896',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmReceiptBtnText: { color: '#F0F0FF', fontSize: 15, fontWeight: '700' },
  disputeBtn: {
    backgroundColor: 'rgba(255,60,60,0.1)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.3)',
  },
  disputeBtnText: { color: '#FF4060', fontSize: 13, fontWeight: '600' },
  confirmingAlert: {
    backgroundColor: 'rgba(0,200,100,0.1)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,200,100,0.2)',
  },
  confirmingAlertText: { color: '#00C896', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  confirmingAlertSub: { color: '#8888CC', fontSize: 12 },
  releaseBtn: {
    backgroundColor: '#00C896',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  releaseBtnText: { color: '#F0F0FF', fontSize: 15, fontWeight: '700' },
  completeCard: {
    backgroundColor: '#14142A',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,200,100,0.3)',
  },
  completeEmoji: { fontSize: 48, marginBottom: 12 },
  completeTitle: { color: '#F0F0FF', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  completeSub: { color: '#8888CC', fontSize: 13 },
  disputeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14142A',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  disputeBannerIcon: { fontSize: 24 },
  disputeBannerText: { flex: 1 },
  disputeBannerTitle: { color: '#F0F0FF', fontSize: 13, fontWeight: '700' },
  disputeBannerDesc: { color: '#8888CC', fontSize: 11, marginTop: 2 },
  disputeArrow: { color: '#FF4060', fontSize: 18, fontWeight: '700' },
  extendBtn: { backgroundColor: '#2A2A50', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  extendBtnText: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  extendedBadge: { backgroundColor: 'rgba(0,200,100,0.15)', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
  extendedBadgeText: { color: '#00C896', fontSize: 12, fontWeight: '700' },
  reportProblemBtn: { backgroundColor: 'rgba(255,60,60,0.1)', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,60,60,0.3)' },
  reportProblemBtnText: { color: '#FF4060', fontSize: 13, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#14142A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A4E', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#F0F0FF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#8888CC', fontSize: 12, marginBottom: 20, lineHeight: 18 },
  fieldLabel: { color: '#8888CC', fontSize: 12, marginBottom: 8, marginTop: 12 },
  reasonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#2A2A50', borderWidth: 1, borderColor: 'transparent' },
  reasonChipActive: { backgroundColor: 'rgba(255,60,60,0.15)', borderColor: '#FF4060' },
  reasonChipText: { color: '#8888CC', fontSize: 12 },
  reasonChipTextActive: { color: '#FF4060', fontWeight: '600' },
  textArea: { backgroundColor: '#2A2A50', borderRadius: 12, padding: 14, minHeight: 80 },
  textAreaPlaceholder: { color: '#4A4A70', fontSize: 13 },
  uploadBtn: { backgroundColor: '#2A2A50', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  uploadBtnText: { color: '#F0F0FF', fontSize: 13, fontWeight: '600' },
  actions: { marginTop: 20, gap: 10 },
  submitBtn: { backgroundColor: '#FF4060', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  submitBtnText: { color: '#F0F0FF', fontSize: 15, fontWeight: '700' },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#8888CC', fontSize: 14 },
  releaseCard: {
    backgroundColor: '#0E0E1A', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#2A2A50', marginBottom: 16,
  },
  releaseAmount: { color: '#D4AF37', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  releaseTo: { color: '#8888CC', fontSize: 12, textAlign: 'center', marginTop: 4 },
  releaseConfirmBtn: {
    backgroundColor: '#D4AF37', borderRadius: 14, paddingVertical: 14, flex: 1, marginLeft: 8, alignItems: 'center',
  },
  releaseConfirmBtnText: { color: '#080810', fontSize: 15, fontWeight: '800' },
});

export default OrderStatusScreen;
