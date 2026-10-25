// Metro for the Android app, unchanged. Only with NUDGE_DEMO=1 and the web platform, the
// phone-only modules are swapped for the stand-ins in web-demo/ (made-up data, no-op tasks).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.NUDGE_DEMO === '1') {
  const demo = (f) => path.join(__dirname, 'web-demo', f);
  const swap = {
    'react-native-health-connect': demo('healthConnect.ts'),
    'expo-notifications': demo('noop.ts'),
    'expo-location': demo('noop.ts'),
    'expo-task-manager': demo('noop.ts'),
    'expo-background-task': demo('noop.ts'),
    'expo-intent-launcher': demo('noop.ts'),
    'react-native-view-shot': demo('noop.ts'),
    'expo-file-system/legacy': demo('noop.ts'),
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'web') {
      if (swap[moduleName]) return { type: 'sourceFile', filePath: swap[moduleName] };
      if (/(^|\/)coach\/tasks$/.test(moduleName) || moduleName === './tasks' && context.originModulePath.includes(`${path.sep}coach${path.sep}`)) {
        return { type: 'sourceFile', filePath: demo('tasks.ts') };
      }
    }
    return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
