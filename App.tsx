import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import initFirebase from "./src/services/firebase";
import ErrorBoundary from "./src/components/ErrorBoundary";
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
import RegisterScreen from "./src/screens/auth/RegisterScreen";
import EditProfileScreen from "./src/screens/EditProfileScreen";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import type { RootStackParamList } from "./src/types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

initFirebase();

// NEW: Obsidian Gallery — tab bar with gold active state
const TabIcon: React.FC<{ icon: string; focused: boolean; label: string; badge?: number }> = ({
  icon, focused, label, badge,
}) => (
  <View style={{ alignItems: "center", justifyContent: "center" }}>
    <Text style={{ 
      fontSize: 22, 
      opacity: focused ? 1 : 0.4,
      // NEW: subtle scale on active
      transform: focused ? [{ scale: 1.05 }] : [],
    }}>
      {icon}
    </Text>
    {badge ? (
      <View style={{
        position: "absolute", top: -4, right: -8,
        backgroundColor: "#FF4060", borderRadius: 8,
        minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
        paddingHorizontal: 3,
        // NEW: ruby badge instead of red
      }}>
        <Text style={{ color: "#FFF", fontSize: 9, fontWeight: "700" }}>
          {badge > 99 ? "99+" : badge}
        </Text>
      </View>
    ) : null}
    <Text
      style={{
        fontSize: 9, fontWeight: "700",
        // NEW: gold active, tertiary inactive
        color: focused ? "#D4AF37" : "#4A4A70",
        marginTop: 2,
      }}
    >
      {label}
    </Text>
  </View>
);

const HomeTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      // NEW: Obsidian Gallery tab bar
      tabBarStyle: {
        backgroundColor: "#0E0E1A",  // surface background
        borderTopWidth: 1,
        borderTopColor: "#2A2A50",   // subtle border
        height: 80,
        paddingTop: 10,
        paddingBottom: 20,
      },
      tabBarShowLabel: false,
    }}
  >
    <Tab.Screen
      name="MarketTab"
      component={HomeScreen}
      options={{
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>🏠</Text>,
      }}
    />
    <Tab.Screen
      name="ChatTab"
      component={ChatListScreen}
      options={{
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>💬</Text>,
      }}
    />
    <Tab.Screen
      name="WalletTab"
      component={WalletScreen}
      options={{
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>💰</Text>,
      }}
    />
    <Tab.Screen
      name="PortfolioTab"
      component={PortfolioScreen}
      options={{
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>💼</Text>,
      }}
    />
    <Tab.Screen
      name="ProfileTab"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ focused }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>👤</Text>,
      }}
    />
  </Tab.Navigator>
);

const LoadingScreen = () => (
  <View style={styles.loading}>
    <ActivityIndicator size="large" color="#D4AF37" />
    <Text style={styles.loadingText}>PokeMarket</Text>
  </View>
);

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) return <LoadingScreen />;

  return (
    <AuthProvider>
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
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
  const initialRoute: keyof RootStackParamList =
    currentUser && !isAnonymous ? 'Main' : 'Login';

  return (
    <NavigationContainer>
      <Stack.Navigator
        key={currentUser?.uid ?? 'anon'}
        initialRouteName={initialRoute}
        screenOptions={{ animation: 'fade' }}
      >
        <Stack.Screen name="FeatureShowcase" component={FeatureShowcaseScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
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

const styles = StyleSheet.create({
  loading: {
    flex: 1, backgroundColor: "#080810",  // NEW: void background
    alignItems: "center", justifyContent: "center",
  },
  loadingText: {
    color: "#F0F0FF", fontSize: 24, fontWeight: "800",
    marginTop: 16, letterSpacing: -0.5,
  },
});