// Prepares an Android release build on GitHub Actions, without EAS.
// 1. versionCode above anything EAS built, so the APK installs as an update.
// 2. Release signing with the same keystore EAS used (credentials.json), or Android refuses the update.
const fs = require('fs');
const path = require('path');

const step = process.argv[2];
const root = path.join(__dirname, '..');

if (step === 'version') {
  const run = Number(process.env.GITHUB_RUN_NUMBER || 0);
  const file = path.join(root, 'app.json');
  const app = JSON.parse(fs.readFileSync(file, 'utf8'));
  // The public repo's run numbers start again at 1; the base stays above every build of the old repo (up to 1129)
  app.expo.android.versionCode = 1200 + run;
  fs.writeFileSync(file, JSON.stringify(app, null, 2) + '\n');
  console.log('versionCode', app.expo.android.versionCode);
}

if (step === 'signing') {
  const creds = JSON.parse(fs.readFileSync(path.join(root, 'credentials.json'), 'utf8')).android.keystore;
  const store = path.join(root, creds.keystorePath);
  const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
  let g = fs.readFileSync(gradleFile, 'utf8');
  const release = `
        release {
            storeFile file('${store.replace(/\\/g, '/')}')
            storePassword '${creds.keystorePassword}'
            keyAlias '${creds.keyAlias}'
            keyPassword '${creds.keyPassword}'
        }`;
  if (!/signingConfigs\s*\{/.test(g)) throw new Error('signingConfigs block not found');
  g = g.replace(/signingConfigs\s*\{/, (m) => m + release);
  // The release build type signs with debug by default; point it at the release key
  const before = g;
  g = g.replace(/(release\s*\{[^{}]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
  if (g === before) throw new Error('release signingConfig line not found');
  fs.writeFileSync(gradleFile, g);
  console.log('release signing configured');
}
