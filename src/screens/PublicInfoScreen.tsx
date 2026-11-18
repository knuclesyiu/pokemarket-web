/**
 * The public page: who we are, what we sell, how to buy, and the
 * policies.
 *
 * Airwallex reviews the website before it activates a payment method,
 * and it checks that the site carries the business's own details and
 * its policies. This screen is that page — it needs no account, so
 * anyone can open it, and the hosting serves a static copy of the
 * same text for anyone who does not run the app's javascript.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { useAppearance } from '../contexts/AppearanceContext';
import { BUSINESS, PAYMENT_METHODS } from '../config/business';
import { C, Palette, R, SP, T, themed } from '../theme';
import { Ionicons } from '@expo/vector-icons';

type Section = {
  title: string;
  body: string[];
};

const sections = (): Section[] => [
  {
    title: t('關於 PokeMarket'),
    body: [
      t(
        'PokeMarket 係一個香港嘅二手集換式寶可夢卡買賣平台，由 Ming Tai Advisory Limited 營運。我哋嘅目標好簡單：俾卡迷可以安心買賣二手卡，而唔使擔心收到假卡或者收唔到錢。',
      ),
      t(
        '平台提供全球即時卡價參考、買賣雙方出價、擔保交易，以及繁體中文、簡體中文同英文三種介面。',
      ),
    ],
  },
  {
    title: t('我哋賣咩'),
    body: [
      t(
        '二手集換式寶可夢卡（Pokémon TCG）—— 包括日版、中文版同英文版。卡價資料來自 TCGdex，每 6 個鐘更新一次，畀你做定價參考。',
      ),
      t(
        '買家可以先睇價格、睇相、睇評價，再落手買或者出價；賣家可以自己掛牌，設定運費同交收方式。',
      ),
    ],
  },
  {
    title: t('點買'),
    body: [
      t('1. 註冊帳戶（電話、Email 或者 Google 都得），設定交易密碼。'),
      t(
        '2. 喺首頁睇卡價，或者搜尋卡名／系列／稀有度，撳入去睇詳情、登記條件同現貨掛牌。',
      ),
      t(
        '3. 想即刻買就撳「立即購買」；想慢慢傾就落 Offer，等賣家接受。',
      ),
      t(
        '4. 付款。錢會先由第三方支付機構（Visa、Mastercard、或者 FPS 轉數快）收咗，由平台擔保，未會即刻畀賣家。',
      ),
      t(
        '5. 賣家寄出卡片（或者約面交），你收到卡之後喺「訂單」度確認收貨。',
      ),
      t(
        '6. 你確認收貨之後，平台先會將款項放畀賣家，賣家可以喺「錢包」度提現到自己嘅銀行戶口。',
      ),
    ],
  },
  {
    title: t('付款方式'),
    body: [
      t(
        'Visa 信用卡、Mastercard 信用卡同 FPS 轉數快。平台處理費同服務費會喺落單前清楚顯示，你唔會喺付款之後先發現有額外收費。',
      ),
      t(
        '你唔會被引導去任何第三方網站付款 —— 所有付款都喺 PokeMarket 網站或者第三方支付機構提供嘅付款畫面完成。',
      ),
    ],
  },
  {
    title: t('運送及退貨政策'),
    body: [
      t(
        '送貨：賣家可以選擇順豐到付或者面交。順豐到付嘅運費由買家支付，金額喺落單前列明；面交就冇運費。',
      ),
      t(
        '收貨：收到卡之後，請喺訂單頁按「確認收貨」。確認之前，款項一直由平台擔保，賣家收唔到。',
      ),
      t(
        '退貨：如果收到嘅卡同描述唔符合（唔同卡、假卡、或者嚴重損壞），請喺落單後 7 日內喺訂單頁提出「爭議」，我哋會暫停放款並且安排退貨／退款。',
      ),
      t(
        '退貨運費：如果錯喺賣家（例如發錯卡或者卡況同描述不符），退貨運費由賣家負責；如果錯喺買家（例如買咗但唔想要），退貨運費由買家負責。爭議期間款項一直唔會放畀任何一方。',
      ),
      t(
        '退款：確認咗退貨之後，退款會退回原本嘅付款方式。信用卡退款一般需要 5 至 10 個工作天（視乎發卡銀行而定），FPS 退款一般 1 至 3 個工作天。',
      ),
    ],
  },
  {
    title: t('用戶條款'),
    body: [
      t(
        'PokeMarket 係一個由買賣雙方直接成交嘅平台。平台提供擔保交易、價格資料同溝通工具，但唔會保證任何一張卡嘅真偽或者價值 —— 請按卡況描述判斷，落手前有疑問就問清楚。',
      ),
      t(
        '賣家必須確保自己有權出售卡片（包括正版卡、官方 Sending 卡，以及二次銷售的合法授權）。',
      ),
      t(
        '任何欺詐、假卡、洗錢或者違反香港法律嘅行為，我哋會即時凍結帳戶同款項，並可能向警方或者監管機構報告。',
      ),
      t(
        `本條款受 ${BUSINESS.governingLaw} 法律管轄，同埋受香港適用嘅消費者保障條例約束。`,
      ),
    ],
  },
  {
    title: t('私隱政策'),
    body: [
      t(
        '我哋收集嘅資料只係為咗提供交易服務：你的帳戶資料（電話／Email）、交易紀錄、收款資料（如果你是賣家），以及保障交易安全而需要嘅裝置及登入紀錄。',
      ),
      t(
        '你嘅收款識別碼（例如 FPS 電話號碼）只係加密儲存，並且喺畫面上遮住，只顯示最後四個字元。',
      ),
      t(
        '我哋唔會賣出你嘅個人資料。資料只會按需要提供畀支付機構（Stripe、Airwallex）完成收款及出款、或者按法律要求提供畀監管機構。',
      ),
      t(
        '你可以隨時要求查閱、更正或者刪除你嘅帳戶資料。請電郵或者致電聯絡我哋。',
      ),
    ],
  },
];

const details = () => [
  { label: t('公司名稱'), value: BUSINESS.companyName },
  { label: t('商業登記號碼'), value: BUSINESS.registrationNumber },
  { label: t('公司地址'), value: BUSINESS.address },
  { label: t('聯絡電郵'), value: BUSINESS.supportEmail },
  { label: t('聯絡電話'), value: BUSINESS.supportPhone },
  { label: t('付款方式'), value: PAYMENT_METHODS.join(' · ') },
  { label: t('管轄法律'), value: BUSINESS.governingLaw },
];

export default function PublicInfoScreen({ navigation }: any) {
  const { theme } = useAppearance();
  const styles = themed(makeStyles);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : null)}
          accessibilityLabel={t('返回')}
        >
          <Ionicons name="chevron-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('關於 PokeMarket')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          {t(
            'Ming Tai Advisory Limited 營運嘅二手卡買賣平台。以下係我哋嘅業務資料、交易流程同埋政策。',
          )}
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('業務資料')}</Text>
          {details().map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {sections().map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            {section.body.map((line, i) => (
              <Text key={i} style={styles.paragraph}>
                {line}
              </Text>
            ))}
          </View>
        ))}

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => (navigation?.canGoBack?.() ? navigation.goBack() : null)}
        >
          <Ionicons name="chevron-back" size={16} color={C.textSecondary} />
          <Text style={styles.backLinkText}>{t('返回登入')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (_palette: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SP.lg,
      paddingVertical: SP.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    back: { padding: 4, marginRight: SP.sm },
    headerTitle: { ...T.h2, color: C.text, flex: 1 },
    content: { padding: SP.lg, paddingBottom: SP.xl, gap: SP.md },
    lead: { ...T.body, color: C.textSecondary, marginBottom: SP.xs },
    card: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: SP.lg,
      borderWidth: 1,
      borderColor: C.border,
      gap: SP.sm,
    },
    cardTitle: { ...T.h3, color: C.text, marginBottom: SP.xs },
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: SP.md },
    rowLabel: { ...T.caption, color: C.textSecondary, flexShrink: 0 },
    rowValue: { ...T.caption, color: C.text, flex: 1, textAlign: 'right' },
    paragraph: { ...T.body, color: C.textSecondary, lineHeight: 22 },
    backLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: SP.md,
    },
    backLinkText: { ...T.caption, color: C.textSecondary },
  });
