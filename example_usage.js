const { TangemAdapter } = require("./packages/tangem-adapter/dist");
const { TransportMethod, DEFAULT_DERIVATION_PATH } = require("./packages/core/dist");
const { Connection, Transaction, SystemProgram, PublicKey } = require("@solana/web3.js");

/**
 * PROGRAMMATIC USAGE EXAMPLE (Node.js)
 * 
 * This script demonstrates the main flows:
 * 1. Initialize an adapter
 * 2. Connect via a supported TransportMethod
 * 3. Derive a public key
 * 4. Sign a transaction
 */

async function main() {
  console.log("🚀 Starting Programmatic Wallet Demo...");

  // 1. Initialize Adapter
  // TangemAdapter has a built-in simulation/mock fallback for development
  const adapter = new TangemAdapter({ scanOnConnect: true });

  try {
    // 2. Connect
    console.log("Step 1: Connecting to Tangem via NFC...");
    await adapter.connect(TransportMethod.NFC);

    // 3. Derive Account
    console.log("Step 2: Deriving Account...");
    const publicKey = await adapter.deriveAccount(DEFAULT_DERIVATION_PATH);
    console.log("✅ Derived Public Key:", publicKey.toBase58());

    // 4. Sign Transaction
    console.log("Step 3: Signing Transaction...");
    const connection = new Connection("https://api.devnet.solana.com");
    
    // Get a recent blockhash (required for signing)
    let blockhash;
    try {
      const latest = await connection.getLatestBlockhash();
      blockhash = latest.blockhash;
    } catch (e) {
      console.log("⚠️  Devnet connection failed, using dummy blockhash for signing demo.");
      blockhash = "Eb7vSNe7R59GAnwA37j5x8T8M3D7U3uK2D2E6qVwJ4uR";
    }
    
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey("11111111111111111111111111111111"),
        lamports: 1000,
      })
    );
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey;

    // The SDK handles all the low-level serialization and device communication
    const signedTx = await adapter.signTransaction(tx, DEFAULT_DERIVATION_PATH);
    console.log("✅ Transaction Signed. Signature count:", signedTx.signatures.length);

    // 5. Disconnect
    await adapter.disconnect();
    console.log("👋 Disconnected.");

  } catch (error) {
    console.error("❌ Demo Failed:", error.message);
  }
}

main();
