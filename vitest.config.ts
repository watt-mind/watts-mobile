import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEV__: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Deterministic local calendar for every run: without a pinned zone every
    // local-date assertion silently depends on the developer's machine and
    // passes on a UTC CI runner while failing in Auckland. `TZ=<zone> vitest
    // run` (see the `test:tz` script) overrides it, and individual tests pin
    // their own zone via `withTimeZone` from `src/test/timezone.ts`.
    env: { TZ: process.env.TZ || 'UTC' },
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'expo-constants': path.resolve(__dirname, 'src/test/mocks/expo-constants.ts'),
      '@react-native-async-storage/async-storage': path.resolve(
        __dirname,
        'src/test/mocks/async-storage.ts',
      ),
      '@': path.resolve(__dirname, '.'),
    },
  },
});
