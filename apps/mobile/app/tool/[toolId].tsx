import { Stack, router, useLocalSearchParams } from 'expo-router';

import { mobileTools } from '@/src/data/tools';
import { ToolSession } from '@/src/tools/ToolSession';

export default function ToolScreen() {
  const { toolId, from } = useLocalSearchParams<{ toolId: string; from?: 'home' | 'tools' }>();
  const tool = mobileTools.find((item) => item.id === (toolId === 'text-to-image' ? 'text_to_image' : toolId));
  const backTarget = from === 'home' ? '/(tabs)' : '/(tabs)/tools';

  return <><Stack.Screen options={{ headerShown: false }} /><ToolSession tool={tool} onBack={() => router.replace(backTarget)} /></>;
}
