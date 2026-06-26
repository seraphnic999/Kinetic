import 'react-native-gesture-handler';
import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from './src/theme';
import SessionListScreen   from './src/screens/SessionListScreen';
import SessionEditorScreen from './src/screens/SessionEditorScreen';
import TrainingScreen      from './src/screens/TrainingScreen';
import SummaryScreen       from './src/screens/SummaryScreen';

const Stack = createStackNavigator();

// On web, flex:1 doesn't fill the viewport unless the root has an explicit height.
const rootStyle = {
  flex: 1,
  ...(Platform.OS === 'web' && { height: '100vh', overflow: 'hidden' }),
};

export default function App() {
  return (
    <GestureHandlerRootView style={rootStyle}>
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
