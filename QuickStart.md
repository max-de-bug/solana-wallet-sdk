# QuickStart Guide: Solana Hardware Wallet SDK

This guide provides the fastest path to embedding the unified hardware wallet UI flow into a React Native application.

## 1. Installation

Install the core, hook logic, and only the hardware wallets you wish to support.

```bash
npm install \
  @solana-wallet-sdk/core \
  @solana-wallet-sdk/react-native \
  @solana-wallet-sdk/ledger-adapter \
  @solana-wallet-sdk/tangem-adapter
```

*(If you are testing locally in the repository workspace, you can skip this step since the monorepo packages are already linked.)*

## 2. Setting up the Provider

Hardware wallet adapters require one-time initialization, ideally inside a memoized hook near the root of your app lifecycle. 

```tsx
import React, { useMemo } from 'react';
import { View, Button, Text } from 'react-native';
import { useHardwareWallet, TransportMethod } from '@solana-wallet-sdk/react-native';

// Import the specific hardware wallet adapters
import { LedgerAdapter } from '@solana-wallet-sdk/ledger-adapter';
import { TangemAdapter } from '@solana-wallet-sdk/tangem-adapter';

// Create a Dummy transport factory if writing CLI testing scripts
// Or import the specific RN libraries (e.g., @ledgerhq/hw-transport-react-native-ble)
const myLedgerTransportCreator = { create: async () => { /* ... */ } };

export default function WalletConnectComponent() {
  // Initialize the specific adapters
  const adapters = useMemo(() => [
    new LedgerAdapter(myLedgerTransportCreator),
    new TangemAdapter({ scanOnConnect: true })
  ], []);

  // Hydrate the SDK state
  const { connect, disconnect, activeAdapter, publicKey, isConnecting, error } = useHardwareWallet({
    adapters,
    defaultDerivationPath: "m/44'/501'/0'/0'"
  });

  return (
    <View style={{ padding: 20 }}>
      {publicKey ? (
        <View>
          <Text>Connected directly via: {activeAdapter?.name}</Text>
          <Text>Wallet Address: {publicKey.toBase58()}</Text>
          <Button title="Disconnect" onPress={disconnect} />
        </View>
      ) : (
        <View>
          {error && <Text style={{ color: 'red' }}>Error: {error.message}</Text>}
          <Text>{isConnecting ? "Establishing Connection..." : "Select Wallet:"}</Text>

          <Button 
            title="Connect Ledger (Bluetooth)" 
            onPress={() => connect('Ledger', TransportMethod.BLUETOOTH)} 
          />
          <Button 
            title="Connect Tangem (NFC)" 
            onPress={() => connect('Tangem', TransportMethod.NFC)} 
          />
        </View>
      )}
    </View>
  );
}
```

## 3. Signing Transactions

Once the wallet is connected (`publicKey` is not null), you can construct a standard `@solana/web3.js` transaction and securely pass it out for signing.

```tsx
import { Transaction, SystemProgram, PublicKey } from "@solana/web3.js";

async function doTransfer() {
  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey("...receiver_address..."),
        lamports: 1000000, 
      })
    );
    tx.recentBlockhash = "...";
    tx.feePayer = publicKey;

    // This invokes the hardware device UI!
    const signedTx = await signTransaction(tx);
    console.log("Transaction successfully signed offline!");
  } catch(e) {
    console.error("User rejected the prompt or hardware device communication failed.");
  }
}
```

## 4. Run the Sandbox

Need to experiment with the adapters without building UI? Run the command line test suite at the repository root!

```bash
cd apps/cli
# Test Tangem NFC simulations:
pnpm start -- tangem
# Run all adapters concurrently
pnpm start
```
