/**
 * RegisterScreen — User registration (phone + email + display name)
 * Called after first successful auth (phone OTP or email signup)
 */
import React, { useState } from 'react';
import { t } from '../../i18n';
import { useAppearance } from '../../contexts/AppearanceContext';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { confirmAction, notify } from '../../components/Feedback';
import { C, themed } from '../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PIN_LENGTH = 6;
// Block common weak PINs that would survive a brute force trivially
const WEAK_PINS = new Set([
  '000000', '111111', '123456', '654321', '121212', '112233',
  '123321', '666666', '696969', '999999', '888888', '777777',
  '555555', '444444', '333333', '222222', '111111', '012345',
  '098765', '131313', '101010', '424242', '999000',
]);

const RegisterScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<any>();
  // Destructure ALL hooks at the top level (never inside callbacks)
  const { updateProfile, setTransactionPin, currentUser, registerWithEmail } = useAuth();
  const [step, setStep] = useState<'profile' | 'pin' | 'done'>('profile');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!displayName.trim()) { notify(t('錯誤'), t('請輸入暱稱')); return; }
    if (displayName.trim().length < 2) { notify(t('錯誤'), t('暱稱至少 2 個字')); return; }
    if (!email.trim()) { notify(t('錯誤'), t('請輸入 Email')); return; }
    if (!EMAIL_REGEX.test(email.trim())) { notify(t('錯誤'), t('Email 格式不正確')); return; }
    if (!password) { notify(t('錯誤'), t('請設定登入密碼')); return; }
    if (password.length < 6) { notify(t('錯誤'), t('密碼最少 6 位')); return; }
    if (password !== confirmPassword) { notify(t('錯誤'), t('兩次密碼不相同')); return; }
    if (phone && !PHONE_REGEX.test(phone)) { notify(t('錯誤'), t('電話格式不正確')); return; }

    setLoading(true);
    try {
      // 1. Create the real Firebase Auth account (or upgrade the anonymous
      //    session, keeping the uid and any data already attached to it).
      //    Without this the password was collected and thrown away — the
      //    user stayed anonymous forever.
      const result = await registerWithEmail(email.trim().toLowerCase(), password);
      if (result.kind === 'error') {
        confirmAction(
          result.code === 'auth/email-already-in-use' ? t('Email 已被註冊') : t('註冊失敗'),
          result.message,
          result.code === 'auth/email-already-in-use'
            ? [{ text: t('去登入'), onPress: () => navigation.replace('Login') }, { text: t('取消'), style: 'cancel' }]
            : [{ text: t('好') }],
        );
        return;
      }

      // 2. Save the profile details (display name, phone, email).
      await updateProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        isBuyer: true,
        isSeller: false,
      });
      setStep('pin');
    } catch (e: any) {
      notify(t('註冊失敗'), e.message ?? t('請稍後再試'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    if (pin.length < MIN_PIN_LENGTH) {
      notify(t('錯誤'), `交易密碼最少 ${MIN_PIN_LENGTH} 位數字`);
      return;
    }
    if (pin !== pinConfirm) {
      notify(t('錯誤'), t('兩次輸入的密碼不相同'));
      return;
    }
    if (WEAK_PINS.has(pin)) {
      notify(t('太弱的密碼'), t('請勿使用 123456、111111 等常見密碼'));
      return;
    }
    if (!/^\d+$/.test(pin)) {
      notify(t('格式錯誤'), t('交易密碼只能包含數字'));
      return;
    }
    setLoading(true);
    try {
      // setTransactionPin is destructured at the top of the component
      await setTransactionPin(pin);
      setStep('done');
    } catch (e: any) {
      notify(t('設定失敗'), e.message ?? t('請稍後再試'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'pin') return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.centered}>
        <View style={styles.card}>
          <Text style={styles.logo}>🔐</Text>
          <Text style={styles.title}>{t('設定交易密碼')}</Text>
          <Text style={styles.subtitle}>{t('每次交易釋放款項時都需要輸入呢個密碼')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('{p0} 位數字交易密碼', { p0: MIN_PIN_LENGTH })}
            placeholderTextColor={C.textTertiary}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            value={pin}
            onChangeText={setPin}
          />
          <TextInput
            style={styles.input}
            placeholder={t('再次輸入交易密碼')}
            placeholderTextColor={C.textTertiary}
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            value={pinConfirm}
            onChangeText={setPinConfirm}
          />
          <Text style={styles.pinHint}>
            {t('• 最少 {p0} 位', { p0: MIN_PIN_LENGTH })}{'\n'}
            {t('• 只能用數字')}{'\n'}
            {t('• 避免 123456、111111 等常見組合')}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSetPin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>{t('確認設定')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep('done')}>
            <Text style={styles.skipText}>{t('稍後設定 →')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (step === 'done') return (
    <View style={styles.container}>
      <View style={styles.centered}>
        <Ionicons name="checkmark-circle" size={14} color={C.textTertiary} />
        <Text style={styles.title}>{t('歡迎加入 PokeMarket！')}</Text>
        <Text style={styles.subtitle}>
          {currentUser?.isAnonymous
            ? t('你將以訪客身份繼續瀏覽。建立交易前需要完成註冊。')
            : t('你可以開始買賣 Pokemon 卡片了')}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('Main')}>
          <Text style={styles.primaryBtnText}>{t('進入主頁 →')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{t('← 返回')}</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>{t('步驟 1/2')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('完善個人資料')}</Text>
          <Text style={styles.subtitle}>
            {currentUser?.isAnonymous
              ? t('升級訪客帳戶，建立完整檔案以開始交易')
              : t('讓對方知道你是邊個')}
          </Text>

          <Text style={styles.label}>{t('暱稱 *')}</Text>
          <TextInput style={styles.input} placeholder={t('顯示名稱')} placeholderTextColor={C.textTertiary}
            value={displayName} onChangeText={setDisplayName} maxLength={30} />

          <Text style={styles.label}>{t('電話號碼')}</Text>
          <TextInput style={styles.input} placeholder="+852 6123 4567" placeholderTextColor={C.textTertiary}
            keyboardType="phone-pad" value={phone} onChangeText={setPhone} autoComplete="tel" />

          <Text style={styles.label}>Email *</Text>
          <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor={C.textTertiary}
            keyboardType="email-address" autoCapitalize="none" value={email}
            onChangeText={setEmail} autoComplete="email" />

          <Text style={styles.label}>{t('設定登入密碼 *')}</Text>
          <TextInput style={styles.input} placeholder={t('最少 6 位')} placeholderTextColor={C.textTertiary}
            secureTextEntry value={password} onChangeText={setPassword} autoComplete="new-password" />

          <Text style={styles.label}>{t('確認密碼 *')}</Text>
          <TextInput style={styles.input} placeholder={t('再次輸入密碼')} placeholderTextColor={C.textTertiary}
            secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword}
            autoComplete="new-password" />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>{t('下一步 →')}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  back: { color: C.action, fontSize: 15, fontWeight: '600' },
  stepLabel: { color: C.textTertiary, fontSize: 13 },
  card: { backgroundColor: C.elevated, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: C.border },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  title: { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: C.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 20 },
  label: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: C.border,
  },
  pinHint: { color: C.textTertiary, fontSize: 11, marginBottom: 16, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: C.action, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { color: C.textSecondary, fontSize: 13 },
}))

export default RegisterScreen;
