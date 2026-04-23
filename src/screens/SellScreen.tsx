import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TextInput, TouchableOpacity, Modal, Alert,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MOCK_CARDS } from '../data/mockData';
import ReviewBadge from '../components/ReviewBadge';
import type { CardCondition } from '../types';

const CONDITIONS: CardCondition[] = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Fair', 'Poor'];

// Trigger review for cards priced above this threshold (HKD)
const REVIEW_THRESHOLD = 500;

const SellScreen: React.FC = () => {
  const [step, setStep] = useState(1);
  const [selectedCard, setSelectedCard] = useState<typeof MOCK_CARDS[0] | null>(null);
  const [priceType, setPriceType] = useState<'fixed' | 'auction'>('fixed');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<CardCondition>('Near Mint');
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [listing, setListing] = useState<{reviewId?: string; isVerified?: boolean; verifiedGrade?: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsReview = selectedCard && Number(price) >= REVIEW_THRESHOLD;
  const totalSteps = needsReview ? 4 : 3;

  const handleConfirmListing = async () => {
    if (!selectedCard || !price) return;
    setSubmitting(true);
    try {
      const createListing = httpsCallable(getFunctions(), 'createListing');
      const result = await createListing({
        cardId: selectedCard.id,
        price: Number(price),
        condition,
        type: priceType,
      });
      const data = result.data as any;
      if (needsReview && !listing?.isVerified) {
        setListing({ reviewId: data.reviewId });
        setStep(4);
      } else {
        Alert.alert('✅ 掛牌成功！', `${selectedCard.name} 已成功上架。`, [{ text: '好的' }]);
        // Reset
        setStep(1); setSelectedCard(null); setPrice(''); setListing(null);
      }
    } catch (err) {
      Alert.alert('❌ 掛牌失敗', '請稍後再試。');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>放售卡牌</Text>
        <TouchableOpacity>
          <Text style={styles.headerGuide}>📖 指南</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          {['揀卡', needsReview ? '品相審核' : '定價', '確認'].map((label, i) => {
            const s = i + 1;
            return (
              <View key={s} style={styles.progressStep}>
                <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
                  <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>
                    {step > s ? '✓' : s}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>{label}</Text>
              </View>
            );
          })}
          <View style={[styles.progressLine, { width: `${((step - 1) / (totalSteps - 1)) * 100}%` }]} />
        </View>
      </View>

      {/* ── Step 1: Select Card ── */}
      {step === 1 && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>選擇要放售的卡牌</Text>
          <TouchableOpacity
            style={styles.selectedCardPreview}
            onPress={() => setShowCardPicker(true)}
          >
            {selectedCard ? (
              <View style={styles.selectedCardInner}>
                <Image source={{ uri: selectedCard.imageUrl }} style={styles.previewImage} />
                <View style={styles.previewInfo}>
                  <Text style={styles.previewName}>{selectedCard.name}</Text>
                  <Text style={styles.previewSet}>{selectedCard.set}</Text>
                  <Text style={styles.previewPrice}>市場參考價：HK$ {selectedCard.price.toLocaleString()}</Text>
                  {selectedCard.language && (
                    <Text style={styles.previewLang}>🌐 {selectedCard.language}</Text>
                  )}
                </View>
                <Text style={styles.changeBtn}>更換 →</Text>
              </View>
            ) : (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderIcon}>🔍</Text>
                <Text style={styles.placeholderText}>點擊搜尋卡牌...</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>或從列表選擇</Text>
          <View style={styles.quickGrid}>
            {MOCK_CARDS.slice(0, 4).map(card => (
              <TouchableOpacity
                key={card.id}
                style={[styles.quickCard, selectedCard?.id === card.id && styles.quickCardSelected]}
                onPress={() => setSelectedCard(card)}
              >
                <Image source={{ uri: card.imageUrl }} style={styles.quickImage} />
                <Text style={styles.quickName} numberOfLines={1}>{card.name}</Text>
                <Text style={styles.quickPrice}>HK${(card.price / 1000).toFixed(0)}K</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, !selectedCard && styles.nextBtnDisabled]}
            onPress={() => selectedCard && setStep(2)}
            disabled={!selectedCard}
          >
            <Text style={styles.nextBtnText}>下一步 →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Step 2: Pricing + Condition ── */}
      {step === 2 && selectedCard && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>設定價格</Text>

          <View style={styles.refPrice}>
            <Text style={styles.refLabel}>市場參考價</Text>
            <Text style={styles.refValue}>HK$ {selectedCard.price.toLocaleString()}</Text>
          </View>

          <View style={styles.typeToggle}>
            {(['fixed', 'auction'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, priceType === t && styles.typeBtnActive]}
                onPress={() => setPriceType(t)}
              >
                <Text style={[styles.typeBtnText, priceType === t && styles.typeBtnTextActive]}>
                  {t === 'fixed' ? '💰 定價出售' : '🏷️ 拍賣'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>你的掛牌價 (HKD)</Text>
          <View style={styles.priceInputWrap}>
            <Text style={styles.pricePrefix}>HK$</Text>
            <TextInput
              style={styles.priceField}
              placeholder="0"
              placeholderTextColor="#444466"
              keyboardType="numeric"
              value={price}
              onChangeText={setPrice}
            />
          </View>

          {price && selectedCard && (
            <View style={styles.priceCompare}>
              <Text style={styles.compareText}>
                {Number(price) > selectedCard.price
                  ? `📈 比市價高 ${(((Number(price) - selectedCard.price) / selectedCard.price) * 100).toFixed(0)}%`
                  : Number(price) < selectedCard.price
                  ? `📉 比市價低 ${(((selectedCard.price - Number(price)) / selectedCard.price) * 100).toFixed(0)}%`
                  : '⚖️ 與市價相同'}
              </Text>
            </View>
          )}

          {/* Review threshold notice */}
          {Number(price) >= REVIEW_THRESHOLD && (
            <View style={styles.reviewNotice}>
              <Text style={styles.reviewNoticeText}>
                ⏳ HK${REVIEW_THRESHOLD}+ 掛牌需進行品相審核
              </Text>
            </View>
          )}

          <Text style={styles.fieldLabel}>卡牌狀態（品相）</Text>
          <View style={styles.conditionRow}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.conditionChip, condition === c && styles.conditionChipActive]}
                onPress={() => setCondition(c)}
              >
                <Text style={[styles.conditionText, condition === c && styles.conditionTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.feeInfo}>
            <Text style={styles.feeTitle}>📋 費用說明</Text>
            <Text style={styles.feeRow}>平台服務費：成交金額 × 3%</Text>
            <Text style={styles.feeRow}>支付手續費：HK$ 15/筆</Text>
            {price && (
              <Text style={styles.feeRow}>
                預計收款：HK$ {(Number(price) * 0.97 - 15).toFixed(0)}
              </Text>
            )}
          </View>

          <View style={styles.stepNav}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
              <Text style={styles.backBtnText}>← 上一步</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextBtn, !price && styles.nextBtnDisabled]}
              onPress={() => price && setStep(3)}
              disabled={!price}
            >
              <Text style={styles.nextBtnText}>下一步 →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Step 3: Confirm ── */}
      {step === 3 && selectedCard && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>確認掛牌</Text>

          <View style={styles.confirmCard}>
            <Image source={{ uri: selectedCard.imageUrl }} style={styles.confirmImage} />
            <View style={styles.confirmInfo}>
              <Text style={styles.confirmName}>{selectedCard.name}</Text>
              <Text style={styles.confirmSet}>{selectedCard.set} · {selectedCard.number}</Text>
              {selectedCard.language && (
                <Text style={styles.confirmLang}>🌐 {selectedCard.language}</Text>
              )}
            </View>
          </View>

          <View style={styles.confirmDetails}>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>掛牌類型</Text>
              <Text style={styles.confirmValue}>{priceType === 'fixed' ? '💰 定價' : '🏷️ 拍賣'}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>掛牌價</Text>
              <Text style={styles.confirmPrice}>HK$ {Number(price).toLocaleString()}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>品相</Text>
              <Text style={styles.confirmValue}>
                {condition}
                {needsReview && <Text style={{ color: '#FFB800' }}> · 待審核</Text>}
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>預計收款</Text>
              <Text style={styles.confirmNet}>HK$ {(Number(price) * 0.97 - 15).toFixed(0)}</Text>
            </View>
          </View>

          {needsReview && (
            <View style={styles.reviewInfo}>
              <Text style={styles.reviewInfoTitle}>📋 品相審核須知</Text>
              <Text style={styles.reviewInfoText}>
                · HK${REVIEW_THRESHOLD}+ 掛牌需上傳卡牌相片{'\n'}
                · 有 PSA/BGS 證書可即時通過{'\n'}
                · 無證書將由社群投票評級（3人投票）{'\n'}
                · 審核期間掛牌仍可見，買家會看到「⏳ 評審中」標記
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.listBtn, submitting && styles.listBtnDisabled]}
            onPress={handleConfirmListing}
            disabled={submitting}
          >
            <Text style={styles.listBtnText}>
              {submitting ? '處理中...' : needsReview ? '✅ 確認並提交品相審核' : '✅ 確認放售'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtnCenter} onPress={() => setStep(2)}>
            <Text style={styles.backBtnText}>返回修改</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Step 4: Review Submit ── */}
      {step === 4 && selectedCard && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>📋 品相審核</Text>
          <Text style={styles.stepSubtitle}>上傳卡牌相片，讓買家更信任你的掛牌</Text>

          {/* Selected card recap */}
          <View style={styles.reviewCardRecap}>
            <Image source={{ uri: selectedCard.imageUrl }} style={styles.reviewCardThumb} />
            <View>
              <Text style={styles.reviewCardName}>{selectedCard.name}</Text>
              <Text style={styles.reviewCardPrice}>HK$ {Number(price).toLocaleString()}</Text>
              <Text style={styles.reviewCardCondition}>自評：{condition}</Text>
            </View>
            <ReviewBadge status="pending" />
          </View>

          {/* Photo upload guide */}
          <View style={styles.photoGuide}>
            <Text style={styles.photoGuideTitle}>📸 需要上傳</Text>
            <View style={styles.photoGuideList}>
              <Text style={styles.photoGuideItem}>✅ 卡牌正面（光線均勻，無反光）</Text>
              <Text style={styles.photoGuideItem}>✅ 卡牌背面（可選，但推薦）</Text>
              <Text style={styles.photoGuideItem}>✅ 角落/邊緣特寫（如有損壞）</Text>
            </View>
          </View>

          {/* Photo slots */}
          <View style={styles.photoSlots}>
            {[0, 1, 2].map(i => (
              <TouchableOpacity key={i} style={styles.photoSlot} onPress={() => {
                // In production: launchImageLibrary
                Alert.alert('📷 提示', '請在真實設備上使用 react-native-image-picker 上傳相片');
              }}>
                <Text style={styles.photoSlotIcon}>+ 📷</Text>
                <Text style={styles.photoSlotLabel}>
                  {i === 0 ? '正面' : i === 1 ? '背面' : '細節圖'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PSA/BGS Certificate */}
          <View style={styles.certSection}>
            <TouchableOpacity style={styles.certToggle} onPress={() => {}}>
              <Text style={styles.certToggleText}>☑️ 我有 PSA/BGS 證書（快速通過審核）</Text>
            </TouchableOpacity>
          </View>

          {/* Review status */}
          <View style={styles.reviewStatusBox}>
            <Text style={styles.reviewStatusIcon}>⏳</Text>
            <View>
              <Text style={styles.reviewStatusTitle}>審核已提交</Text>
              <Text style={styles.reviewStatusSub}>3 名已認證用戶將投票評級</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => {
              Alert.alert('✅ 品相審核已提交！', '你的掛牌已成功上架，買家會看到「⏳ 評審中」標記。', [
                { text: '完成', onPress: () => { setStep(1); setSelectedCard(null); setPrice(''); setListing(null); } }
              ]);
            }}
          >
            <Text style={styles.continueBtnText}>完成 →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Card Picker Modal */}
      <Modal visible={showCardPicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>搜尋卡牌</Text>
            <View style={modalStyles.searchBarWrap}>
              <Text style={{ fontSize: 16 }}>🔍</Text>
              <TextInput style={modalStyles.searchInput} placeholder="輸入卡名..." placeholderTextColor="#6666AA" />
            </View>
            <ScrollView>
              {MOCK_CARDS.map(card => (
                <TouchableOpacity
                  key={card.id}
                  style={modalStyles.cardRow}
                  onPress={() => { setSelectedCard(card); setShowCardPicker(false); }}
                >
                  <Image source={{ uri: card.imageUrl }} style={modalStyles.cardThumb} />
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.cardName}>{card.name}</Text>
                    <Text style={modalStyles.cardSet}>{card.set} · {card.number}</Text>
                    {card.language && (
                      <Text style={{ color: '#8888AA', fontSize: 10 }}>🌐 {card.language}</Text>
                    )}
                  </View>
                  <Text style={modalStyles.cardPrice}>HK${card.price.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={modalStyles.closeBtn} onPress={() => setShowCardPicker(false)}>
              <Text style={modalStyles.closeText}>關閉</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  headerGuide: { color: '#FF3C3C', fontSize: 13, fontWeight: '600' },
  progressSection: { paddingHorizontal: 16, marginBottom: 20 },
  progressBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#1E1E2E', borderRadius: 16, padding: 16, position: 'relative',
  },
  progressLine: {
    position: 'absolute', top: '50%', left: 24, height: 3,
    backgroundColor: '#FF3C3C', borderRadius: 2, marginTop: -1.5,
  },
  progressStep: { alignItems: 'center', zIndex: 1 },
  stepCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#2A2A3E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stepCircleActive: { backgroundColor: '#FF3C3C' },
  stepNum: { color: '#6666AA', fontSize: 13, fontWeight: '700' },
  stepNumActive: { color: '#FFFFFF' },
  stepLabel: { color: '#6666AA', fontSize: 10 },
  stepLabelActive: { color: '#FFFFFF' },
  stepContent: { paddingHorizontal: 16 },
  stepTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  stepSubtitle: { color: '#8888AA', fontSize: 13, marginBottom: 20 },
  selectedCardPreview: { marginBottom: 20 },
  selectedCardInner: {
    backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12,
  },
  previewImage: { width: 70, height: 98, borderRadius: 10, backgroundColor: '#2A2A3E' },
  previewInfo: { flex: 1 },
  previewName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  previewSet: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  previewPrice: { color: '#FF3C3C', fontSize: 12, fontWeight: '600', marginTop: 6 },
  previewLang: { color: '#8888AA', fontSize: 11, marginTop: 4 },
  changeBtn: { color: '#FF3C3C', fontSize: 12, fontWeight: '600' },
  placeholderCard: {
    backgroundColor: '#1E1E2E', borderRadius: 16, padding: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#3A3A4E', borderStyle: 'dashed',
  },
  placeholderIcon: { fontSize: 32, marginBottom: 8 },
  placeholderText: { color: '#8888AA', fontSize: 14 },
  sectionLabel: { color: '#8888AA', fontSize: 12, marginBottom: 10 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickCard: {
    width: '48%', backgroundColor: '#1E1E2E', borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  quickCardSelected: { borderColor: '#FF3C3C' },
  quickImage: { width: '100%', height: 80, backgroundColor: '#2A2A3E' },
  quickName: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingTop: 6 },
  quickPrice: { color: '#8888AA', fontSize: 11, paddingHorizontal: 8, paddingBottom: 8 },
  nextBtn: { backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#3A3A4E' },
  nextBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  refPrice: {
    backgroundColor: '#1E1E2E', borderRadius: 14, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  refLabel: { color: '#8888AA', fontSize: 13 },
  refValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  typeToggle: {
    flexDirection: 'row', backgroundColor: '#1E1E2E', borderRadius: 14,
    padding: 4, marginBottom: 16,
  },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  typeBtnActive: { backgroundColor: '#FF3C3C' },
  typeBtnText: { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  typeBtnTextActive: { color: '#FFFFFF' },
  fieldLabel: { color: '#8888AA', fontSize: 12, marginBottom: 8, marginTop: 12 },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#FF3C3C',
  },
  pricePrefix: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginRight: 8 },
  priceField: { flex: 1, color: '#FFFFFF', fontSize: 24, fontWeight: '700', paddingVertical: 14 },
  priceCompare: { backgroundColor: '#1E1E2E', borderRadius: 10, padding: 10, marginTop: 8 },
  compareText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  reviewNotice: {
    backgroundColor: 'rgba(255,184,0,0.15)', borderRadius: 10,
    padding: 10, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)',
  },
  reviewNoticeText: { color: '#FFB800', fontSize: 12, fontWeight: '600' },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conditionChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#2A2A3E',
  },
  conditionChipActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  conditionText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  conditionTextActive: { color: '#12121F' },
  feeInfo: { backgroundColor: '#1E1E2E', borderRadius: 14, padding: 14, marginTop: 20 },
  feeTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  feeRow: { color: '#8888AA', fontSize: 12, marginBottom: 4 },
  stepNav: { flexDirection: 'row', gap: 10, marginTop: 20 },
  backBtn: {
    paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#1E1E2E',
  },
  backBtnText: { color: '#8888AA', fontSize: 14, fontWeight: '600' },
  confirmCard: {
    backgroundColor: '#1E1E2E', borderRadius: 16, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, marginBottom: 16,
  },
  confirmImage: { width: 90, height: 126, borderRadius: 10, backgroundColor: '#2A2A3E' },
  confirmInfo: { flex: 1 },
  confirmName: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  confirmSet: { color: '#8888AA', fontSize: 12, marginTop: 4 },
  confirmLang: { color: '#8888AA', fontSize: 11, marginTop: 4 },
  confirmDetails: {
    backgroundColor: '#1E1E2E', borderRadius: 16, padding: 16, marginBottom: 20,
  },
  confirmRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A3E',
  },
  confirmLabel: { color: '#8888AA', fontSize: 13 },
  confirmValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  confirmPrice: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  confirmNet: { color: '#00C864', fontSize: 16, fontWeight: '700' },
  reviewInfo: {
    backgroundColor: 'rgba(255,184,0,0.1)', borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.2)',
  },
  reviewInfoTitle: { color: '#FFB800', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  reviewInfoText: { color: '#8888AA', fontSize: 12, lineHeight: 20 },
  listBtn: { backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  listBtnDisabled: { backgroundColor: '#3A3A4E' },
  listBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  backBtnCenter: { alignItems: 'center', marginTop: 12 },
  // Step 4 — Review
  reviewCardRecap: {
    backgroundColor: '#1E1E2E', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  reviewCardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: '#2A2A3E' },
  reviewCardName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  reviewCardPrice: { color: '#FF3C3C', fontSize: 13, fontWeight: '600', marginTop: 2 },
  reviewCardCondition: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  photoGuide: { backgroundColor: '#1E1E2E', borderRadius: 14, padding: 14, marginBottom: 16 },
  photoGuideTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  photoGuideList: { gap: 6 },
  photoGuideItem: { color: '#8888AA', fontSize: 12 },
  photoSlots: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  photoSlot: {
    flex: 1, height: 90, backgroundColor: '#1E1E2E', borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2A3E', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoSlotIcon: { fontSize: 24, marginBottom: 4 },
  photoSlotLabel: { color: '#6666AA', fontSize: 10 },
  certSection: { marginBottom: 20 },
  certToggle: { backgroundColor: '#1E1E2E', borderRadius: 12, padding: 14 },
  certToggleText: { color: '#FFFFFF', fontSize: 13 },
  reviewStatusBox: {
    backgroundColor: 'rgba(255,184,0,0.1)', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.2)',
  },
  reviewStatusIcon: { fontSize: 28 },
  reviewStatusTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  reviewStatusSub: { color: '#8888AA', fontSize: 11, marginTop: 2 },
  continueBtn: {
    backgroundColor: '#FFD700', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  continueBtnText: { color: '#12121F', fontSize: 16, fontWeight: '800' },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1E1E2E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '80%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A4E', alignSelf: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A3E',
    borderRadius: 12, paddingHorizontal: 12, marginBottom: 16, gap: 8,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14, paddingVertical: 12 },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    gap: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A3E',
  },
  cardThumb: { width: 50, height: 70, borderRadius: 8, backgroundColor: '#2A2A3E' },
  cardName: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  cardSet: { color: '#8888AA', fontSize: 11 },
  cardPrice: { color: '#FF3C3C', fontSize: 13, fontWeight: '700' },
  closeBtn: { alignItems: 'center', marginTop: 16 },
  closeText: { color: '#8888AA', fontSize: 14, fontWeight: '600' },
});

export default SellScreen;