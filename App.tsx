import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import HomeScreen from './src/screens/HomeScreen';
import CardDetailScreen from './src/screens/CardDetailScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import SellScreen from './src/screens/SellScreen';
import WalletScreen from './src/screens/WalletScreen';
import CheckoutScreen from './src/screens/CheckoutScreen';
import OrderStatusScreen from './src/screens/OrderStatusScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon: React.FC<{ icon: string; focused: boolean; label: string }> = ({ icon, focused, label }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.4 }}>{icon}</Text>
    <Text style={{
      fontSize: 9,
      fontWeight: '700',
      color: focused ? '#FF3C3C' : '#6666AA',
      marginTop: 2,
    }}>{label}</Text>
  </View>
);

const HomeTabs = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: '#1A1A2E',
        borderTopWidth: 1,
        borderTopColor: '#2A2A3E',
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
      options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} label="市場" /> }}
    />
    <Tab.Screen
      name="WalletTab"
      component={WalletScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💰" focused={focused} label="錢包" /> }}
    />
    <Tab.Screen
      name="PortfolioTab"
      component={PortfolioScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon icon="💼" focused={focused} label="收藏" /> }}
    />
    <Tab.Screen
      name="SellTab"
      component={SellScreen}
      options={{ tabBarIcon: ({ focused }) => <TabIcon icon="📦" focused={focused} label="放售" /> }}
    />
  </Tab.Navigator>
);

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#12121F' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Main" component={HomeTabs} />
        <Stack.Screen
          name="CardDetail"
          component={CardDetailScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Checkout"
          component={CheckoutScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="OrderStatus"
          component={OrderStatusScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
