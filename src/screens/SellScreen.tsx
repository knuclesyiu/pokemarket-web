import React, { useState, useEffect, useCallback } from 'react';
import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, ScrollView, StyleSheet, Image,
  TextInput, TouchableOpacity, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../services/firebase';
import { PokemonCard, CardCondition, CardGrade, GradingInfo } from '../types';
import { GRADE_LABEL, GRADE_CHIP, GRADERS, gradesFor, defaultGradeFor, makeGrading, isPlausibleCert, GRADE_PREMIUM_HINT } from '../utils/gradeHelper';
import ReviewBadge from '../components/ReviewBadge';
import { calculateFee, PLATFORM_FEE_PERCENT, STRIPE_PERCENT_FEE, STRIPE_FIXED_CENTS, ORDER_MIN_FEE_HKD } from '../utils/feeCalculator';
import type { CardCondition as CardCondType } from '../types';
import { confirmAction, notify } from '../components/Feedback';
import { C, themed } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

type SellRouteProp = RouteProp<RootStackParamList, 'Sell'>;

const CONDITIONS: CardCondition[] = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Fair', 'Poor'];

// All available grade options in display order
const GRADES: CardGrade[] = [
  'raw',
  'psa10', 'psa9', 'psa8', 'psa7',
  'bgs95', 'bgs10', 'bgs9',
  'cgc10',
  'other_graded',
];

// NEW: Obsidian Gallery — gold step indicators, premium feel
const COLORS = {
  bgVoid: C.void,
  bgSurface: C.surface,
  bgCard: C.card,
  bgElevated: C.elevated,
  borderSubtle: C.border,
  borderActive: C.borderActive,
  textPrimary: C.text,
  textSecondary: C.textSecondary,
  textTertiary: C.textDisabled,
  accentRed: C.action,
  accentEmber: C.warn,
  accentJade: C.up,
  accentRuby: C.ruby,
  accentViolet: C.violet,
};

const REVIEW_THRESHOLD = 500;

const SellScreen: React.FC = () => {
  const { t } = useAppearance();

  const route = useRoute<SellRouteProp>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  // If the user came from CardDetail's "sell this card" modal, they passed
  // a cardId + cardName + priceType. We pre-select that card.
  const incomingCardId = route.params?.cardId;
  const incomingCardName = route.params?.cardName;
  const incomingPriceType = route.params?.priceType;

  const [step, setStep] = useState(1);
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [priceType, setPriceType] = useState<'fixed' | 'auction'>(incomingPriceType ?? 'fixed');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState<CardCondition>('Near Mint');
  const [grade, setGrade] = useState<CardGrade>('raw');
  const [grader, setGrader] = useState<string>('none');
  const [certNumber, setCertNumber] = useState('');
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<PokemonCard[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [portfolioCards, setPortfolioCards] = useState<PokemonCard[]>([]);
  const [listing, setListing] = useState<{reviewId?: string; isVerified?: boolean; verifiedGrade?: string} | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const needsReview = selectedCard && Number(price) >= REVIEW_THRESHOLD;
  // Now totalSteps grows by 1 if user picks a graded card (extra review step)
  const isGraded = grade !== 'raw';
  const totalSteps = needsReview ? (isGraded ? 5 : 4) : (isGraded ? 4 : 3);

  // Build GradingInfo for the listing payload
  const gradingInfo: GradingInfo | undefined = grade === 'raw'
    ? undefined
    : makeGrading(grade, certNumber || undefined);

  // If user came from CardDetail "Sell this card" modal, auto-load the
  // card from Firestore card_prices so the user doesn't have to search
  // for the card they just looked at.
  useEffect(() => {
    if (incomingCardId && !selectedCard) {
      (async () => {
        try {
          const { getCardPrice, priceDataToCard } = await import('../services/cardPriceService');
          const priceDoc = await getCardPrice(incomingCardId);
          if (priceDoc) {
            setSelectedCard(priceDataToCard(priceDoc));
            setStep(2);
          }
        } catch (e) {
          console.warn('[SellScreen] auto-load card failed:', e);
        }
      })();
    }
  }, [incomingCardId]);

  // ── Load the user's own portfolio cards for the quick-pick grid ────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const snap = await getDocs(collection(db, 'users', uid, 'portfolio'));
        if (cancelled) return;
        const cards: PokemonCard[] = [];
        for (const d of snap.docs) {
          const { getCardPrice, priceDataToCard } = await import('../services/cardPriceService');
          const priceDoc = await getCardPrice(d.id);
          if (priceDoc) cards.push(priceDataToCard(priceDoc));
        }
        if (!cancelled) setPortfolioCards(cards);
      } catch (e) {
        console.warn('[SellScreen] portfolio load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Card picker search (Firestore card_prices) ─────────────────────
  const searchPickerCards = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setPickerResults([]); return; }
    setPickerLoading(true);
    try {
      const { searchCardsByName, priceDataToCard } = await import('../services/cardPriceService');
      const docs = await searchCardsByName(q.trim(), 20);
      setPickerResults(docs.map(priceDataToCard));
    } catch (e) {
      console.warn('[SellScreen] picker search failed:', e);
      setPickerResults([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  // Debounce the picker query
  useEffect(() => {
    const t = setTimeout(() => { searchPickerCards(pickerQuery); }, 350);
    return () => clearTimeout(t);
  }, [pickerQuery, searchPickerCards]);

  // Cert validity check
  const certValid = isPlausibleCert(grade, certNumber);
  const certIsRequired = isGraded && !certNumber.trim();
  const canProceedFromGrade = !isGraded || certValid;

  const handleCardSelect = (card: PokemonCard) => {
    if (!auth.currentUser) {
      confirmAction(t('需要登入'), t('請先登入再放售卡牌'), [
        { text: t('登入'), onPress: () => navigation.navigate('Login') },
        { text: t('取消') },
      ]);
      return;
    }
    setSelectedCard(card);
    setStep(2);
  };

  const handleConfirmListing = async () => {
    if (!auth.currentUser) {
      notify(t('需要登入'), t('請先登入'));
      return;
    }
    if (!selectedCard || !price) return;
    if (!canProceedFromGrade) {
      notify(
        t('資料未完整'),
        isGraded && !certValid
          ? t('PSA cert 格式不正確（需 7-10 位數字）；BGS 需 8-12 位英數')
          : t('請填寫 slab 認證編號'),
      );
      return;
    }
    setSubmitting(true);
    try {
      const createListing = httpsCallable(getFunctions(), 'createListing');
      const result = await createListing({
        cardId: selectedCard.id,
        price: Number(price),
        condition,
        grade,                          // legacy numeric not derivable, but pass string
        grading: gradingInfo,           // new structured {grade, grader, certNumber, gradeValue}
        type: priceType,
        sellerId: auth.currentUser.uid,
      });
      const data = result.data as any;
      if (needsReview && !listing?.isVerified) {
        setListing({ reviewId: data.reviewId });
        setStep(isGraded ? 5 : 4);
      } else {
        notify(t('掛牌成功！'), `${selectedCard.name} 已成功上架。`);
        resetForm();
      }
    } catch (err) {
      notify(t('掛牌失敗'), t('請稍後再試。'));
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedCard(null);
    setPrice('');
    setGrade('raw');
    setCertNumber('');
    setListing(null);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('放售卡牌')}</Text>
        <TouchableOpacity>
          <Text style={styles.headerGuide}>{t('📖 指南')}</Text>
        </TouchableOpacity>
      </View>

      {/* Progress — gold step indicators */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          {[t('揀卡'), needsReview ? t('品相審核') : t('定價'), t('確認')].map((label, i) => {
            const s = i + 1;
            return (
              <View key={s} style={styles.progressStep}>
                <View style={[styles.stepCircle, step >= s ? styles.stepCircleActive : null]}>
                  <Text style={[styles.stepNum, step >= s ? styles.stepNumActive : null]}>
                    {step > s ? '✓' : s}
                  </Text>
                </View>
                <Text style={[styles.stepLabel, step >= s ? styles.stepLabelActive : null]}>{label}</Text>
              </View>
            );
          })}
          <View style={[styles.progressLine, { width: `${((step - 1) / (totalSteps - 1)) * 100}%` }]} />
        </View>
      </View>

      {/* Step 1: Select Card */}
      {step === 1 && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>{t('選擇要放售的卡牌')}</Text>
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
                  <Text style={styles.previewPrice}>{t('市場參考價：HK$ {p0}', { p0: selectedCard.price.toLocaleString() })}</Text>
                  {selectedCard.language && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="globe-outline" size={13} color={C.textTertiary} /><Text style={styles.previewLang}>{selectedCard.language}</Text></View>
                  )}
                </View>
                <Text style={styles.changeBtn}>{t('更換 →')}</Text>
              </View>
            ) : (
              <View style={styles.placeholderCard}>
                <Ionicons name="search-outline" size={16} color={C.textTertiary} />
                <Text style={styles.placeholderText}>{t('點擊搜尋卡牌...')}</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>{t('或從列表選擇')}</Text>
          <View style={styles.quickGrid}>
            {portfolioCards.length === 0 ? (
              <Text style={styles.quickEmpty}>{t('收藏空空如也 — 先去「我的收藏」加入卡牌，就可以喺度快速放售')}</Text>
            ) : (
              portfolioCards.slice(0, 4).map(card => (
                <TouchableOpacity
                  key={card.id}
                  style={[styles.quickCard, selectedCard?.id === card.id ? styles.quickCardSelected : null]}
                  onPress={() => handleCardSelect(card)}
                >
                  <Image source={{ uri: card.imageUrl }} style={styles.quickImage} />
                  <Text style={styles.quickName} numberOfLines={1}>{card.name}</Text>
                  <Text style={styles.quickPrice}>HK${(card.price / 1000).toFixed(0)}K</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, !selectedCard ? styles.nextBtnDisabled : null]}
            onPress={() => selectedCard && setStep(2)}
            disabled={!selectedCard}
          >
            <Text style={styles.nextBtnText}>{t('下一步 →')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: Pricing + Condition */}
      {step === 2 && selectedCard && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>{t('設定價格')}</Text>

          <View style={styles.refPrice}>
            <Text style={styles.refLabel}>{t('市場參考價')}</Text>
            <Text style={styles.refValue}>HK$ {selectedCard.price.toLocaleString()}</Text>
          </View>

          <View style={styles.typeToggle}>
            {(['fixed', 'auction'] as const).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.typeBtn, priceType === item ? styles.typeBtnActive : null]}
                onPress={() => setPriceType(item)}
              >
                <Text style={[styles.typeBtnText, priceType === item ? styles.typeBtnTextActive : null]}>
                  {item === 'fixed' ? t('定價出售') : t('拍賣')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('你的掛牌價 (HKD)')}</Text>
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
                  ? t('📈 比市價高 {p0}%', { p0: (((Number(price) - selectedCard.price) / selectedCard.price) * 100).toFixed(0) })
                  : Number(price) < selectedCard.price
                  ? t('📉 比市價低 {p0}%', { p0: (((selectedCard.price - Number(price)) / selectedCard.price) * 100).toFixed(0) })
                  : t('與市價相同')}
              </Text>
            </View>
          )}

          {Number(price) >= REVIEW_THRESHOLD && (
            <View style={styles.reviewNotice}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="time-outline" size={14} color={C.textTertiary} /><Text style={styles.reviewNoticeText}>
                {t('HK${p0}+ 掛牌需進行品相審核', { p0: REVIEW_THRESHOLD })}
              </Text></View>
            </View>
          )}

          <Text style={styles.fieldLabel}>{t('卡牌狀態（品相）')}</Text>
          <View style={styles.conditionRow}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.conditionChip, condition === c ? styles.conditionChipActive : null]}
                onPress={() => setCondition(c)}
              >
                <Text style={[styles.conditionText, condition === c ? styles.conditionTextActive : null]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* External grading. A slabbed card is worth a different amount
              from the same card raw, so the grade and the certification
              number travel with the listing. */}
          <Text style={styles.fieldLabel}>{t('外部認證（PSA / BGS / CGC）')}</Text>
          <View style={styles.conditionRow}>
            <TouchableOpacity
              style={[styles.conditionChip, !isGraded ? styles.conditionChipActive : null]}
              onPress={() => { setGrader('none'); setGrade('raw'); setCertNumber(''); }}
            >
              <Text style={[styles.conditionText, !isGraded ? styles.conditionTextActive : null]}>
                {t('無認證（裸卡）')}
              </Text>
            </TouchableOpacity>
            {GRADERS.map(g => (
              <TouchableOpacity
                key={g.id}
                style={[styles.conditionChip, grader === g.id ? styles.conditionChipActive : null]}
                onPress={() => {
                  setGrader(g.id);
                  setGrade(defaultGradeFor(g.id));
                }}
              >
                <Text style={[styles.conditionText, grader === g.id ? styles.conditionTextActive : null]}>
                  {g.id}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isGraded && (
            <>
              <Text style={styles.fieldLabel}>{t('認證分數')}</Text>
              <View style={styles.conditionRow}>
                {gradesFor(grader).map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.conditionChip, grade === g ? styles.conditionChipActive : null]}
                    onPress={() => setGrade(g)}
                  >
                    <Text style={[styles.conditionText, grade === g ? styles.conditionTextActive : null]}>
                      {GRADE_LABEL[g]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('認證編號')}</Text>
              <TextInput
                style={styles.certInput}
                value={certNumber}
                onChangeText={setCertNumber}
                placeholder={t('例如 12345678')}
                placeholderTextColor={C.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {certNumber.length > 0 && !certValid && (
                <Text style={styles.certError}>{t('認證編號格式不正確')}</Text>
              )}
              <Text style={styles.gradeHint}>
                {t('PSA 認證嘅卡會喺掛牌顯示 PSA 標籤，同埋帶認證編號俾買家核對。')}
              </Text>
            </>
          )}

          <View style={styles.feeInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="list-outline" size={15} color={C.textTertiary} /><Text style={styles.feeTitle}>{t('費用說明')}</Text></View>
            <Text style={styles.feeRow}>
              {t('平台服務費：成交金額 × {p0}%', { p0: Math.round(PLATFORM_FEE_PERCENT * 100) })}
            </Text>
            <Text style={styles.feeRow}>
              {t('Stripe 處理費：{p0}% + HK$ {p1}/筆', {
                p0: Math.round(STRIPE_PERCENT_FEE * 100),
                p1: (STRIPE_FIXED_CENTS / 100).toFixed(2),
              })}
            </Text>
            <Text style={styles.feeRow}>
              {t('最低手續費：HK$ {p0}/筆', { p0: ORDER_MIN_FEE_HKD.toFixed(0) })}
            </Text>
            {price && Number(price) > 0 && (() => {
              const fee = calculateFee(Number(price));
              return (
                <>
                  <Text style={styles.feeRow}>
                    {t('預計總費用：HK$ {p0}', { p0: fee.totalFeeHkd.toFixed(2) })}
                  </Text>
                  <Text style={[styles.feeRow, styles.feeRowNet]}>
                    {t('預計淨收款：HK$ {p0}', { p0: fee.sellerNetHkd.toFixed(2) })}
                  </Text>
                </>
              );
            })()}
          </View>

          <View style={styles.stepNav}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
              <Text style={styles.backBtnText}>{t('← 上一步')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextBtn, !price ? styles.nextBtnDisabled : null]}
              onPress={() => price && setStep(3)}
              disabled={!price}
            >
              <Text style={styles.nextBtnText}>{t('下一步 →')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && selectedCard && (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>{t('確認掛牌')}</Text>

          <View style={styles.confirmCard}>
            <Image source={{ uri: selectedCard.imageUrl }} style={styles.confirmImage} />
            <View style={styles.confirmInfo}>
              <Text style={styles.confirmName}>{selectedCard.name}</Text>
              <Text style={styles.confirmSet}>{selectedCard.set} · {selectedCard.number}</Text>
              {selectedCard.language && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="globe-outline" size={13} color={C.textTertiary} /><Text style={styles.confirmLang}>{selectedCard.language}</Text></View>
              )}
            </View>
          </View>

          <View style={styles.confirmDetails}>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{t('掛牌類型')}</Text>
              <Text style={styles.confirmValue}>{priceType === 'fixed' ? t('定價') : t('拍賣')}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{t('掛牌價')}</Text>
              <Text style={styles.confirmPriceGold}>HK$ {Number(price).toLocaleString()}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{t('品相')}</Text>
              <Text style={styles.confirmValue}>
                {condition}
                {needsReview && <Text style={{ color: COLORS.accentRed }}>{t('· 待審核')}</Text>}
              </Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>{t('預計收款')}</Text>
              <Text style={styles.confirmNet}>HK$ {(Number(price) * 0.97 - 15).toFixed(0)}</Text>
            </View>
          </View>

          {needsReview && (
            <View style={styles.reviewInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="list-outline" size={15} color={C.textTertiary} /><Text style={styles.reviewInfoTitle}>{t('品相審核須知')}</Text></View>
              <Text style={styles.reviewInfoText}>
                {t('· HK${p0}+ 掛牌需上傳卡牌相片', { p0: REVIEW_THRESHOLD })}{'\n'}
                {t('· 有 PSA/BGS 證書可即時通過')}{'\n'}
                {t('· 無證書將由社群投票評級（3人投票）')}{'\n'}
                {t('· 審核期間掛牌仍可見，買家會看到「⏳ 評審中」標記')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.listBtn, submitting ? styles.listBtnDisabled : null]}
            onPress={handleConfirmListing}
            disabled={submitting}
          >
            <Text style={styles.listBtnText}>
              {submitting ? t('處理中...') : needsReview ? t('確認並提交品相審核') : t('確認放售')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtnCenter} onPress={() => setStep(2)}>
            <Text style={styles.backBtnText}>{t('返回修改')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 4: Review Submit */}
      {step === 4 && selectedCard && (
        <View style={styles.stepContent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="list-outline" size={15} color={C.textTertiary} /><Text style={styles.stepTitle}>{t('品相審核')}</Text></View>
          <Text style={styles.stepSubtitle}>{t('上傳卡牌相片，讓買家更信任你的掛牌')}</Text>

          <View style={styles.reviewCardRecap}>
            <Image source={{ uri: selectedCard.imageUrl }} style={styles.reviewCardThumb} />
            <View>
              <Text style={styles.reviewCardName}>{selectedCard.name}</Text>
              <Text style={styles.reviewCardPrice}>HK$ {Number(price).toLocaleString()}</Text>
              <Text style={styles.reviewCardCondition}>{t('自評：{p0}', { p0: condition })}</Text>
            </View>
            <ReviewBadge status="pending" />
          </View>

          <View style={styles.photoGuide}>
            <Text style={styles.photoGuideTitle}>{t('📸 需要上傳')}</Text>
            <View style={styles.photoGuide}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.photoGuideItem}>{t('卡牌正面（光線均勻，無反光）')}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.photoGuideItem}>{t('卡牌背面（可選，但推薦）')}</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={14} color={C.textTertiary} /><Text style={styles.photoGuideItem}>{t('角落/邊緣特寫（如有損壞）')}</Text></View>
            </View>
          </View>

          <View style={styles.photoSlots}>
            {[0, 1, 2].map(i => (
              <TouchableOpacity key={i} style={styles.photoSlot} onPress={() => {
                notify(t('📷 提示'), t('請在真實設備上使用 react-native-image-picker 上傳相片'));
              }}>
                <Text style={styles.photoSlotIcon}>+ 📷</Text>
                <Text style={styles.photoSlotLabel}>
                  {i === 0 ? t('正面') : i === 1 ? t('背面') : t('細節圖')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.certSection}>
            <TouchableOpacity style={styles.certToggle} onPress={() => {}}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkbox-outline" size={14} color={C.textTertiary} /><Text style={styles.certToggleText}>{t('我有 PSA/BGS 證書（快速通過審核）')}</Text></View>
            </TouchableOpacity>
          </View>

          <View style={styles.reviewStatusBox}>
            <Ionicons name="time-outline" size={14} color={C.textTertiary} />
            <View>
              <Text style={styles.reviewStatusTitle}>{t('審核已提交')}</Text>
              <Text style={styles.reviewStatusSub}>{t('3 名已認證用戶將投票評級')}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => {
              confirmAction(t('品相審核已提交！'), t('你的掛牌已成功上架，買家會看到「⏳ 評審中」標記。'), [
                { text: t('完成'), onPress: () => { setStep(1); setSelectedCard(null); setPrice(''); setListing(null); } }
              ]);
            }}
          >
            <Text style={styles.continueBtnText}>{t('完成 →')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Card Picker Modal */}
      <Modal visible={showCardPicker} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />
            <Text style={modalStyles.title}>{t('搜尋卡牌')}</Text>
            <View style={modalStyles.searchBarWrap}>
              <Ionicons name="search-outline" size={16} color={C.textTertiary} />
              <TextInput
                style={modalStyles.searchInput}
                placeholder={t('輸入卡名...')}
                placeholderTextColor={C.textDisabled}
                value={pickerQuery}
                onChangeText={setPickerQuery}
                autoCorrect={false}
              />
            </View>
            <ScrollView>
              {pickerLoading ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator color={C.action} />
                </View>
              ) : pickerResults.length === 0 ? (
                <Text style={modalStyles.emptyText}>
                  {pickerQuery.trim().length < 2 ? t('輸入至少 2 個字搜尋卡牌') : t('搵唔到相符嘅卡牌')}
                </Text>
              ) : (
                pickerResults.map(card => (
                  <TouchableOpacity
                    key={card.id}
                    style={modalStyles.cardRow}
                    onPress={() => { setSelectedCard(card); setShowCardPicker(false); setPickerQuery(''); setPickerResults([]); }}
                  >
                    <Image source={{ uri: card.imageUrl }} style={modalStyles.cardThumb} />
                    <View style={{ flex: 1 }}>
                      <Text style={modalStyles.cardName}>{card.name}</Text>
                      <Text style={modalStyles.cardSet}>{card.set}</Text>
                    </View>
                    <Text style={modalStyles.cardPrice}>HK${card.price.toLocaleString()}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={modalStyles.closeBtn} onPress={() => setShowCardPicker(false)}>
              <Text style={modalStyles.closeText}>{t('關閉')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// NEW: Obsidian Gallery design system
const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  headerGuide: { color: COLORS.accentRed, fontSize: 13, fontWeight: '600' },
  // NEW: gold step progress indicators
  progressSection: { paddingHorizontal: 16, marginBottom: 20 },
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 8,
  },
  progressStep: { alignItems: 'center', zIndex: 1 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.border,
    marginBottom: 8,
  },
  stepCircleActive: {
    backgroundColor: COLORS.accentRed,
    borderColor: COLORS.accentRed,
    shadowColor: COLORS.accentRed,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  stepNum: { color: C.textSecondary, fontSize: 13, fontWeight: '700' },
  stepNumActive: { color: C.void, fontWeight: '800' },
  stepLabel: { color: C.textSecondary, fontSize: 11 },
  stepLabelActive: { color: COLORS.accentRed, fontWeight: '600' },
  progressLine: {
    position: 'absolute',
    left: 40,
    right: 40,
    height: 2,
    backgroundColor: COLORS.accentRed,
    top: '50%',
    marginTop: -1,
  },
  stepContent: { paddingHorizontal: 16 },
  stepTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 20 },
  stepSubtitle: { color: C.textSecondary, fontSize: 13, marginTop: -16, marginBottom: 20 },
  // NEW: elevated card selection
  selectedCardPreview: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 20,
  },
  selectedCardInner: { flexDirection: 'row', alignItems: 'center' },
  previewImage: { width: 80, height: 112, borderRadius: 8, backgroundColor: C.elevated },
  previewInfo: { flex: 1, paddingHorizontal: 12 },
  previewName: { color: C.text, fontSize: 15, fontWeight: '700' },
  previewSet: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  previewPrice: { color: COLORS.accentRed, fontSize: 13, fontWeight: '700', marginTop: 8 },
  previewLang: { color: C.textSecondary, fontSize: 11, marginTop: 4 },
  changeBtn: { color: COLORS.accentRed, fontSize: 12, fontWeight: '600' },
  placeholderCard: { height: 100, alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 32, marginBottom: 8 },
  placeholderText: { color: C.textSecondary, fontSize: 14 },
  sectionLabel: { color: C.textSecondary, fontSize: 12, marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  quickEmpty: { color: C.textTertiary, fontSize: 12, lineHeight: 18, paddingVertical: 8, width: '100%' },
  quickCard: {
    width: '47%',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  quickCardSelected: { borderColor: COLORS.accentRed, backgroundColor: 'rgba(212,175,55,0.1)' },
  quickImage: { width: '100%', height: 80, borderRadius: 8, backgroundColor: C.elevated, marginBottom: 8 },
  quickName: { color: C.text, fontSize: 12, fontWeight: '600' },
  quickPrice: { color: COLORS.accentRed, fontSize: 12, fontWeight: '700', marginTop: 4 },
  // NEW: gold primary CTA
  nextBtn: {
    backgroundColor: COLORS.accentRed,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: C.border },
  nextBtnText: { color: C.void, fontSize: 15, fontWeight: '700' },
  refPrice: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  refLabel: { color: C.textSecondary, fontSize: 12 },
  refValue: { color: C.text, fontSize: 16, fontWeight: '800' },
  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  typeBtnActive: { borderColor: COLORS.accentRed, backgroundColor: 'rgba(212,175,55,0.1)' },
  typeBtnText: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  typeBtnTextActive: { color: COLORS.accentRed },
  fieldLabel: { color: C.textSecondary, fontSize: 12, marginBottom: 8 },
  priceInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  pricePrefix: { color: COLORS.accentRed, fontSize: 18, fontWeight: '700', marginRight: 8 },
  priceField: { flex: 1, color: C.text, fontSize: 18, paddingVertical: 12 },
  priceCompare: { marginBottom: 12 },
  compareText: { color: C.textSecondary, fontSize: 13 },
  reviewNotice: { backgroundColor: 'rgba(212,175,55,0.1)', borderRadius: 8, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' },
  reviewNoticeText: { color: COLORS.accentRed, fontSize: 12, fontWeight: '600' },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  conditionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
  },
  conditionChipActive: { borderColor: COLORS.accentRed, backgroundColor: 'rgba(212,175,55,0.15)' },
  conditionText: { color: C.textSecondary, fontSize: 12, fontWeight: '600' },
  conditionTextActive: { color: COLORS.accentRed },
  certInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: C.text,
    fontSize: 15,
    marginBottom: 6,
  },
  certError: { color: C.down, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  gradeHint: { color: C.textTertiary, fontSize: 12, lineHeight: 17, marginBottom: 16 },
  feeInfo: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  feeTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  feeRow: { color: C.textSecondary, fontSize: 12, marginBottom: 4 },
  feeRowNet: { color: C.up, fontWeight: '700', fontSize: 13, marginTop: 4 },
  stepNav: { flexDirection: 'row', gap: 12 },
  backBtn: {
    flex: 1, alignItems: 'center', backgroundColor: 'transparent',
    borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingVertical: 16,
  },
  backBtnText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  confirmCard: { flexDirection: 'row', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  confirmImage: { width: 80, height: 112, borderRadius: 8, backgroundColor: C.elevated },
  confirmInfo: { flex: 1, paddingLeft: 12 },
  confirmName: { color: C.text, fontSize: 15, fontWeight: '700' },
  confirmSet: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  confirmLang: { color: C.textSecondary, fontSize: 11, marginTop: 4 },
  confirmDetails: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  confirmLabel: { color: C.textSecondary, fontSize: 13 },
  confirmValue: { color: C.text, fontSize: 13, fontWeight: '600' },
  confirmPriceGold: { color: COLORS.accentRed, fontSize: 15, fontWeight: '800' },
  confirmNet: { color: COLORS.accentJade, fontSize: 15, fontWeight: '800' },
  reviewInfo: { backgroundColor: 'rgba(212,175,55,0.08)', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' },
  reviewInfoTitle: { color: COLORS.accentRed, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  reviewInfoText: { color: C.textSecondary, fontSize: 12, lineHeight: 20 },
  listBtn: { backgroundColor: COLORS.accentRed, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  listBtnDisabled: { backgroundColor: C.border },
  listBtnText: { color: C.void, fontSize: 15, fontWeight: '700' },
  backBtnCenter: { alignItems: 'center' },
  reviewCardRecap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border },
  reviewCardThumb: { width: 60, height: 84, borderRadius: 8, backgroundColor: C.elevated },
  reviewCardName: { color: C.text, fontSize: 14, fontWeight: '700', marginLeft: 12 },
  reviewCardPrice: { color: COLORS.accentRed, fontSize: 14, fontWeight: '700', marginLeft: 12 },
  reviewCardCondition: { color: C.textSecondary, fontSize: 11, marginLeft: 12 },
  photoGuide: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  photoGuideTitle: { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  photoGuideItem: { color: C.textSecondary, fontSize: 12, marginBottom: 4 },
  photoSlots: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  photoSlot: { flex: 1, height: 80, backgroundColor: C.card, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  photoSlotIcon: { fontSize: 24 },
  photoSlotLabel: { color: C.textSecondary, fontSize: 10, marginTop: 4 },
  certSection: { marginBottom: 16 },
  certToggle: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  certToggleText: { color: COLORS.accentRed, fontSize: 13, fontWeight: '600' },
  reviewStatusBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: C.border, gap: 12 },
  reviewStatusIcon: { fontSize: 24 },
  reviewStatusTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
  reviewStatusSub: { color: C.textSecondary, fontSize: 11 },
  continueBtn: { backgroundColor: COLORS.accentRed, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  continueBtnText: { color: C.void, fontSize: 15, fontWeight: '700' },
}))

const modalStyles = themed((C) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: C.border },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderActive, alignSelf: 'center', marginBottom: 16 },
  title: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 20 },
  searchBarWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 12, marginLeft: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  emptyText: { color: C.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 20, lineHeight: 18 },
  cardThumb: { width: 50, height: 70, borderRadius: 6, backgroundColor: C.elevated, marginRight: 12 },
  cardName: { color: C.text, fontSize: 14, fontWeight: '600' },
  cardSet: { color: C.textSecondary, fontSize: 11 },
  cardPrice: { color: COLORS.accentRed, fontSize: 13, fontWeight: '700' },
  closeBtn: { alignItems: 'center', marginTop: 16 },
  closeText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
}))

export default SellScreen;
