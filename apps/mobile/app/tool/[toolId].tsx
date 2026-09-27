import { Stack, router, useLocalSearchParams } from 'expo-router';

import { mobileTools } from '@/src/data/tools';
import { ToolSession } from '@/src/tools/ToolSession';

export default function ToolScreen() {
  const { toolId } = useLocalSearchParams<{ toolId: string }>();
  const tool = mobileTools.find((item) => item.id === toolId);

  return <><Stack.Screen options={{ headerShown: false }} /><ToolSession tool={tool} onBack={() => router.replace('/(tabs)/tools')} /></>;
}
