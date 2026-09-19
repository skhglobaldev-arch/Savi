import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';

import { useMobileAuth } from '@/src/auth/MobileAuthProvider';
import { colors, typeScale } from '@/src/theme/tokens';

const iconForRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home-outline',
  ask: 'sparkles-outline',
  tools: 'grid-outline',
  library: 'folder-open-outline',
  account: 'person-circle-outline',
};

export default function TabLayout() {
  const { status } = useMobileAuth();
  if (status === 'loading') return null;
  if (status !== 'signed_in') return <Redirect href="/sign-in" />;
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, height: 84, paddingTop: 9, paddingBottom: 22 },
        tabBarLabelStyle: { fontSize: 10, fontFamily: typeScale.medium },
        tabBarIcon: ({ color, size, focused }) => <Ionicons name={iconForRoute[route.name]} color={color} size={focused ? size + 1 : size} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask SAVI' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
