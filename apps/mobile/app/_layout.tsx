import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MobileAuthProvider } from '@/src/auth/MobileAuthProvider';
import { colors } from '@/src/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <MobileAuthProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tool/[toolId]" />
        </Stack>
      </MobileAuthProvider>
    </SafeAreaProvider>
  );
}
