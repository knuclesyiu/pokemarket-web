/**
 * RegisterScreen — User registration (phone + email + display name)
 * Called after first successful auth (phone OTP or email signup)
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';

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
  const navigation = useNavigation<any>();
  // Destructure ALL hooks at the top level (never inside callbacks)
  const { updateProfile, setTransactionPin, currentUser } = useAuth();
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
    if (!displayName.trim()) { Alert.alert('錯誤', '請輸入暱稱'); return; }
    if (displayName.trim().length < 2) { Alert.alert('錯誤', '暱稱至少 2 個字'); return; }
    if (phone && !PHONE_REGEX.test(phone)) { Alert.alert('錯誤', '電話格式不正確'); return; }
    if (email && !EMAIL_REGEX.test(email)) { Alert.alert('錯誤', 'Email 格式不正確'); return; }
    if (password && password.length < 6) { Alert.alert('錯誤', '密碼最少 6 位'); return; }
    if (password && password !== confirmPassword) { Alert.alert('錯誤', '兩次密碼不相同'); return; }

    setLoading(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        isBuyer: true,
        isSeller: false,
      });
      setStep('pin');
    } catch (e: any) {
      Alert.alert('註冊失敗', e.message ?? '請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPin = async () => {
    if (pin.length < MIN_PIN_LENGTH) {
      Alert.alert('錯誤', `交易密碼最少 ${MIN_PIN_LENGTH} 位數字`);
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert('錯誤', '兩次輸入的密碼不相同');
      return;
    }
    if (WEAK_PINS.has(pin)) {
      Alert.alert('太弱的密碼', '請勿使用 123456、111111 等常見密碼');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      Alert.alert('格式錯誤', '交易密碼只能包含數字');
      return;
    }
    setLoading(true);
    try {
      // setTransactionPin is destructured at the top of the component
      await setTransactionPin(pin);
      setStep('done');
    } catch (e: any) {
      Alert.alert('設定失敗', e.message ?? '請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'pin') return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.centered}>
        <View style={styles.card}>
          <Text style={styles.logo}>🔐</Text>
          <Text style={styles.title}>設定交易密碼</Text>
          <Text style={styles.subtitle}>
            每次交易釋放款項時都需要輸入呢個密碼
          </Text>
          <TextInput
            style={styles.input}
            placeholder={`${MIN_PIN_LENGTH} 位數字交易密碼`}
            placeholderTextColor="#6666AA"
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            value={pin}
            onChangeText={setPin}
          />
          <TextInput
            style={styles.input}
            placeholder="再次輸入交易密碼"
            placeholderTextColor="#6666AA"
            keyboardType="number-pad"
            maxLength={8}
            secureTextEntry
            value={pinConfirm}
            onChangeText={setPinConfirm}
          />
          <Text style={styles.pinHint}>
            • 最少 {MIN_PIN_LENGTH} 位{'\n'}
            • 只能用數字{'\n'}
            • 避免 123456、111111 等常見組合
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSetPin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>確認設定</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => setStep('done')}>
            <Text style={styles.skipText}>稍後設定 →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  if (step === 'done') return (
    <View style={styles.container}>
      <View style={styles.centered}>
        <Text style={styles.logo}>✅</Text>
        <Text style={styles.title}>歡迎加入 PokeMarket！</Text>
        <Text style={styles.subtitle}>
          {currentUser?.isAnonymous
            ? '你將以訪客身份繼續瀏覽。建立交易前需要完成註冊。'
            : '你可以開始買賣 Pokemon 卡片了'}
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('MainTabs')}>
          <Text style={styles.primaryBtnText}>進入主頁 →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>步驟 1/2</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>完善個人資料</Text>
          <Text style={styles.subtitle}>
            {currentUser?.isAnonymous
              ? '升級訪客帳戶，建立完整檔案以開始交易'
              : '讓對方知道你是邊個'}
          </Text>

          <Text style={styles.label}>暱稱 *</Text>
          <TextInput style={styles.input} placeholder="顯示名稱" placeholderTextColor="#6666AA"
            value={displayName} onChangeText={setDisplayName} maxLength={30} />

          <Text style={styles.label}>電話號碼</Text>
          <TextInput style={styles.input} placeholder="+852 6123 4567" placeholderTextColor="#6666AA"
            keyboardType="phone-pad" value={phone} onChangeText={setPhone} autoComplete="tel" />

          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} placeholder="your@email.com" placeholderTextColor="#6666AA"
            keyboardType="email-address" autoCapitalize="none" value={email}
            onChangeText={setEmail} autoComplete="email" />

          <Text style={styles.label}>設定登入密碼（如使用 Email 登入）</Text>
          <TextInput style={styles.input} placeholder="最少 6 位" placeholderTextColor="#6666AA"
            secureTextEntry value={password} onChangeText={setPassword} autoComplete="new-password" />

          {password !== '' && (
            <>
              <Text style={styles.label}>確認密碼</Text>
              <TextInput style={styles.input} placeholder="再次輸入密碼" placeholderTextColor="#6666AA"
                secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
            </>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>下一步 →</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  back: { color: '#FF3C3C', fontSize: 15, fontWeight: '600' },
  stepLabel: { color: '#6666AA', fontSize: 13 },
  card: { backgroundColor: '#1E1E2E', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#2A2A3E' },
  logo: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#8888AA', fontSize: 13, marginBottom: 24, lineHeight: 20 },
  label: { color: '#8888AA', fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: '#12121F', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: '#2A2A3E',
  },
  pinHint: { color: '#6666AA', fontSize: 11, marginBottom: 16, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: '#FF3C3C', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { color: '#8888AA', fontSize: 13 },
});

export default RegisterScreen;
