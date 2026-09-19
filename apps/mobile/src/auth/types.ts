export type MobileSaviUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  planId: 'free';
};

export type MobileAuthStatus = 'loading' | 'signed_out' | 'signed_in' | 'error';
