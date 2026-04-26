/**
 * LoginScreen — Phone + Email + Biometric
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { getAuth } from 'firebase/auth';

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { signInWithPhone, signInWithEmail, signInWithGoogle, currentUser } = useAuth();
  const [mode, setMode] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) navigation.replace('MainTabs');
  }, [currentUser]);

  // OTP countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleSendOTP = async () => {
    if (!PHONE_REGEX.test(phone)) {
      Alert.alert('錯誤', '請輸入有效電話號碼（例：+85261234567）');
      return;
    }
    setLoading(true);
    try {
      const result = await signInWithPhone(phone);
      setConfirmResult(result);
      setOtpSent(true);
      setCountdown(60);
    } catch (e: any) {
      Alert.alert('發送失敗', e.message ?? '請稍後再試');
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
    } catch (e: any) {
      Alert.alert('驗證失敗', e.message ?? '驗證碼不正確');
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
      await signInWithEmail(email, password);
    } catch (e: any) {
      Alert.alert('登入失敗', e.message ?? 'Email 或密碼錯誤');
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
        <Text style={styles.title}>登入 / 註冊</Text>
        <Text style={styles.subtitle}>電話或 Email 均可登入</Text>

        {/* Mode Toggle */}
        <View style={styles.toggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'phone' && styles.toggleBtnActive]}
            onPress={() => setMode('phone')}
          >
            <Text style={[styles.toggleTxt, mode === 'phone' && styles.toggleTxtActive]}>📱 電話</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'email' && styles.toggleBtnActive]}
            onPress={() => setMode('email')}
          >
            <Text style={[styles.toggleTxt, mode === 'email' && styles.toggleTxtActive]}>✉️ Email</Text>
          </TouchableOpacity>
        </View>

        {mode === 'phone' ? (
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

                {/* ── Google Sign-In ── */}
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>或</Text>
                  <View style={styles.dividerLine} />
                </View>
                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={async () => {
                    setLoading(true);
                    try { await signInWithGoogle(); } catch (e: any) {
                      Alert.alert('Google 登入失敗', e.message ?? '請稍後再試');
                    } finally { setLoading(false); }
                  }}
                  disabled={loading}
                >
                  <Text style={styles.googleBtnIcon}>🌐</Text>
                  <Text style={styles.googleBtnText}>以 Google 帳戶繼續</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.label}>輸入驗證碼</Text>
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
                  <Text style={styles.resend}>重新發送（{countdown}s）</Text>
                ) : (
                  <TouchableOpacity onPress={handleSendOTP}>
                    <Text style={styles.resendLink}>重發驗證碼</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        ) : (
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
  resend: { color: '#6666AA', fontSize: 12, textAlign: 'center', marginTop: 12 },
  resendLink: { color: '#FF3C3C', fontSize: 12, textAlign: 'center', marginTop: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A2A3E' },
  dividerText: { color: '#6666AA', fontSize: 12, paddingHorizontal: 12 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1.5, borderColor: '#2A2A3E', gap: 10,
  },
  googleBtnIcon: { fontSize: 20 },
  googleBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  linkBtn: { alignItems: 'center', marginTop: 20 },
  linkText: { color: '#8888AA', fontSize: 13 },
  legal: { color: '#4444AA', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 16 },
});

export default LoginScreen;
