import { Redirect } from 'expo-router';

import { useMobileAuth } from '@/src/auth/MobileAuthProvider';

export default function IndexRoute() {
  const { status } = useMobileAuth();
  if (status === 'loading') return null;
  return <Redirect href={status === 'signed_in' ? '/(tabs)' : '/sign-in'} />;
}
