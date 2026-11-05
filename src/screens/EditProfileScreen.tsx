/**
 * EditProfileScreen — let the user edit their own profile details.
 *
 * Writes through `updateProfile` in AuthContext, which merges into
 * `users/{uid}` in Firestore. Only fields the user is allowed to change
 * are sent — reputation counters (positiveReviews / negativeReviews)
 * and the transaction PIN hash are server-managed.
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { userProfile, updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? '');
  const [phone, setPhone] = useState(userProfile?.phone ?? '');
  const [email, setEmail] = useState(userProfile?.email ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) { Alert.alert('錯誤', '請輸入暱稱'); return; }
    if (name.length < 2) { Alert.alert('錯誤', '暱稱至少 2 個字'); return; }
    if (phone && !PHONE_REGEX.test(phone.trim())) { Alert.alert('錯誤', '電話格式不正確'); return; }
    if (email && !EMAIL_REGEX.test(email.trim())) { Alert.alert('錯誤', 'Email 格式不正確'); return; }

    setSaving(true);
    try {
      await updateProfile({
        displayName: name,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
      });
      Alert.alert('✅ 已儲存', '個人資料已更新', [
        { text: '完成', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('儲存失敗', e?.message ?? '請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>編輯資料</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>個人資料</Text>
          <Text style={styles.subtitle}>
            呢啲資料會顯示俾其他用戶睇，同埋用嚟聯絡你
          </Text>

          <Text style={styles.label}>暱稱 *</Text>
          <TextInput
            style={styles.input}
            placeholder="顯示名稱"
            placeholderTextColor="#6666AA"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={30}
          />

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

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor="#6666AA"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
          />

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.primaryBtnText}>儲存</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  back: { color: '#FF3C3C', fontSize: 15, fontWeight: '600' },
  stepLabel: { color: '#6666AA', fontSize: 13 },
  card: { backgroundColor: '#1E1E2E', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: '#2A2A3E' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#8888AA', fontSize: 13, marginBottom: 24, lineHeight: 20 },
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
});

export default EditProfileScreen;
