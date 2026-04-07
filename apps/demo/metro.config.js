const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Explicitly map workspace packages and polyfills
// This ensures Metro knows EXACTLY where they are and handles Node.js built-ins
config.resolver.extraNodeModules = {
  '@solana-wallet-sdk/react-native': path.resolve(workspaceRoot, 'packages/react-native'),
  '@solana-wallet-sdk/core': path.resolve(workspaceRoot, 'packages/core'),
  '@solana-wallet-sdk/ledger-adapter': path.resolve(workspaceRoot, 'packages/ledger-adapter'),
  '@solana-wallet-sdk/trezor-adapter': path.resolve(workspaceRoot, 'packages/trezor-adapter'),
  '@solana-wallet-sdk/keystone-adapter': path.resolve(workspaceRoot, 'packages/keystone-adapter'),
  '@solana-wallet-sdk/safepal-adapter': path.resolve(workspaceRoot, 'packages/safepal-adapter'),
  crypto: path.resolve(projectRoot, 'crypto-shim.js'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  events: require.resolve('events'),
  process: require.resolve('process/browser'),
};

module.exports = config;
