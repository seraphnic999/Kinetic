import 'react-native-gesture-handler';
import React, { useCallback } from 'react';
import { Platform, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

import { Colors } from './src/theme';
import SessionListScreen   from './src/screens/SessionListScreen';
import SessionEditorScreen from './src/screens/SessionEditorScreen';
import TrainingScreen      from './src/screens/TrainingScreen';
import SummaryScreen       from './src/screens/SummaryScreen';

// Inject web-only CSS: prevent page scroll and register the DSEG7 font
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; }
    @font-face {
      font-family: 'DSEG7Classic';
      src: url('https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.woff2') format('woff2'),
           url('https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.ttf') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  `;
  document.head.appendChild(style);
}

const Stack = createStackNavigator();

export default function App() {
  // Load DSEG7 font for native (web uses CSS injection above)
  const [fontsLoaded] = useFonts(
    Platform.OS !== 'web'
      ? { 'DSEG7Classic': 'https://cdn.jsdelivr.net/npm/dseg/fonts/DSEG7-Classic/DSEG7Classic-Regular.ttf' }
      : {}
  );

  // On native wait for fonts; on web the CSS @font-face handles it
  if (Platform.OS !== 'web' && !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor={Colors.background} />
          <Stack.Navigator
            initialRouteName="SessionList"
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: Colors.background },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="SessionList"   component={SessionListScreen} />
            <Stack.Screen name="SessionEditor" component={SessionEditorScreen} />
            <Stack.Screen name="Training"      component={TrainingScreen} />
            <Stack.Screen name="Summary"       component={SummaryScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
