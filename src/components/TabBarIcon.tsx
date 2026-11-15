/**
 * Tab bar icons.
 *
 * The bar used emoji — 🏠 💬 💰 💼 👤 — which read as placeholders and
 * rendered differently on every platform, so the tab bar looked
 * different on Android, on iOS and in the browser. Vector icons draw
 * the same shape everywhere, and the outline/filled pair gives the
 * active tab a second signal beyond colour.
 *
 * The gold active state and the ruby badge were already designed in
 * `App.tsx` for a component that no screen used; this is that design,
 * made real.
 */
import React from 'react';
import { t } from '../i18n';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { C, T, themed } from '../theme';
import { useAppearance } from '../contexts/AppearanceContext';

export type TabIconName =
  | 'market'
  | 'chat'
  | 'wallet'
  | 'portfolio'
  | 'profile';

/** The filled name and the outline name for each tab. */
const ICONS: Record<TabIconName, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  market: { on: 'storefront', off: 'storefront-outline' },
  chat: { on: 'chatbubbles', off: 'chatbubbles-outline' },
  wallet: { on: 'wallet', off: 'wallet-outline' },
  portfolio: { on: 'albums', off: 'albums-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

interface Props {
  name: TabIconName;
  focused: boolean;
  label: string;
  badge?: number;
}

const TabBarIcon: React.FC<Props> = ({ name, focused, label, badge }) => {
  const { t } = useAppearance();
  const icon = ICONS[name];
  return (
    <View style={styles.wrap}>
      <View>
        <Ionicons
          name={focused ? icon.on : icon.off}
          size={24}
          color={focused ? C.gold : C.textDisabled}
        />
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {t(label)}
      </Text>
    </View>
  );
};

const styles = themed((C) => StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', width: 76 },
  label: {
    ...T.caption,
    fontSize: 10,
    color: C.textDisabled,
    marginTop: 3,
  },
  labelActive: { color: C.gold },
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    backgroundColor: C.ruby,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: C.surface,
  },
  badgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
}))

export default TabBarIcon;
