/**
 * EditProfileScreen — let the user edit their own profile details.
 *
 * Writes through `updateProfile` in AuthContext, which merges into
 * `users/{uid}` in Firestore. Only fields the user is allowed to change
 * are sent — reputation counters (positiveReviews / negativeReviews)
 * and the transaction PIN hash are server-managed.
 */
import React, { useState } from 'react';
import { useAppearance } from '../contexts/AppearanceContext';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { confirmAction, notify } from '../components/Feedback';
import { C, themed } from '../theme';
import Ionicons from '@expo/vector-icons/Ionicons';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;

const EditProfileScreen: React.FC = () => {
  const { t } = useAppearance();

  const navigation = useNavigation<any>();
  const { userProfile, updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState(userProfile?.displayName ?? '');
  const [phone, setPhone] = useState(userProfile?.phone ?? '');
  const [email, setEmail] = useState(userProfile?.email ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const name = displayName.trim();
    if (!name) { notify(t('錯誤'), '請輸入暱稱'); return; }
    if (name.length < 2) { notify(t('錯誤'), '暱稱至少 2 個字'); return; }
    if (phone && !PHONE_REGEX.test(phone.trim())) { notify(t('錯誤'), '電話格式不正確'); return; }
    if (email && !EMAIL_REGEX.test(email.trim())) { notify(t('錯誤'), 'Email 格式不正確'); return; }

    setSaving(true);
    try {
      await updateProfile({
        displayName: name,
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
      });
      confirmAction(t('已儲存'), '個人資料已更新', [
        { text: '完成', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      notify('儲存失敗', e?.message ?? '請稍後再試');
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
            <Text style={styles.back}>{t('← 返回')}</Text>
          </TouchableOpacity>
          <Text style={styles.stepLabel}>{t('編輯資料')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t('個人資料')}</Text>
          <Text style={styles.subtitle}>
            呢啲資料會顯示俾其他用戶睇，同埋用嚟聯絡你
          </Text>

          <Text style={styles.label}>{t('暱稱 *')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('顯示名稱')}
            placeholderTextColor={C.textTertiary}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={30}
          />

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

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="your@email.com"
            placeholderTextColor={C.textTertiary}
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
              : <Text style={styles.primaryBtnText}>{t('儲存')}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.surface },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  back: { color: C.action, fontSize: 15, fontWeight: '600' },
  stepLabel: { color: C.textTertiary, fontSize: 13 },
  card: { backgroundColor: C.elevated, borderRadius: 24, padding: 28, borderWidth: 1, borderColor: C.border },
  title: { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: C.textSecondary, fontSize: 13, marginBottom: 24, lineHeight: 20 },
  label: { color: C.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 15, marginBottom: 16, borderWidth: 1, borderColor: C.border,
  },
  primaryBtn: {
    backgroundColor: C.action, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 8,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
}))

export default EditProfileScreen;
