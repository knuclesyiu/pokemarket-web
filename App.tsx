import React, { useEffect, useState, useSyncExternalStore } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import initFirebase from "./src/services/firebase";
import { sellerOnboardingRequested } from "./src/services/returnPath";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { FeedbackProvider } from "./src/components/Feedback";
import TabBarIcon from "./src/components/TabBarIcon";
import { useAppFonts } from "./src/hooks/useAppFonts";
import {
  C, FONT, R, SP, T, themed, subscribeTheme, getThemeSnapshot,
} from "./src/theme";
import HomeScreen from "./src/screens/HomeScreen";
import CardDetailScreen from "./src/screens/CardDetailScreen";
import PortfolioScreen from "./src/screens/PortfolioScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import FeatureShowcaseScreen from "./src/screens/FeatureShowcaseScreen";
import NotificationScreen from "./src/screens/NotificationScreen";
import WalletScreen from "./src/screens/WalletScreen";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import OrderStatusScreen from "./src/screens/OrderStatusScreen";
import SellScreen from "./src/screens/SellScreen";
import MakeOfferScreen from "./src/screens/trade/MakeOfferScreen";
import MyOffersScreen from "./src/screens/trade/MyOffersScreen";
import OfferDetailScreen from "./src/screens/trade/OfferDetailScreen";
import ChatListScreen from "./src/screens/chat/ChatListScreen";
import ChatDetailScreen from "./src/screens/chat/ChatDetailScreen";
import LoginScreen from "./src/screens/auth/LoginScreen";
import PublicInfoScreen from "./src/screens/PublicInfoScreen";
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import SellerOnboardingScreen from "./src/screens/SellerOnboardingScreen";
import SellerPayoutDetailsScreen from "./src/screens/SellerPayoutDetailsScreen";
import WithdrawScreen from "./src/screens/WithdrawScreen";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { AppearanceProvider } from "./src/contexts/AppearanceContext";
import { useAppearance } from "./src/contexts/AppearanceContext";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

initFirebase();

/**
 * The tab bar.
 *
 * The icons used to be emoji, which draw differently on every
 * platform and read as placeholders. `TabBarIcon` draws the same
 * vector on all of them, and carries the gold active state and the
 * ruby badge that were designed in the first version but never used.
 */
const HomeTabs = () => {
  // The tab bar is painted by the navigator, which does not re-render
  // when the account's preferences change. Reading them here makes the
  // bar follow the theme and the language like everything else.
  useAppearance();
  return (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: C.surface,
        borderTopWidth: 1,
        borderTopColor: C.border,
        height: 74,
        paddingTop: SP.sm,
        paddingBottom: SP.lg,
      },
      tabBarShowLabel: false,
    }}
  >
    <Tab.Screen
      name="MarketTab"
      component={HomeScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabBarIcon name="market" focused={focused} label="市場" />
        ),
      }}
    />
    <Tab.Screen
      name="ChatTab"
      component={ChatListScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabBarIcon name="chat" focused={focused} label="訊息" />
        ),
      }}
    />
    <Tab.Screen
      name="WalletTab"
      component={WalletScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabBarIcon name="wallet" focused={focused} label="錢包" />
        ),
      }}
    />
    <Tab.Screen
      name="PortfolioTab"
      component={PortfolioScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabBarIcon name="portfolio" focused={focused} label="收藏" />
        ),
      }}
    />
    <Tab.Screen
      name="ProfileTab"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabBarIcon name="profile" focused={focused} label="我的" />
        ),
      }}
    />
  </Tab.Navigator>
);
};

const LoadingScreen = () => (
  <View style={styles.loading}>
    <ActivityIndicator size="large" color="#D4AF37" />
    <Text style={styles.loadingText}>PokeMarket</Text>
  </View>
);

export default function App() {
  // The palette is an external store, so a change of theme re-renders
  // the app from the root — including the parts of it that sit above
  // the provider holding the account's preferences.
  useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
  const fontsReady = useAppFonts();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  // The fonts have to be in place before the first screen paints, or
  // the user sees the platform default for a moment and then the
  // real face — a visible jump on every cold start.
  if (!ready || !fontsReady) return <LoadingScreen />;

  // The feedback provider sits outside the navigator so its toast
  // layer is painted above every screen — React Navigation renders
  // each screen in its own layer, and anything inside it would be
  // covered by the next screen.
  return (
    <AuthProvider>
      <AppearanceProvider>
        <FeedbackProvider>
        <ErrorBoundary>
          <View style={styles.root}>
            <RootNavigator />
          </View>
        </ErrorBoundary>
        </FeedbackProvider>
      </AppearanceProvider>
    </AuthProvider>
  );
}

/**
 * RootNavigator — auth-aware stack.
 *
 * - Loading (auth state not yet known)            → LoadingScreen
 * - Signed in (real account, not anonymous)      → Main (MainTabs)
 * - Anonymous (auto-signed in by AuthContext)    → Login (with upgrade CTA in Profile)
 *
 * The "no anonymous MainTabs" rule: even though AuthContext auto-creates
 * an anonymous user on first launch, the app is still considered
 * "logged out" — the Login screen is shown. The user can browse via
 * anonymous uid in the background, but anything that writes to Firestore
 * (sell, checkout) must go through a real sign-in.
 *
 * FeatureShowcase stays as the very first route for cold launch demos.
 */
function RootNavigator() {
  const { loading, currentUser, isAnonymous, refreshSession } = useAuth();

  // On mount, force-refresh the ID token to catch external password
  // changes / revocations.
  useEffect(() => {
    refreshSession().catch(() => {});
  }, [refreshSession]);

  if (loading) return <LoadingScreen />;

  // Real signed-in user (email / phone / Google) → MainTabs
  // Anonymous user → Login (they can browse but must upgrade to trade)
  // Stripe sends the seller away to finish their account and sends
  // them back with `?sellerOnboarding=`. If they had to sign in on
  // the way back, the query may only have been restored now — so the
  // seller screen is the route the stack opens on. The stack remounts
  // when the signed-in user changes, so this is read again at the
  // moment the guest becomes the real account.
  const initialRoute: keyof RootStackParamList =
    currentUser && !isAnonymous
      ? sellerOnboardingRequested()
        ? 'SellerOnboarding'
        : 'Main'
      : 'Login';

  return (
    <NavigationContainer>
      <Stack.Navigator
        key={currentUser?.uid ?? 'anon'}
        initialRouteName={initialRoute}
        screenOptions={{ animation: 'fade' }}
      >
        <Stack.Screen name="FeatureShowcase" component={FeatureShowcaseScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PublicInfo" component={PublicInfoScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Main" component={HomeTabs} options={{ headerShown: false }} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="CardDetail"
          component={CardDetailScreen}
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderStatus" component={OrderStatusScreen} />
        <Stack.Screen name="Sell" component={SellScreen} />
        <Stack.Screen name="Notifications" component={NotificationScreen} />
        <Stack.Screen name="MakeOffer" component={MakeOfferScreen} />
        <Stack.Screen
          name="SellerOnboarding"
          component={SellerOnboardingScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Withdraw"
          component={WithdrawScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="MyOffers" component={MyOffersScreen} />
        <Stack.Screen name="OfferDetail" component={OfferDetailScreen} />
        <Stack.Screen
          name="ChatList"
          component={ChatListScreen}
          options={{ headerShown: true, headerTitle: "我的訊息", headerTintColor: "#F0F0FF", headerStyle: { backgroundColor: "#0E0E1A" }, headerBackTitle: "返回" }}
        />
        <Stack.Screen
          name="ChatDetail"
          component={ChatDetailScreen}
          options={{ headerShown: true, headerTitle: "對話", headerTintColor: "#F0F0FF", headerStyle: { backgroundColor: "#0E0E1A" }, headerBackTitle: "返回" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = themed((C) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.void,
    fontFamily: FONT.regular,
  },
  loading: {
    flex: 1,
    backgroundColor: C.void,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    ...T.title,
    color: C.text,
    marginTop: SP.lg,
  },
}));