const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
//    Project-local first, then workspace-root (where pnpm hoists deps)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Explicitly map workspace packages and Node.js built-in polyfills
//    All polyfill packages are hoisted to workspaceRoot/node_modules by pnpm
config.resolver.extraNodeModules = {
  // ── Workspace packages ──────────────────────────────────────────
  '@solana-wallet-sdk/react-native': path.resolve(workspaceRoot, 'packages/react-native'),
  '@solana-wallet-sdk/core': path.resolve(workspaceRoot, 'packages/core'),
  '@solana-wallet-sdk/ledger-adapter': path.resolve(workspaceRoot, 'packages/ledger-adapter'),
  '@solana-wallet-sdk/trezor-adapter': path.resolve(workspaceRoot, 'packages/trezor-adapter'),
  '@solana-wallet-sdk/keystone-adapter': path.resolve(workspaceRoot, 'packages/keystone-adapter'),
  '@solana-wallet-sdk/safepal-adapter': path.resolve(workspaceRoot, 'packages/safepal-adapter'),

  // ── Node.js built-in polyfills (resolved from workspace root) ───
  'crypto': path.resolve(projectRoot, 'crypto-shim.js'),
  'stream': path.resolve(workspaceRoot, 'node_modules/stream-browserify'),
  'buffer': path.resolve(workspaceRoot, 'node_modules/buffer'),
  'events': path.resolve(workspaceRoot, 'node_modules/events'),
  'process': path.resolve(workspaceRoot, 'node_modules/process/browser.js'),
};

module.exports = config;
