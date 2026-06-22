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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const IS_NATIVE = typeof window === 'undefined';

const LoginScreen: React.FC = () => {
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
      navigation.replace('MainTabs');
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
      Alert.alert('錯誤', '請輸入有效電話號碼（例：+852****4567）');
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
        Alert.alert(
          '電話登入未啟用',
          '此 App 尚未啟用電話登入，請改用 Email 登入，或聯絡管理員。',
          [{ text: '改用 Email', onPress: () => setMode('email') }, { text: '取消' }],
        );
      } else {
        Alert.alert('發送失敗', e?.message ?? '請稍後再試');
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
      Alert.alert('錯誤', '請輸入 6 位驗證碼');
      return;
    }
    setLoading(true);
    try {
      await confirmResult.confirm(otp);
      // onAuthStateChanged will fire and the useEffect above will navigate
    } catch (e: any) {
      Alert.alert('驗證失敗', e?.message ?? '驗證碼不正確');
      // Reset countdown so user can immediately request a new code
      setCountdown(0);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert('錯誤', '請填寫 Email 及密碼');
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithEmail(email.trim().toLowerCase(), password);
      if (result.kind === 'needs_signup') {
        // User doesn't exist — offer explicit signup rather than auto-creating
        Alert.alert(
          '帳戶未註冊',
          `未有此 Email 帳戶。是否前往註冊？`,
          [
            { text: '前往註冊', onPress: () => navigation.navigate('Register') },
            { text: '取消', style: 'cancel' },
          ],
        );
        return;
      }
      if (result.kind === 'error') {
        Alert.alert('登入失敗', result.message);
        return;
      }
      // Success — onAuthStateChanged will navigate
    } catch (e: any) {
      Alert.alert('登入失敗', e?.message ?? '請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>🎴 PokeMarket</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>登入</Text>
        <Text style={styles.subtitle}>
          {isAnonymous ? '升級帳戶以開始交易' : '選擇登入方式'}
        </Text>

        {/* Mode Toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'phone' ? styles.toggleBtnActive : null]}
            onPress={() => setMode('phone')}
          >
            <Text style={[styles.toggleTxt, mode === 'phone' ? styles.toggleTxtActive : null]}>📱 電話</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'email' ? styles.toggleBtnActive : null]}
            onPress={() => setMode('email')}
          >
            <Text style={[styles.toggleTxt, mode === 'email' ? styles.toggleTxtActive : null]}>✉️ Email</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'google' ? styles.toggleBtnActive : null]}
            onPress={() => setMode('google')}
          >
            <Text style={[styles.toggleTxt, mode === 'google' ? styles.toggleTxtActive : null]}>🔵 Google</Text>
          </TouchableOpacity>
        </View>

        {/* Phone mode */}
        {mode === 'phone' && (
          <>
            {!otpSent ? (
              <>
                <Text style={styles.label}>電話號碼</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+852 6123 4567"
                  placeholderTextColor="#6666AA"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  autoComplete="tel"
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOTP} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>發送驗證碼</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>輸入驗證碼</Text>
                <Text style={styles.codeHint}>已發送至 {phone}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="6 位數字"
                  placeholderTextColor="#6666AA"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyOTP} disabled={loading}>
                  {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>驗證登入</Text>}
                </TouchableOpacity>
                {countdown > 0 ? (
                  <Text style={styles.resend}>{countdown}s 後可重發</Text>
                ) : (
                  <TouchableOpacity onPress={handleSendOTP}>
                    <Text style={styles.resendLink}>重發驗證碼</Text>
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
              placeholderTextColor="#6666AA"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>密碼</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#6666AA"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleEmailLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>登入</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkText}>未有帳戶？立即註冊 →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Google mode */}
        {mode === 'google' && (
          <>
            {IS_NATIVE ? (
              <View style={styles.googleDisabled}>
                <Text style={styles.googleDisabledTitle}>📱 手機版尚未支援</Text>
                <Text style={styles.googleDisabledText}>
                  Google 登入需要安裝額外的 native SDK。{'\n'}
                  請改用 Email 登入或到網頁版體驗。
                </Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => setMode('email')}
                >
                  <Text style={styles.primaryBtnText}>改用 Email →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={async () => {
                  setLoading(true);
                  try { await signInWithGoogle(); }
                  catch (e: any) { Alert.alert('Google 登入失敗', e?.message ?? '請稍後再試'); }
                  finally { setLoading(false); }
                }}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.googleBtnText}>🔵 用 Google 帳戶登入</Text>}
              </TouchableOpacity>
            )}
            {!IS_NATIVE && (
              <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('email')}>
                <Text style={styles.linkText}>改用 Email 登入 →</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      <Text style={styles.legal}>
        登入即表示同意《用戶協議》及《隱私政策》
      </Text>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F', justifyContent: 'center', paddingHorizontal: 24 },
  topBar: { alignItems: 'center', marginBottom: 32 },
  logo: { color: '#FF3C3C', fontSize: 28, fontWeight: '900', fontStyle: 'italic' },
  card: { backgroundColor: '#1E1E2E', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#2A2A3E' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#8888AA', fontSize: 13, marginBottom: 24 },
  toggle: { flexDirection: 'row', backgroundColor: '#12121F', borderRadius: 12, padding: 4, marginBottom: 24 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  toggleBtnActive: { backgroundColor: '#FF3C3C' },
  toggleTxt: { color: '#8888AA', fontSize: 13, fontWeight: '600' },
  toggleTxtActive: { color: '#FFF', fontWeight: '700' },
  label: { color: '#8888AA', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#12121F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A3E',
  },
  primaryBtn: {
    backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  codeHint: { color: '#6666AA', fontSize: 12, marginBottom: 8 },
  resend: { color: '#6666AA', fontSize: 12, textAlign: 'center', marginTop: 12 },
  resendLink: { color: '#FF3C3C', fontSize: 12, textAlign: 'center', marginTop: 12 },
  linkBtn: { alignItems: 'center', marginTop: 20 },
  linkText: { color: '#8888AA', fontSize: 13 },
  legal: { color: '#4444AA', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 16 },
  googleBtn: {
    backgroundColor: '#1E1E2E', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#4A4A70',
  },
  googleBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  googleDisabled: {
    backgroundColor: 'rgba(255,107,53,0.08)', borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.3)', alignItems: 'center',
  },
  googleDisabledTitle: { color: '#FF6B35', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  googleDisabledText: { color: '#8888AA', fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
});

export default LoginScreen;
