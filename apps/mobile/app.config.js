const path = require('path');

// Load expo-router plugin via Node.js native require.resolve, which traverses
// parent directories and finds the hoisted package in the monorepo root
// node_modules. This bypasses Expo CLI's resolveFrom which fails in some
// EAS monorepo setups.
let expoRouterPlugin;
try {
  const pluginPath = path.join(
    path.dirname(require.resolve('expo-router/package.json')),
    'app.plugin.js',
  );
  const mod = require(pluginPath);
  expoRouterPlugin = typeof mod === 'function' ? mod : mod.default;
} catch {
  expoRouterPlugin = 'expo-router';
}

module.exports = {
  expo: {
    name: 'WeatherTeam6',
    slug: 'weatherteam6',
    version: '0.0.0',
    scheme: 'weatherteam6',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.weatherteam6.app',
    },
    android: {
      package: 'com.weatherteam6.app',
      permissions: [
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      expoRouterPlugin,
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'WeatherTeam6 uses your location to find nearby crags and show local weather.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'f92067cc-1036-4c1c-95ab-d98b4e8d71ba',
      },
    },
  },
};
