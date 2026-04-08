// Crypto shim for React Native (Hermes engine)
// Uses crypto-browserify for Node.js crypto API compatibility,
// augmented with expo-crypto for secure getRandomValues.
//
// NOTE: We use a relative path to resolve crypto-browserify from the
// workspace root node_modules. This avoids circular resolution through
// Metro's extraNodeModules.crypto alias (which points back to this file).
// The ../../node_modules/ prefix navigates from apps/demo/ to the workspace root.

const cryptoBrowserify = require('../../node_modules/crypto-browserify');
const ExpoCrypto = require('expo-crypto');

// Augment with native getRandomValues from expo-crypto
if (!cryptoBrowserify.getRandomValues) {
  cryptoBrowserify.getRandomValues = (typedArray) => {
    return ExpoCrypto.getRandomValues(typedArray);
  };
}

module.exports = cryptoBrowserify;
