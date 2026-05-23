import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? '';

  return {
    ...(config as ExpoConfig),
    extra: {
      ...config.extra,
      apiBaseUrl,
    },
  };
};
