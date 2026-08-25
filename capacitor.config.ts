// PURPOSE: Configures Capacitor native Android app runtime, bundle identifier, and plugin settings.
/**
 * Capacitor Configuration File
 * Defines Android native package ID (com.mohdj.securevault), web dist directory, and plugin settings for CapacitorUpdater and Firebase Authentication.
 */

import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mohdj.securevault',
  appName: 'Keeguard',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,         // We control updates manually via updater.ts
      appReadyTimeout: 30000,    // 30s — generous timeout to account for slow first load
      resetWhenUpdate: false,    // Do NOT clear localStorage on update — breaks our OTA debug markers and session state        
    },
    FirebaseAuthentication: {
      // Required by @capacitor-firebase/authentication to enable native Google
      // Sign-In on Android. Without this config, the plugin cannot resolve the
      // correct OAuth client and returns "sign in failed, try again later".
      skipNativeAuth: false,
      providers: ['google.com'],
    },
  },
};

export default config;
