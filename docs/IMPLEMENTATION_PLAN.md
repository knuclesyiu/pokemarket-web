# PokeMarket — Implementation Plan

> 三個功能完整實作藍圖：Version Search / Card Quality Review / DM Chat
> 依賴關係：`Version Search → Quality Review → DM Chat`（建議順序）

---

## 功能優先次序

| # | 功能 | 價值 | 工作量 | 理由 |
|---|------|------|--------|------|
| 1 | Version Search | 直接提升成交 | ⭐⭐ | 最快落地，立即有效 |
| 2 | Card Quality Review | 建立交易信任 | ⭐⭐⭐⭐ | 核心功能，改動範圍大 |
| 3 | DM Chat | 提升黏著度 | ⭐⭐⭐ | 需 Firestore security rules |

---

## Feature 1: 版本篩選 Search

### Overview
用戶可在市場頁面即時篩選卡片語言版本（日版/中文版/英文版），同時支援模糊卡名搜尋。

### 依賴
- `types/index.ts` — 新增 `language` 欄位
- `data/mockData.ts` — 更新 mock 卡牌數據
- `HomeScreen.tsx` — 加入 version chips + debounced search
- Firebase Function `searchCards` — Firestore full-text search

---

### File Changes

#### 1. `src/types/index.ts`（修改）

新增 `language` 欄位到 `PokemonCard` interface：

```typescript
export type CardLanguage = 'Japanese' | 'English' | 'Chinese' | 'Multilingual';

// PokemonCard 新增:
language?: CardLanguage;   // 預設: 'English'
```

#### 2. `src/components/search/SearchBar.tsx`（新增）

Debounced search + version chips component：

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { getFunctions, httpsCallable } from 'firebase/functions';

type VersionFilter = '全部' | '日版' | '中文版' | '英文版';

const VERSION_MAP: Record<VersionFilter, string | null> = {
  '全部': null,
  '日版': 'Japanese',
  '中文版': 'Chinese',
  '英文版': 'English',
};

interface Props {
  onResults: (cards: PokemonCard[]) => void;
  placeholder?: string;
}

const SearchBar: React.FC<Props> = ({ onResults, placeholder = '搜尋卡名、Series、Rarity...' }) => {
  const [query, setQuery] = useState('');
  const [activeVersion, setActiveVersion] = useState<VersionFilter>('全部');
  const [loading, setLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const doSearch = useCallback(async (q: string, lang: string | null) => {
    if (!q.trim()) {
      onResults([]);
      return;
    }
    setLoading(true);
    try {
      const searchCards = httpsCallable(getFunctions(), 'searchCards');
      const result = await searchCards({ query: q, language: lang });
      onResults((result.data as any).cards ?? []);
    } catch (err) {
      console.error('searchCards error:', err);
    } finally {
      setLoading(false);
    }
  }, [onResults]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      doSearch(query, VERSION_MAP[activeVersion]);
    }, 400); // 400ms debounce
    setDebounceTimer(timer);
    return () => clearTimeout(timer);
  }, [query, activeVersion]);

  const versions: VersionFilter[] = ['全部', '日版', '中文版', '英文版'];

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor="#6666AA"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading && <ActivityIndicator size="small" color="#FF3C3C" style={{ marginRight: 8 }} />}
        {query.length > 0 && !loading && (
          <TouchableOpacity onPress={() => setQuery('')} style={{ marginRight: 8 }}>
            <Text style={{ color: '#8888AA', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Version Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.versionRow}
      >
        {versions.map(v => (
          <TouchableOpacity
            key={v}
            style={[
              styles.versionChip,
              activeVersion === v && styles.versionChipActive,
            ]}
            onPress={() => setActiveVersion(v)}
          >
            <Text style={[
              styles.versionText,
              activeVersion === v && styles.versionTextActive,
            ]}>
              {v === '全部' ? '🌐 ' + v : v}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1E2E', borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: '#2A2A3E',
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: {
    flex: 1, color: '#FFFFFF', fontSize: 14,
    paddingVertical: 13,
  },
  versionRow: {
    flexDirection: 'row', paddingTop: 10, gap: 8,
  },
  versionChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#2A2A3E',
  },
  versionChipActive: {
    backgroundColor: '#FFD700', borderColor: '#FFD700',
  },
  versionText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  versionTextActive: { color: '#12121F' },
});

export default SearchBar;
```

#### 3. `src/screens/HomeScreen.tsx`（修改）

將現有 search section 替換為 `<SearchBar>`，並將 series filter 改為与 version filter 共存。

具體改動：
1. 移除 `import TextInput`（由 SearchBar 替代）
2. 移除內聯 search input + version filter JSX
3. 在 `<View style={styles.searchWrap}>` 位置插入 `<SearchBar onResults={setSearchResults} />`
4. 將 `filtered` 改為使用 `searchResults ?? MOCK_CARDS`
5. 新增 `searchResults` state + `setSearchResults` handler

#### 4. `functions/index.js`（新增 function）

在 `functions/index.js` 尾段加入：

```javascript
// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1 — Version Search
// ─────────────────────────────────────────────────────────────────────────────

exports.searchCards = v2.https.onCall(async (data, context) => {
  const { query, language } = data;

  if (!query || query.trim().length < 1) {
    return { cards: [], total: 0 };
  }

  // Build Firestore query on cards collection
  let q = db.collection('cards')
    .where('name', '>=', query.trim())
    .where('name', '<=', query.trim() + '\uf8ff')
    .limit(30);

  const snapshot = await q.get();

  let cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // Filter by language if specified
  if (language) {
    cards = cards.filter(c => c.language === language);
  }

  return {
    cards: cards.map(c => ({
      id: c.id,
      name: c.name,
      set: c.set,
      setCode: c.setCode,
      rarity: c.rarity,
      price: c.price,
      priceChange24h: c.priceChange24h ?? 0,
      imageUrl: c.imageUrl,
      series: c.series,
      number: c.number,
      condition: c.condition,
      listed: c.listed ?? true,
      listingCount: c.listingCount ?? 0,
      language: c.language ?? 'English',
    })),
    total: cards.length,
  };
});
```

#### 5. `data/mockData.ts`（修改）

在每張 mock card 加入 `language` 欄位：

```typescript
// 在 MOCK_CARDS 每個 item 加入:
language: 'Japanese' | 'English' | 'Chinese' | 'Multilingual' // 隨機分布
```

---

### Test Plan — Feature 1
1. 在 HomeScreen 輸入 "Charizard"，日版 filter → 只能顯示日版卡
2. 輸入 "VMAX"，全部 → 顯示所有版本
3. Debounce：快速打字時只應該有 1 次 API call
4. 空搜索 → 顯示全部 / 回覆 "無結果"
5. Firebase `firebase deploy --only functions` → 確認無 deployment error

---

## Feature 2: Card Quality Review

### Overview
掛牌時自動引導用戶上傳卡牌相片，通過 PSA/BGS 證書或社群投票機制進行品相審核。

### Flow
```
SellScreen → 選擇卡牌 → 填寫品相自評 → 📸 上傳相片（正面+背面）
  → 有證書？上傳 PSA/BGS 證書 → 直接掛牌（顯示「已驗證」badge）
  → 無證書？提交審核 → 顯示「評審中」badge
    → 3 名已認證用戶投票
    → majority grade → 掛牌上線
```

### File Changes

#### 1. `src/types/index.ts`（修改）

```typescript
// Review 相關 types
export interface CardReview {
  id: string;
  listingId: string;
  cardId: string;
  sellerId: string;
  selfGrade: CardCondition;
  photos: string[];         // Storage URLs
  hasCertificate: boolean;
  certificateUrl?: string;
  certificateGrade?: number; // PSA/BGS grade
  status: 'pending' | 'approved' | 'rejected';
  communityVotes?: ReviewVote[];
  finalGrade?: CardCondition;
  createdAt: number;
}

export interface ReviewVote {
  oderId: string;
  oderName: string;
  grade: CardCondition;
  votedAt: number;
}

// Listing 新增欄位
export interface Listing {
  // ...existing fields...
  reviewId?: string;
  isVerified?: boolean;
  verifiedGrade?: CardCondition;
}
```

#### 2. `src/screens/review/ReviewSubmitScreen.tsx`（新增）

掛牌時的品相審核提交 flow：

```typescript
import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Image, Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const CONDITIONS: CardCondition[] = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Fair', 'Poor'];

interface Props {
  card: PokemonCard;
  onSubmitted: (reviewId: string) => void;
}

const ReviewSubmitScreen: React.FC<Props> = ({ card, onSubmitted }) => {
  const [selfGrade, setSelfGrade] = useState<CardCondition>('Near Mint');
  const [photos, setPhotos] = useState<string[]>([]);
  const [hasCert, setHasCert] = useState(false);
  const [certGrade, setCertGrade] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
    if (result.assets?.[0]?.uri) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const uploadPhoto = async (uri: string, reviewId: string): Promise<string> => {
    const storage = getStorage();
    const photoRef = ref(storage, `reviews/${reviewId}/${photos.indexOf(uri)}.jpg`);
    const resp = await fetch(uri);
    const blob = await resp.arrayBuffer();
    await uploadBytes(photoRef, blob);
    return `reviews/${reviewId}/${photos.indexOf(uri)}.jpg`;
  };

  const submit = async () => {
    if (photos.length < 2) {
      Alert.alert('請上傳至少兩張照片（正面 + 背面）');
      return;
    }
    setSubmitting(true);
    try {
      const submitReview = httpsCallable(getFunctions(), 'submitForReview');
      const result = await submitReview({
        cardId: card.id,
        selfGrade,
        hasCertificate: hasCert,
        certificateGrade: hasCert ? parseInt(certGrade) : null,
      });
      const reviewId = result.data.reviewId;

      // Upload photos
      await Promise.all(photos.map(uri => uploadPhoto(uri, reviewId)));

      onSubmitted(reviewId);
    } catch (err) {
      Alert.alert('提交失敗，請稍後再試');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>📋 品相審核</Text>
      <Text style={styles.subtitle}>上傳卡牌相片，確保買家看到真實品相</Text>

      {/* Self Grade */}
      <Text style={styles.label}>你自己評估</Text>
      <View style={styles.conditionRow}>
        {CONDITIONS.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.conditionChip, selfGrade === c && styles.conditionChipActive]}
            onPress={() => setSelfGrade(c)}
          >
            <Text style={[styles.conditionText, selfGrade === c && styles.conditionTextActive]}>
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Photos */}
      <Text style={styles.label}>卡牌相片（正反面）</Text>
      <View style={styles.photoRow}>
        {photos.map((uri, i) => (
          <Image key={i} source={{ uri }} style={styles.photoThumb} />
        ))}
        {photos.length < 4 && (
          <TouchableOpacity style={styles.photoAdd} onPress={pickImage}>
            <Text style={styles.photoAddText}>+ 📷</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Certificate */}
      <TouchableOpacity
        style={styles.certToggle}
        onPress={() => setHasCert(!hasCert)}
      >
        <Text style={styles.certToggleText}>
          {hasCert ? '☑️' : '⬜'} 我有 PSA/BGS 證書
        </Text>
      </TouchableOpacity>
      {hasCert && (
        <TextInput
          style={styles.certInput}
          placeholder="輸入 PSA/BGS 等級（如：9, 10）"
          placeholderTextColor="#6666AA"
          keyboardType="number-pad"
          value={certGrade}
          onChangeText={setCertGrade}
        />
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={submitting}
      >
        <Text style={styles.submitBtnText}>
          {submitting ? '提交中...' : '提交審核'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F', padding: 16 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: 20 },
  subtitle: { color: '#8888AA', fontSize: 13, marginTop: 6, marginBottom: 24 },
  label: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginBottom: 10 },
  conditionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  conditionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#1E1E2E', borderWidth: 1, borderColor: '#2A2A3E',
  },
  conditionChipActive: { backgroundColor: '#FFD700', borderColor: '#FFD700' },
  conditionText: { color: '#8888AA', fontSize: 12, fontWeight: '600' },
  conditionTextActive: { color: '#12121F' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  photoThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#2A2A3E' },
  photoAdd: {
    width: 80, height: 80, borderRadius: 10, backgroundColor: '#1E1E2E',
    borderWidth: 1, borderColor: '#2A2A3E', alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: 24, color: '#6666AA' },
  certToggle: { marginBottom: 12 },
  certToggleText: { color: '#FFFFFF', fontSize: 14 },
  certInput: {
    backgroundColor: '#1E1E2E', borderRadius: 10, paddingHorizontal: 14,
    color: '#FFFFFF', fontSize: 14, paddingVertical: 12, marginBottom: 24,
    borderWidth: 1, borderColor: '#2A2A3E',
  },
  submitBtn: {
    backgroundColor: '#FFD700', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 40,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#12121F', fontSize: 16, fontWeight: '700' },
});

export default ReviewSubmitScreen;
```

#### 3. `src/screens/SellScreen.tsx`（修改）

在掛牌流程的「選擇卡牌 + 填價格」之後，加入：

```typescript
// 在現有 sell flow 中，確認掛牌前：
// 如果 card.listingCount > 5（高需求卡），跳過審核直接掛牌
// 否則導向 ReviewSubmitScreen

import ReviewSubmitScreen from './review/ReviewSubmitScreen';

// 在 SellScreen 的 flow 中：
// card.condition === 'Unlisted' && card.price > 500
//   ? navigation.navigate('ReviewSubmit', { card, onSubmitted: (reviewId) => {
//       // 提交成功，顯示「審核中」badge
//     }})
//   : 直接掛牌
```

#### 4. `src/components/ReviewBadge.tsx`（新增）

展示品相審核狀態的 badge：

```typescript
const ReviewBadge: React.FC<{ status: 'pending' | 'approved' | 'rejected'; grade?: string }> = ({ status, grade }) => {
  const config = {
    pending: { icon: '⏳', label: '評審中', bg: 'rgba(255,184,0,0.15)', color: '#FFB800' },
    approved: { icon: '✅', label: grade ? `已驗證 ${grade}` : '已驗證', bg: 'rgba(0,200,100,0.15)', color: '#00C864' },
    rejected: { icon: '❌', label: '品相不符', bg: 'rgba(255,60,60,0.15)', color: '#FF3C3C' },
  };
  const c = config[status];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.color, fontSize: 11, fontWeight: '700' }}>
        {c.icon} {c.label}
      </Text>
    </View>
  );
};
```

#### 5. `functions/index.js`（新增 functions）

```javascript
// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2 — Card Quality Review
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a card for community review
 * Input: { cardId, selfGrade, hasCertificate, certificateGrade }
 * Output: { reviewId }
 */
exports.submitForReview = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('unauthenticated');

  const { cardId, selfGrade, hasCertificate, certificateGrade } = data;

  const reviewRef = db.collection('reviews').doc();
  await reviewRef.set({
    id: reviewRef.id,
    cardId,
    sellerId: context.auth.uid,
    selfGrade,
    photos: [], // URLs populated via separate upload
    hasCertificate: hasCertificate || false,
    certificateGrade: certificateGrade || null,
    status: hasCertificate ? 'approved' : 'pending',
    finalGrade: hasCertificate ? selfGrade : null,
    createdAt: Date.now(),
    votesRequired: 3,
    votesReceived: 0,
  });

  // If has certificate, auto-approve and update listing
  if (hasCertificate && certificateGrade) {
    await db.collection('listings').doc(cardId).update({
      isVerified: true,
      verifiedGrade: certificateGrade,
      reviewId: reviewRef.id,
    });
  }

  return { reviewId: reviewRef.id };
});

/**
 * Cast a review vote (community review)
 * Input: { reviewId, grade }
 */
exports.castReviewVote = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('unauthenticated');
  const { reviewId, grade } = data;

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.data()?.isVerifiedReviewer) {
    throw new Error('not_authorized');
  }

  // Add vote subcollection
  await db.collection('reviews').doc(reviewId)
    .collection('votes').add({
      oderId: context.auth.uid,
      oderName: userDoc.data().displayName,
      grade,
      votedAt: Date.now(),
    });

  // Update vote count
  const reviewRef = db.collection('reviews').doc(reviewId);
  const review = await reviewRef.get();
  const votesReceived = (review.data()?.votesReceived ?? 0) + 1;
  await reviewRef.update({ votesReceived });

  // Check majority
  if (votesReceived >= 3) {
    const votesSnapshot = await reviewRef.collection('votes').get();
    const gradeCount = {};
    votesSnapshot.docs.forEach(v => {
      const g = v.data().grade;
      gradeCount[g] = (gradeCount[g] ?? 0) + 1;
    });
    const finalGrade = Object.entries(gradeCount).sort((a, b) => b[1] - a[1])[0][0];
    await reviewRef.update({ status: 'approved', finalGrade });

    // Update associated listing
    const reviewData = review.data();
    await db.collection('listings').doc(reviewData.cardId).update({
      isVerified: true,
      verifiedGrade: finalGrade,
      reviewId,
    });
  }

  return { success: true, votesReceived };
});

/**
 * Get review status
 * Input: { reviewId }
 */
exports.getReviewResult = v2.https.onCall(async (data, context) => {
  const { reviewId } = data;
  const review = await db.collection('reviews').doc(reviewId).get();
  if (!review.exists) throw new Error('not_found');
  return { ...review.data(), id: review.id };
});
```

---

### Firestore Schema — Feature 2

```
reviews/{reviewId}
  - id: string
  - cardId: string
  - sellerId: string
  - selfGrade: CardCondition
  - photos: string[]
  - hasCertificate: boolean
  - certificateGrade: number | null
  - status: 'pending' | 'approved' | 'rejected'
  - finalGrade: CardCondition | null
  - createdAt: number
  - votesRequired: 3
  - votesReceived: number

reviews/{reviewId}/votes/{voteId}
  - oderId: string
  - oderName: string
  - grade: CardCondition
  - votedAt: number
```

---

### Test Plan — Feature 2
1. 掛牌流程中，選擇高價值卡 → 進入 ReviewSubmitScreen
2. 上傳 2 張相片 → 提交 → Firestore 出現 review document
3. 以「已驗證審核者」身份 call `castReviewVote` 3次 → `status: approved`
4. Listing card 出現 ✅ 已驗證 badge

---

## Feature 3: DM Chat

### Overview
買家與賣家在報價/交易前可以直接私傾，促進溝通、減少誤解。

### File Changes

#### 1. `src/types/chat.ts`（新增）

```typescript
export interface ChatThread {
  id: string;
  listingId?: string;
  parties: string[];          // user IDs
  lastMessage?: string;
  lastMessageAt: number;
  unreadCount: Record<string, number>; // uid → count
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  readBy: string[];
  type: 'text' | 'system';    // system = e.g. "offer accepted"
}
```

#### 2. `src/screens/chat/ChatListScreen.tsx`（新增）

```typescript
import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ChatThread } from '../../types/chat';

const ChatListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [threads, setThreads] = useState<ChatThread[]>([]);

  useEffect(() => {
    // Real-time listener for current user's threads
    const q = query(
      db.collection('chat_threads')
        .where('parties', 'array-contains', 'CURRENT_USER_ID'), // Replace with actual uid
      orderBy('lastMessageAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setThreads(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatThread)));
    });
    return () => unsub();
  }, []);

  const renderThread = ({ item }: { item: ChatThread }) => {
    const otherParty = item.parties[0]; // simplified
    return (
      <TouchableOpacity
        style={styles.threadItem}
        onPress={() => navigation.navigate('ChatDetail', { threadId: item.id })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>💬</Text>
        </View>
        <View style={styles.threadContent}>
          <View style={styles.threadHeader}>
            <Text style={styles.threadName}>{item.listingId ? '📦 交易對話' : '💬 私訊'}</Text>
            <Text style={styles.threadTime}>
              {new Date(item.lastMessageAt).toLocaleDateString('zh-HK')}
            </Text>
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage ?? '尚無訊息'}
          </Text>
        </View>
        {Object.values(item.unreadCount ?? {}).reduce((a, b) => a + b, 0) > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>
              {Object.values(item.unreadCount).reduce((a, b) => a + b, 0)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💬 我的訊息</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={item => item.id}
        renderItem={renderThread}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>尚無訊息</Text>
            <Text style={styles.emptySub}>開始與賣家傾偈吧！</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '800' },
  threadItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E1E2E',
  },
  avatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#1E1E2E',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 24 },
  threadContent: { flex: 1 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  threadName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  threadTime: { color: '#6666AA', fontSize: 11 },
  lastMessage: { color: '#8888AA', fontSize: 13 },
  unreadBadge: {
    backgroundColor: '#FF3C3C', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 100 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#6666AA', fontSize: 13, marginTop: 8 },
});

export default ChatListScreen;
```

#### 3. `src/screens/chat/ChatDetailScreen.tsx`（新增）

```typescript
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import {
  onSnapshot, addDoc, collection, query, orderBy,
  updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import { ChatMessage } from '../../types/chat';

interface Props {
  route: { params: { threadId: string; otherPartyName?: string } };
}

const CURRENT_USER_ID = 'CURRENT_USER_ID'; // Replace with auth context

const ChatDetailScreen: React.FC<Props> = ({ route }) => {
  const { threadId } = route.params;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const q = query(
      db.collection('chat_messages').doc(threadId)
        .collection('messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)));
    });
    return () => unsub();
  }, [threadId]);

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    await addDoc(
      db.collection('chat_messages').doc(threadId).collection('messages'),
      {
        senderId: CURRENT_USER_ID,
        senderName: '我',
        text,
        createdAt: Date.now(),
        readBy: [CURRENT_USER_ID],
        type: 'text',
      }
    );

    // Update thread lastMessage
    await updateDoc(db.collection('chat_threads').doc(threadId), {
      lastMessage: text,
      lastMessageAt: Date.now(),
    });
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderId === CURRENT_USER_ID;
    return (
      <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleOther]}>
        {!isMe && <Text style={styles.msgSender}>{item.senderName}</Text>}
        <Text style={[styles.msgText, isMe ? styles.msgTextMe : styles.msgTextOther]}>
          {item.text}
        </Text>
        <Text style={[styles.msgTime, isMe ? styles.msgTimeMe : styles.msgTimeOther]}>
          {new Date(item.createdAt).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Text style={{ color: '#6666AA', fontSize: 14 }}>開始新對話吧！</Text>
          </View>
        }
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="輸入訊息..."
          placeholderTextColor="#6666AA"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12121F' },
  msgBubble: { maxWidth: '75%', borderRadius: 16, padding: 12, marginBottom: 8 },
  msgBubbleMe: { alignSelf: 'flex-end', backgroundColor: '#FF3C3C' },
  msgBubbleOther: { alignSelf: 'flex-start', backgroundColor: '#1E1E2E' },
  msgSender: { color: '#6666AA', fontSize: 10, marginBottom: 4 },
  msgText: { fontSize: 14 },
  msgTextMe: { color: '#FFFFFF' },
  msgTextOther: { color: '#FFFFFF' },
  msgTime: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMe: { color: 'rgba(255,255,255,0.6)' },
  msgTimeOther: { color: '#6666AA' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    borderTopWidth: 1, borderTopColor: '#1E1E2E',
    backgroundColor: '#12121F',
  },
  input: {
    flex: 1, backgroundColor: '#1E1E2E', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, color: '#FFFFFF',
    fontSize: 14, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF3C3C',
    alignItems: 'center', justifyContent: 'center', marginLeft: 10,
  },
  sendBtnText: { color: '#FFFFFF', fontSize: 20 },
});

export default ChatDetailScreen;
```

#### 4. `src/screens/trade/OfferDetailScreen.tsx`（修改）

在 offer 詳情頁加入「聯絡賣家」按鈕，開啟 DM：

```typescript
// 加入 chat button
<TouchableOpacity
  style={styles.chatBtn}
  onPress={() => {
    const createChatThread = httpsCallable(getFunctions(), 'createChatThread');
    createChatThread({ listingId: offer.listingId, parties: [buyerId, sellerId] })
      .then(r => navigation.navigate('ChatDetail', { threadId: r.data.threadId }));
  }}
>
  <Text style={styles.chatBtnText}>💬 聯絡 {isSeller ? '買家' : '賣家'}</Text>
</TouchableOpacity>
```

#### 5. `App.tsx`（修改）

```typescript
import ChatListScreen from './src/screens/chat/ChatListScreen';
import ChatDetailScreen from './src/screens/chat/ChatDetailScreen';

// Stack.Navigator 加入:
<Stack.Screen name="ChatList" component={ChatListScreen} options={{ headerShown: true, headerTitle: '我的訊息' }} />
<Stack.Screen name="ChatDetail" component={ChatDetailScreen} options={{ headerShown: true, headerTitle: '對話' }} />

// TabBar 加入 chat tab:
<Tab.Screen
  name="ChatTab"
  component={ChatListScreen}
  options={{
    tabBarIcon: ({ focused }) => (
      <TabIcon icon="💬" focused={focused} label="訊息" />
    ),
  }}
/>
```

#### 6. `functions/index.js`（新增 functions）

```javascript
// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3 — DM Chat
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create or resume a chat thread between buyer and seller
 * Input: { listingId?, parties: [uid1, uid2] }
 * Output: { threadId }
 */
exports.createChatThread = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('unauthenticated');
  const { listingId, parties } = data;

  // Check if thread already exists for these parties + listing
  let existingQ;
  if (listingId) {
    existingQ = await db.collection('chat_threads')
      .where('listingId', '==', listingId)
      .where('parties', '==', parties.sort())
      .limit(1).get();
  } else {
    existingQ = await db.collection('chat_threads')
      .where('parties', '==', parties.sort())
      .where('listingId', '==', null)
      .limit(1).get();
  }

  if (!existingQ.empty) {
    return { threadId: existingQ.docs[0].id };
  }

  // Create new thread
  const threadRef = db.collection('chat_threads').doc();
  await threadRef.set({
    id: threadRef.id,
    listingId: listingId ?? null,
    parties: parties.sort(),
    lastMessage: null,
    lastMessageAt: Date.now(),
    unreadCount: Object.fromEntries(parties.map(p => [p, 0])),
    createdAt: Date.now(),
  });

  return { threadId: threadRef.id };
});

/**
 * Send a message in a thread
 * Input: { threadId, text }
 * Output: { messageId }
 */
exports.sendMessage = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('unauthenticated');
  const { threadId, text } = data;

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userName = userDoc.data()?.displayName ?? '未知用戶';

  const msgRef = db.collection('chat_messages').doc(threadId)
    .collection('messages').doc();

  await msgRef.set({
    id: msgRef.id,
    senderId: context.auth.uid,
    senderName: userName,
    text: text.trim(),
    createdAt: Date.now(),
    readBy: [context.auth.uid],
    type: 'text',
  });

  // Update thread metadata
  const thread = await db.collection('chat_threads').doc(threadId).get();
  const parties = thread.data()?.parties ?? [];
  const newUnread = { ...(thread.data()?.unreadCount ?? {}) };
  parties.forEach(p => {
    if (p !== context.auth.uid) newUnread[p] = (newUnread[p] ?? 0) + 1;
  });

  await db.collection('chat_threads').doc(threadId).update({
    lastMessage: text.trim(),
    lastMessageAt: Date.now(),
    unreadCount: newUnread,
  });

  return { messageId: msgRef.id };
});

/**
 * Mark messages as read
 * Input: { threadId }
 */
exports.markThreadRead = v2.https.onCall(async (data, context) => {
  if (!context.auth) throw new Error('unauthenticated');
  const { threadId } = data;

  const threadRef = db.collection('chat_threads').doc(threadId);
  const updateObj = {};
  updateObj[`unreadCount.${context.auth.uid}`] = 0;
  await threadRef.update(updateObj);

  return { success: true };
});
```

---

### Firestore Schema — Feature 3

```
chat_threads/{threadId}
  - id: string
  - listingId: string | null
  - parties: string[] (sorted)
  - lastMessage: string | null
  - lastMessageAt: number
  - unreadCount: Record<string, number>
  - createdAt: number

chat_messages/{threadId}/messages/{messageId}
  - id: string
  - senderId: string
  - senderName: string
  - text: string
  - createdAt: number
  - readBy: string[]
  - type: 'text' | 'system'
```

---

### Test Plan — Feature 3
1. `createChatThread` → 檢查 Firestore 出現 `chat_threads` document
2. `sendMessage` → 檢查 `chat_messages/{threadId}/messages` 出現記錄
3. `markThreadRead` → `unreadCount.{uid}` 歸零
4. ChatListScreen → 實时更新新訊息
5. Tab bar 💬 出現 notification badge

---

## Technical Considerations

### Firestore Security Rules

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Chat threads: only parties can read/write
    match /chat_threads/{threadId} {
      allow read, write: if request.auth.uid in resource.data.parties;
    }
    match /chat_messages/{threadId}/messages/{msgId} {
      allow read: if request.auth.uid in get(/databases/$(database)/documents/chat_threads/$(threadId)).data.parties;
      allow create: if request.auth.uid in get(/databases/$(database)/documents/chat_threads/$(threadId)).data.parties;
    }

    // Reviews: public read, writer = seller or verified reviewer
    match /reviews/{reviewId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth.uid == resource.data.sellerId
        || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isVerifiedReviewer == true;
      match /votes/{voteId} {
        allow create: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isVerifiedReviewer == true;
      }
    }
  }
}
```

### Migration Plan（現有數據）

- `PokemonCard.language` → 預設值 `'English'`（向後兼容）
- `Listing.reviewId` → 可選欄位，舊掛牌預設 `null`
- 舊掛牌冇 `isVerified` badge → 視為「未審核」

### Dependencies

| 套件 | 用途 | 安裝 |
|------|------|------|
| `react-native-image-picker` | 卡牌相片上傳 | `npm install react-native-image-picker` |
| `react-native-reanimated` | Micro-interactions | `npm install react-native-reanimated` |

---

## Rollout Order

```
Phase 1 (Day 1-2):   Feature 1 — Version Search
Phase 2 (Day 3-5):   Feature 2 — Card Quality Review
Phase 3 (Day 6-8):   Feature 3 — DM Chat
Phase 4 (Day 9-10):  UI 優化整合
```