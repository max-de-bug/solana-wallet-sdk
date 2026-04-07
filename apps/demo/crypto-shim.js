const crypto = require('crypto-browserify');
const Crypto = require('expo-crypto');

// Add getRandomValues to the crypto-browserify object
if (!crypto.getRandomValues) {
  crypto.getRandomValues = (typedArray) => {
    return Crypto.getRandomValues(typedArray);
  };
}

module.exports = crypto;
