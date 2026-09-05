import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050711',
        panel: 'rgba(255,255,255,0.06)',
        line: 'rgba(255,255,255,0.12)',
        glowBlue: '#00d9ff',
        glowPurple: '#7c5cff'
      },
      boxShadow: {
        glow: '0 0 80px rgba(124, 92, 255, 0.22)',
        soft: '0 24px 90px rgba(0,0,0,0.45)'
      }
    }
  },
  plugins: []
};

export default config;
