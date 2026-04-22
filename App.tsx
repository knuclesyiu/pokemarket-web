import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import initFirebase from "./src/services/firebase";
import HomeScreen from "./src/screens/HomeScreen";
import CardDetailScreen from "./src/screens/CardDetailScreen";
import PortfolioScreen from "./src/screens/PortfolioScreen";
import SellScreen from "./src/screens/SellScreen";
import WalletScreen from "./src/screens/WalletScreen";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import OrderStatusScreen from "./src/screens/OrderStatusScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Initialize Firebase globally
initFirebase();

const TabIcon: React.FC<{ icon: string; focused: boolean; label: string }> = ({
  icon,
  focused,
  label,
}) => (
  <View style={{ alignItems: "center", justifyContent: "center" }}>
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
    <Text
      style={{
        fontSize: 9,
        fontWeight: "700",
        color: focused ? "#FF3C3C" : "#6666AA",
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
      tabBarStyle: {
        backgroundColor: "#1A1A2E",
        borderTopWidth: 1,
        borderTopColor: "#2A2A3E",
        height: 80,
        paddingTop: 10,
        paddingBottom: 20,
      },
      tabBarShowLabel: false,
    }}
  >
    <Tab.Screen
      name="HomeTab"
      component={HomeScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="🏠" focused={focused} label="市場" />
        ),
      }}
    />
    <Tab.Screen
      name="WalletTab"
      component={WalletScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="💰" focused={focused} label="錢包" />
        ),
      }}
    />
    <Tab.Screen
      name="PortfolioTab"
      component={PortfolioScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="💼" focused={focused} label="收藏" />
        ),
      }}
    />
    <Tab.Screen
      name="SellTab"
      component={SellScreen}
      options={{
        tabBarIcon: ({ focused }) => (
          <TabIcon icon="📦" focused={focused} label="放售" />
        ),
      }}
    />
  </Tab.Navigator>
);

const LoadingScreen = () => (
  <View style={styles.loading}>
    <ActivityIndicator size="large" color="#FF3C3C" />
    <Text style={styles.loadingText}>PokeMarket</Text>
  </View>
);

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Firebase initializes async, ready immediately after
    setReady(true);
  }, []);

  if (!ready) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#12121F" },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="Main" component={HomeTabs} />
        <Stack.Screen
          name="CardDetail"
          component={CardDetailScreen}
          options={{ animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="Checkout" component={CheckoutScreen} />
        <Stack.Screen name="OrderStatus" component={OrderStatusScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#12121F",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 16,
    letterSpacing: -0.5,
  },
});
