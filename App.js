import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { Platform, View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight subpaths, not the package barrel. The barrel's index re-exports
// every weight and italic, so importing from it bundles all 18 faces of each
// family — 37 ttf assets for the six we actually use.
import { BarlowSemiCondensed_500Medium }   from '@expo-google-fonts/barlow-semi-condensed/500Medium';
import { BarlowSemiCondensed_600SemiBold } from '@expo-google-fonts/barlow-semi-condensed/600SemiBold';
import { BarlowSemiCondensed_700Bold }     from '@expo-google-fonts/barlow-semi-condensed/700Bold';
import { Inter_400Regular }  from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium }   from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';

import { Colors } from './src/theme';
import { useAuth } from './src/hooks/useAuth';
import LoginScreen         from './src/screens/LoginScreen';
import SessionListScreen   from './src/screens/SessionListScreen';
import SessionEditorScreen from './src/screens/SessionEditorScreen';
import TrainingScreen      from './src/screens/TrainingScreen';
import SummaryScreen       from './src/screens/SummaryScreen';
import DashboardScreen     from './src/screens/DashboardScreen';
import MetricsScreen       from './src/screens/MetricsScreen';
import DevIconsScreen      from './src/screens/DevIconsScreen';
import YouScreen           from './src/screens/YouScreen';
import { TabBar } from './src/components/TabBar';

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
// Literal hex, not theme tokens, on purpose: the crash screen has to render
// even when the failure is in the theme module itself. Values track Colors.base
// and Colors.ember by hand.
const cs = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0F0F11', padding: 20, paddingTop: 60 },
  title:  { color: '#FF6B2B', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  msg:    { color: '#FFFFFF', fontSize: 15, marginBottom: 16, lineHeight: 22 },
  scroll: { flex: 1 },
  stack:  { color: '#888', fontSize: 11, fontFamily: 'monospace', lineHeight: 18 },
});

// Inject web-only CSS.
//
// The DSEG7 @font-face rule that used to live here (pointing at jsdelivr) is
// gone: the face is now bundled in assets/fonts and registered by `useFonts`
// below on every platform, web included. Two registrations of the same family
// name would race, and the whole point of vendoring it is that a countdown
// must not depend on the network.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  `;
  document.head.appendChild(style);
}

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// The four tabs. Everything reachable from here keeps the bar visible; the
// screens that are MODES — training, the summary you land on after it, the
// editor — are pushed over the top by the stack below, without it.
function Tabs() {
  return (
    <Tab.Navigator
      tabBar={props => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Colors.base },
      }}
    >
      <Tab.Screen name="Train" component={SessionListScreen} />
      <Tab.Screen name="Stats" component={DashboardScreen} />
      <Tab.Screen name="Body"  component={MetricsScreen} />
      <Tab.Screen name="You"   component={YouScreen} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.base, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.ember} size="large" />
      </View>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: Colors.base, flex: 1 },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Tabs" component={Tabs} />
      {/* Modes — pushed over the tab bar, not inside it. Training keeps the
          screen awake and owns the back button; wandering into the dashboard
          mid-set should not be one tap away. */}
      <Stack.Screen name="Training"      component={TrainingScreen} />
      <Stack.Screen name="Summary"       component={SummaryScreen} />
      <Stack.Screen name="SessionEditor" component={SessionEditorScreen} />
      {/* Linked from nowhere — long-press the "Kinetic" wordmark to reach it. */}
      <Stack.Screen name="DevIcons"      component={DevIconsScreen} />
    </Stack.Navigator>
  );
}

export default function App() {
  // Every face is bundled. The old build fetched DSEG7 from a CDN at runtime,
  // so a cold start with no signal rendered the system fallback in every timer
  // — in the one environment this app is designed for.
  const [fontsLoaded, fontError] = useFonts({
    DSEG7Classic: require('./assets/fonts/DSEG7Classic-Regular.ttf'),
    BarlowSemiCondensed_500Medium,
    BarlowSemiCondensed_600SemiBold,
    BarlowSemiCondensed_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // A font that fails to load must not brick the app: render anyway and let the
  // system faces stand in. Waiting forever on a face is worse than an ugly one.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.base, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.ember} size="large" />
      </View>
    );
  }

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
