import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { TextEncoder, TextDecoder } from 'text-encoding';

// Establish Polyfills BEFORE ANY OTHER IMPORTS
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// Polyfill for process (some libraries expect it)
const bProcess = require('process');
if (typeof global.process === 'undefined') {
  global.process = bProcess;
} else {
  for (const p in bProcess) {
    if (!(p in global.process)) {
      global.process[p] = bProcess[p];
    }
  }
}
// Ensure version exists (fixes TypeError Cannot read property slice of undefined)
if (!global.process.version) {
  global.process.version = 'v16.0.0';
}
