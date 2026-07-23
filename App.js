import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

import { Colors } from './src/theme';
import { useAuth } from './src/hooks/useAuth';
import LoginScreen         from './src/screens/LoginScreen';
import SessionListScreen   from './src/screens/SessionListScreen';
import SessionEditorScreen from './src/screens/SessionEditorScreen';
import TrainingScreen      from './src/screens/TrainingScreen';
import SummaryScreen       from './src/screens/SummaryScreen';
import DashboardScreen     from './src/screens/DashboardScreen';
import MetricsScreen       from './src/screens/MetricsScreen';

// ── Error boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { global.__KINETIC_CRASH__ = { name: e.name, message: e.message, stack: (e.stack ?? '').slice(0, 1200) }; }
  render() {
    const crash = this.state.error ? {
      name: this.state.error.name,
      message: this.state.error.message,
      stack: (this.state.error.stack ?? '').slice(0, 1200),
    } : global.__KINETIC_CRASH__;
    if (crash) return <CrashScreen crash={crash} />;
    return this.props.children;
  }
}

function CrashScreen({ crash }) {
  return (
    <View style={cs.root}>
      <Text style={cs.title}>💥 {crash.name}</Text>
      <Text style={cs.msg}>{crash.message}</Text>
      <ScrollView style={cs.scroll}>
        <Text style={cs.stack}>{crash.stack}</Text>
      </ScrollView>
    </View>
  );
}
const cs = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0D0D0D', padding: 20, paddingTop: 60 },
  title:  { color: '#FF6B2B', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  msg:    { color: '#FFFFFF', fontSize: 15, marginBottom: 16, lineHeight: 22 },
  scroll: { flex: 1 },
  stack:  { color: '#888', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
});

// Inject web-only CSS
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
    @font-face {
      font-family: 'DSEG7Classic';
      src: url('https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.woff2') format('woff2'),
           url('https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.ttf') format('truetype');
      font-weight: normal; font-style: normal;
    }
  `;
  document.head.appendChild(style);
}

const Stack = createStackNavigator();

function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator
      initialRouteName="SessionList"
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: Colors.background, flex: 1 },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="SessionList"   component={SessionListScreen} />
      <Stack.Screen name="SessionEditor" component={SessionEditorScreen} />
      <Stack.Screen name="Training"      component={TrainingScreen} />
      <Stack.Screen name="Summary"       component={SummaryScreen} />
      <Stack.Screen name="Dashboard"     component={DashboardScreen} />
      <Stack.Screen name="Metrics"       component={MetricsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts(
    Platform.OS !== 'web'
      ? { 'DSEG7Classic': 'https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.ttf' }
      : {}
  );

  if (Platform.OS !== 'web' && !fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider style={{ flex: 1 }}>
          <NavigationContainer>
            <StatusBar style="light" backgroundColor={Colors.background} />
            <AppNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
