import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sauda.shopmanager',
  appName: 'Sauda',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
