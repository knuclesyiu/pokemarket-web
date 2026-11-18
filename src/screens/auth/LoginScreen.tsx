/**
 * LoginScreen — Phone + Email + Google
 *
 * v2 changes (Phase C auth hardening):
 *   - Email sign-in no longer auto-creates accounts
 *   - 'needs_signup' navigates to RegisterScreen with a clear CTA
 *   - Google button is disabled with tooltip on native (RN has no SDK)
 *   - Phone button shows clean error if provider not enabled in Firebase
 *   - Session token is force-refreshed on screen focus
 *   - Countdown resets on OTP error so the user can immediately retry
 */
import { BUSINESS } from '../../config/business';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { t } from '../../i18n';
import { useAppearance } from '../../contexts/AppearanceContext';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction, notify } from '../../components/Feedback';
import { C, R, SP, T, themed } from '../../theme';

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const IS_NATIVE = typeof window === 'undefined';

const LoginScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<any>();
  const {
    signInWithPhone, signInWithEmail, signInWithGoogle,
    currentUser, isAnonymous, refreshSession, isPhoneProviderDisabled,
  } = useAuth();
  const [mode, setMode] = useState<'phone' | 'email' | 'google'>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // Force-refresh the ID token whenever the screen regains focus.
  // This catches password changes / revocations made elsewhere.
  useFocusEffect(useCallback(() => {
    if (currentUser && !currentUser.isAnonymous) {
      refreshSession().catch(() => {});
    }
  }, [currentUser, refreshSession]));

  // If already signed in (and not anonymous), auto-redirect.
  useEffect(() => {
    if (currentUser && !currentUser.isAnonymous) {
      navigation.replace('Main');
    }
  }, [currentUser, navigation]);

  // OTP countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleSendOTP = async () => {
    if (!PHONE_REGEX.test(phone)) {
      notify(t('錯誤'), t('請輸入有效電話號碼（例：+852****4567）'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhone(phone);
      setConfirmResult(result);
      setOtpSent(true);
      setCountdown(60);
    } catch (e: any) {
      if (isPhoneProviderDisabled(e)) {
        confirmAction(t('電話登入未啟用'),
          t('此 App 尚未啟用電話登入，請改用 Email 登入，或聯絡管理員。'),
          [{ text: t('改用 Email'), onPress: () => setMode('email') }, { text: t('取消') }],
        );
      } else {
        notify(t('發送失敗'), e?.message ?? t('請稍後再試'));
      }
      // Reset OTP state on any error
      setOtpSent(false);
      setConfirmResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!confirmResult || otp.length < 6) {
      notify(t('錯誤'), t('請輸入 6 位驗證碼'));
      return;
    }
    setLoading(true);
    try {
      await confirmResult.confirm(otp);
      // onAuthStateChanged will fire and the useEffect above will navigate
    } catch (e: any) {
      notify(t('驗證失敗'), e?.message ?? t('驗證碼不正確'));
      // Reset countdown so user can immediately request a new code
      setCountdown(0);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      notify(t('錯誤'), t('請填寫 Email 及密碼'));
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithEmail(email.trim().toLowerCase(), password);
      if (result.kind === 'needs_signup') {
        // User doesn't exist — offer explicit signup rather than auto-creating
        confirmAction(t('帳戶未註冊'),
          t('未有此 Email 帳戶。是否前往註冊？'),
          [
            { text: t('前往註冊'), onPress: () => navigation.navigate('Register') },
            { text: t('取消'), style: 'cancel' },
          ],
        );
        return;
      }
      if (result.kind === 'error') {
        notify(t('登入失敗'), result.message);
        return;
      }
      // Success — onAuthStateChanged will navigate
    } catch (e: any) {
      notify(t('登入失敗'), e?.message ?? t('請稍後再試'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Wordmark. The emoji card used to sit in front of the name; a
            wordmark sets the brand without a glyph that renders
            differently on every platform. */}
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Ionicons name="diamond" size={18} color={C.void} />
          </View>
          <Text style={styles.brandName}>
            Poke<Text style={styles.brandAccent}>Market</Text>
          </Text>
          <Text style={styles.brandTag}>{t('寶可夢卡 · 港版買賣平台')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('登入')}</Text>
          <Text style={styles.subtitle}>
            {isAnonymous ? t('升級帳戶以開始交易') : t('選擇登入方式')}
          </Text>

          {/* Mode toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'phone' ? styles.toggleBtnActive : null]}
              onPress={() => setMode('phone')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'phone' }}
            >
              <Ionicons
                name="call-outline"
                size={15}
                color={mode === 'phone' ? C.text : C.textTertiary}
              />
              <Text
                style={[
                  styles.toggleTxt,
                  mode === 'phone' ? styles.toggleTxtActive : null,
                ]}
              >{t('電話')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'email' ? styles.toggleBtnActive : null]}
              onPress={() => setMode('email')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'email' }}
            >
              <Ionicons
                name="mail-outline"
                size={15}
                color={mode === 'email' ? C.text : C.textTertiary}
              />
              <Text
                style={[
                  styles.toggleTxt,
                  mode === 'email' ? styles.toggleTxtActive : null,
                ]}
              >
                Email
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'google' ? styles.toggleBtnActive : null]}
              onPress={() => setMode('google')}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'google' }}
            >
              <Ionicons
                name="logo-google"
                size={15}
                color={mode === 'google' ? C.text : C.textTertiary}
              />
              <Text
                style={[
                  styles.toggleTxt,
                  mode === 'google' ? styles.toggleTxtActive : null,
                ]}
              >
                Google
              </Text>
            </TouchableOpacity>
          </View>

          {/* Phone mode */}
          {mode === 'phone' && (
            <>
              {!otpSent ? (
                <>
                  <Text style={styles.label}>{t('電話號碼')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="+852 6123 4567"
                    placeholderTextColor={C.textTertiary}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    autoComplete="tel"
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOTP} disabled={loading}>
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('發送驗證碼')}</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.label}>{t('輸入驗證碼')}</Text>
                  <Text style={styles.codeHint}>已發送至 {phone}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('6 位數字')}
                    placeholderTextColor={C.textTertiary}
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otp}
                    onChangeText={setOtp}
                  />
                  <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyOTP} disabled={loading}>
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('驗證登入')}</Text>
                    )}
                  </TouchableOpacity>
                  {countdown > 0 ? (
                    <Text style={styles.resend}>{countdown}s 後可重發</Text>
                  ) : (
                    <TouchableOpacity onPress={handleSendOTP}>
                      <Text style={styles.resendLink}>{t('重發驗證碼')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </>
          )}

          {/* Email mode */}
          {mode === 'email' && (
            <>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor={C.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.label}>{t('密碼')}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="••••••••"
                  placeholderTextColor={C.textTertiary}
                  secureTextEntry={!showPassword}
                  autoComplete="current-password"
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('隱藏密碼') : t('顯示密碼')}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={C.textTertiary}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleEmailLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>{t('登入')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Register')}>
                <Text style={styles.linkText}>{t('未有帳戶？立即註冊 →')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Google mode */}
          {mode === 'google' && (
            <>
              {IS_NATIVE ? (
                <View style={styles.googleDisabled}>
                  <Ionicons name="phone-portrait-outline" size={22} color={C.warn} />
                  <Text style={styles.googleDisabledTitle}>{t('手機版尚未支援')}</Text>
                  <Text style={styles.googleDisabledText}>
                    Google 登入需要安裝額外的 native SDK。{'\n'}
                    請改用 Email 登入或到網頁版體驗。
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => setMode('email')}
                  >
                    <Text style={styles.primaryBtnText}>{t('改用 Email →')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={async () => {
                    setLoading(true);
                    try { await signInWithGoogle(); }
                    catch (e: any) { notify(t('Google 登入失敗'), e?.message ?? t('請稍後再試')); }
                    finally { setLoading(false); }
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={C.text} />
                  ) : (
                    <View style={styles.googleBtnInner}>
                      <Ionicons name="logo-google" size={18} color={C.text} />
                      <Text style={styles.googleBtnText}>{t('用 Google 帳戶登入')}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              {!IS_NATIVE && (
                <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('email')}>
                  <Text style={styles.linkText}>{t('改用 Email 登入 →')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.policyLink}
          onPress={() => navigation.navigate('PublicInfo')}
        >
          <Text style={styles.legal}>{t('登入即表示同意《用戶協議》及《隱私政策》')}</Text>
        </TouchableOpacity>
        {/* The business details. A payment provider's review looks for
            these on the site, and a visitor should be able to see who
            they are dealing with before they sign in. */}
        <View style={styles.businessBlock}>
          <Text style={styles.businessName}>{BUSINESS.companyName}</Text>
          <Text style={styles.businessLine}>
            {t('商業登記號碼')}: {BUSINESS.registrationNumber}
          </Text>
          <Text style={styles.businessLine}>{BUSINESS.address}</Text>
          <Text style={styles.businessLine}>
            {BUSINESS.supportEmail} · {BUSINESS.supportPhone}
          </Text>
          <TouchableOpacity
            style={styles.aboutLink}
            onPress={() => navigation.navigate('PublicInfo')}
          >
            <Text style={styles.aboutLinkText}>
              {t('關於 PokeMarket · 條款 · 私隱政策 · 運送及退貨政策 →')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.void },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SP.xl,
    paddingVertical: SP.xxxl,
  },

  // ─── Brand ────────────────────────────────────────────────────────────────
  brand: { alignItems: 'center', marginBottom: SP.xl },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: R.md,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP.md,
  },
  brandName: {
    ...T.display,
    fontSize: 30,
    color: C.text,
    letterSpacing: -1.2,
  },
  brandAccent: { color: C.action },
  brandTag: {
    ...T.caption,
    color: C.textTertiary,
    marginTop: 6,
    letterSpacing: 0.4,
  },

  // ─── Card ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderRadius: R.xl,
    padding: SP.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { ...T.title, color: C.text },
  subtitle: { ...T.small, color: C.textSecondary, marginTop: 2, marginBottom: SP.xl },

  // ─── Toggle ───────────────────────────────────────────────────────────────
  toggle: {
    flexDirection: 'row',
    backgroundColor: C.void,
    borderRadius: R.md,
    padding: 4,
    marginBottom: SP.xl,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    borderRadius: R.sm,
  },
  toggleBtnActive: { backgroundColor: C.elevated },
  toggleTxt: { ...T.caption, color: C.textTertiary },
  toggleTxtActive: { color: C.text },

  // ─── Fields ───────────────────────────────────────────────────────────────
  label: {
    ...T.overline,
    color: C.textTertiary,
    marginBottom: 6,
    marginTop: SP.sm,
  },
  input: {
    backgroundColor: C.void,
    borderRadius: R.md,
    paddingHorizontal: SP.lg,
    paddingVertical: 14,
    color: C.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: C.border,
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 48 },
  eyeButton: {
    position: 'absolute',
    right: SP.md,
    padding: 6,
  },

  // ─── Buttons ──────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: C.action,
    borderRadius: R.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: SP.lg,
  },
  primaryBtnText: { ...T.bodyStrong, color: '#FFF', fontSize: 16 },
  googleBtn: {
    backgroundColor: C.elevated,
    borderRadius: R.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: SP.sm,
    borderWidth: 1,
    borderColor: C.borderActive,
  },
  googleBtnInner: { flexDirection: 'row', alignItems: 'center', gap: SP.sm },
  googleBtnText: { ...T.bodyStrong, color: C.text },
  googleDisabled: {
    backgroundColor: 'rgba(245,166,35,0.08)',
    borderRadius: R.md,
    padding: SP.xl,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.28)',
    alignItems: 'center',
  },
  googleDisabledTitle: {
    ...T.bodyStrong,
    color: C.warn,
    marginTop: SP.sm,
    marginBottom: 6,
  },
  googleDisabledText: {
    ...T.small,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: SP.md,
  },

  // ─── Links and notes ──────────────────────────────────────────────────────
  codeHint: { ...T.caption, color: C.textTertiary, marginBottom: 6 },
  resend: { ...T.caption, color: C.textTertiary, textAlign: 'center', marginTop: SP.md },
  resendLink: {
    ...T.caption,
    color: C.action,
    textAlign: 'center',
    marginTop: SP.md,
  },
  linkBtn: { alignItems: 'center', marginTop: SP.lg },
  linkText: { ...T.small, color: C.textSecondary },
  legal: {
    ...T.caption,
    color: C.textDisabled,
    textAlign: 'center',
    marginTop: SP.xl,
    lineHeight: 16,
  },
  policyLink: { alignItems: 'center' },
  businessBlock: {
    alignItems: 'center',
    marginTop: SP.lg,
    paddingTop: SP.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    gap: 2,
  },
  businessName: { ...T.caption, color: C.textSecondary, fontWeight: '700' },
  businessLine: { ...T.caption, color: C.textDisabled, textAlign: 'center' },
  aboutLink: { marginTop: SP.sm },
  aboutLinkText: { ...T.caption, color: C.action },
}))

export default LoginScreen;
