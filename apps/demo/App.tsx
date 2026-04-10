import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
} from "react-native";
import {
  useHardwareWallet,
  useQRInteraction,
  TransportMethod,
  DEFAULT_DERIVATION_PATH,
  HardwareWalletAdapter,
} from "@solana-wallet-sdk/react-native";
import { TangemAdapter } from "@solana-wallet-sdk/tangem-adapter";
import { UnruggableAdapter } from "@solana-wallet-sdk/unruggable-adapter";
import { SolflareShieldAdapter } from "@solana-wallet-sdk/solflare-shield-adapter";
import { KeystoneAdapter } from "@solana-wallet-sdk/keystone-adapter";
import { SafePalAdapter } from "@solana-wallet-sdk/safepal-adapter";
import {
  Transaction,
  SystemProgram,
  PublicKey,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Hardware Simulation for Demo Purposes ──────────────────────────────────
// To allow local emulator testing without crashing, we mock the USB-bound adapters.
class MockLedgerAdapter implements HardwareWalletAdapter {
  name = "Ledger Nano X";
  transportMethods = [TransportMethod.BLUETOOTH, TransportMethod.USB] as const;
  private connected = false;
  protected keypair = Keypair.fromSeed(new Uint8Array(32).fill(7));

  async connect() {
    await new Promise((r) => setTimeout(r, 1500)); // Simulate BT negotiation delay
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async deriveAccount() {
    return this.keypair.publicKey;
  }
  async signMessage() {
    await new Promise((r) => setTimeout(r, 1000));
    return new Uint8Array(64).fill(1);
  }
  async signTransaction(tx: any) {
    await new Promise((r) => setTimeout(r, 1500));
    tx.partialSign(this.keypair);
    return tx;
  }
}

class MockTrezorAdapter implements HardwareWalletAdapter {
  name = "Trezor Model T";
  transportMethods = [TransportMethod.USB] as const;
  private connected = false;
  protected keypair = Keypair.fromSeed(new Uint8Array(32).fill(9));

  async connect() {
    await new Promise((r) => setTimeout(r, 1500));
    this.connected = true;
  }
  async disconnect() {
    this.connected = false;
  }
  async deriveAccount() {
    return this.keypair.publicKey;
  }
  async signMessage() {
    await new Promise((r) => setTimeout(r, 1000));
    return new Uint8Array(64).fill(1);
  }
  async signTransaction(tx: any) {
    await new Promise((r) => setTimeout(r, 1500));
    tx.partialSign(this.keypair);
    return tx;
  }
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const { qrProvider, qrData, isScanning, onQRScanned, onQRDisplayDone } =
    useQRInteraction();

  const adapters = useMemo(
    () => [
      new MockLedgerAdapter(),
      new MockTrezorAdapter(),
      new KeystoneAdapter(qrProvider),
      new SafePalAdapter({ qrProvider }),
      new TangemAdapter({ scanOnConnect: true }),
      new UnruggableAdapter(),
      new SolflareShieldAdapter(),
    ],
    [qrProvider],
  );

  const {
    activeAdapter,
    publicKey,
    connect,
    disconnect,
    deriveAccount,
    signTransaction,
    signMessage,
    isConnecting,
    isSigning,
    error,
    capabilities,
    clearError,
  } = useHardwareWallet({ adapters });

  const [derivationIndex, setDerivationIndex] = useState("0");
  const [messageText, setMessageText] = useState("Sign-In With Solana");
  const [lastSignature, setLastSignature] = useState<string | null>(null);

  const safeAnimate = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const handleConnect = async (name: string, method: TransportMethod) => {
    safeAnimate();
    clearError();
    setLastSignature(null);
    try {
      await connect(name, method);
      safeAnimate();
    } catch (e: unknown) {}
  };

  const handleDisconnect = async () => {
    safeAnimate();
    await disconnect();
    setLastSignature(null);
  };

  const handleSignMessage = async () => {
    try {
      const msg = new TextEncoder().encode(messageText);
      const sig = await signMessage(msg);
      setLastSignature(
        Buffer.from(sig).toString("hex").substring(0, 32) + "...",
      );
      safeAnimate();
    } catch (e) {}
  };

  const handleSignTransaction = async () => {
    if (!publicKey) return;
    try {
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed",
      );

      // Request Airdrop if balance is empty (to test actually sending standard network TXs)
      const bal = await connection.getBalance(publicKey);
      if (bal < LAMPORTS_PER_SOL * 0.05) {
        setLastSignature("Requesting Airdrop (please wait)...");
        try {
          // Request smaller amount to avoid 429 Devnet Rate Limits
          const airdropSig = await connection.requestAirdrop(
            publicKey,
            LAMPORTS_PER_SOL * 0.5,
          );
          await connection.confirmTransaction(airdropSig, "confirmed");
        } catch (airdropError: any) {
          console.warn(
            "Airdrop rate limited, attempting to proceed with existing balance.",
          );
        }
      }

      setLastSignature("Generating & Signing Transcation...");
      const blockhash = await connection.getLatestBlockhash();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey,
          lamports: 1000,
        }),
      );
      tx.recentBlockhash = blockhash.blockhash;
      tx.feePayer = publicKey;

      const sigTx = await signTransaction(tx);
      setLastSignature("Deploying to devnet...");

      const txId = await connection.sendRawTransaction(sigTx.serialize());
      await connection.confirmTransaction({
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        signature: txId,
      });

      setLastSignature(`https://explorer.solana.com/tx/${txId}?cluster=devnet`);
      safeAnimate();
    } catch (e: any) {
      setLastSignature(`Error: ${e.message}`);
    }
  };

  // ─── UI Rendering ─────────────────────────────────────────────────────────

  if (qrData) {
    return (
      <View style={styles.container}>
        <View style={styles.qrCard}>
          <Text style={styles.title}>📱 Show to Device</Text>
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrText}>{qrData.substring(0, 80)}...</Text>
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onQRDisplayDone}
          >
            <Text style={styles.buttonText}>Acknowledge</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isScanning) {
    return (
      <View style={styles.container}>
        <View style={styles.qrCard}>
          <Text style={styles.title}>📷 Scan from Device</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              safeAnimate();
              onQRScanned(JSON.stringify({ status: "ok", result: "" }));
            }}
          >
            <Text style={styles.buttonText}>Simulate Camera Scan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (publicKey && activeAdapter) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Connected</Text>
          </View>
          <Text style={styles.title}>{activeAdapter.name}</Text>
          <Text style={styles.address}>{publicKey.toBase58()}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Derivation</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={derivationIndex}
              onChangeText={setDerivationIndex}
              keyboardType="numeric"
              placeholderTextColor="#666"
            />
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => deriveAccount(`m/44'/501'/${derivationIndex}'/0'`)}
            >
              <Text style={styles.buttonTextSmall}>Derive</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payload Signing</Text>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            value={messageText}
            onChangeText={setMessageText}
            placeholderTextColor="#666"
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.primaryButton, { flex: 1 }]}
              onPress={handleSignMessage}
              disabled={isSigning}
            >
              {isSigning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonTextSmall}>Sign Message</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { flex: 1, backgroundColor: "#00C2A8" },
              ]}
              onPress={handleSignTransaction}
              disabled={isSigning}
            >
              {isSigning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonTextSmall}>Sign SOL Tx</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {lastSignature && (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>✓ Verified Signature</Text>
            <Text style={styles.mono}>{lastSignature}</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleDisconnect}
        >
          <Text style={styles.buttonText}>Disconnect Wallet</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.mainLogo}>SOLANA</Text>
      <Text style={styles.dashboardTitle}>Unified Hardware SDK</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity onPress={clearError}>
            <Text style={styles.errorClose}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      {isConnecting && (
        <View style={styles.loaderArea}>
          <ActivityIndicator color="#9945FF" size="large" />
          <Text style={styles.loaderText}>
            Establishing Secure Connection...
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
      >
        {capabilities.map((cap) => (
          <View key={cap.name} style={styles.walletTile}>
            <Text style={styles.walletName}>{cap.name}</Text>
            <View style={styles.transportStrip}>
              {cap.supportsUSB && (
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() => handleConnect(cap.name, TransportMethod.USB)}
                  disabled={isConnecting}
                >
                  <Text style={styles.pillText}>USB</Text>
                </TouchableOpacity>
              )}
              {cap.supportsBluetooth && (
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() =>
                    handleConnect(cap.name, TransportMethod.BLUETOOTH)
                  }
                  disabled={isConnecting}
                >
                  <Text style={styles.pillText}>BLE</Text>
                </TouchableOpacity>
              )}
              {cap.supportsQR && (
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() => handleConnect(cap.name, TransportMethod.QR)}
                  disabled={isConnecting}
                >
                  <Text style={styles.pillText}>QR Scan</Text>
                </TouchableOpacity>
              )}
              {cap.supportsNFC && (
                <TouchableOpacity
                  style={styles.pill}
                  onPress={() => handleConnect(cap.name, TransportMethod.NFC)}
                  disabled={isConnecting}
                >
                  <Text style={styles.pillText}>NFC</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Premium Deep Space Theme ───────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#05050A",
    paddingHorizontal: 24,
    paddingTop: 65,
  },
  mainLogo: {
    color: "#14F195",
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: "800",
    textAlign: "center",
  },
  dashboardTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 30,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
  },
  badge: {
    backgroundColor: "rgba(20, 241, 149, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    color: "#14F195",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  title: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 6,
  },
  address: {
    color: "#9945FF",
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  walletTile: {
    backgroundColor: "rgba(25, 25, 35, 0.6)",
    borderColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
  },
  walletName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 14,
  },
  transportStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    backgroundColor: "rgba(153, 69, 255, 0.15)",
    borderColor: "rgba(153, 69, 255, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  pillText: {
    color: "#C299FF",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#12121A",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1E1E2A",
  },
  successCard: {
    backgroundColor: "rgba(20, 241, 149, 0.05)",
    borderColor: "rgba(20, 241, 149, 0.2)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  successTitle: {
    color: "#14F195",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#0A0A0F",
    color: "#FFF",
    borderWidth: 1,
    borderColor: "#2A2A3A",
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: "#9945FF",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
  },
  secondaryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 20,
  },
  dangerButton: {
    backgroundColor: "rgba(255, 60, 60, 0.1)",
    borderColor: "rgba(255, 60, 60, 0.3)",
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 40,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonTextSmall: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  mono: {
    color: "#14F195",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
  },
  errorBox: {
    backgroundColor: "rgba(255, 60, 60, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 60, 60, 0.4)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  errorText: {
    color: "#FF8888",
    fontSize: 13,
    flex: 1,
  },
  errorClose: {
    color: "#FFF",
    fontSize: 20,
    lineHeight: 20,
    marginLeft: 12,
  },
  loaderArea: {
    paddingVertical: 30,
    alignItems: "center",
  },
  loaderText: {
    color: "#9945FF",
    marginTop: 12,
    fontSize: 13,
    fontWeight: "500",
  },
  qrCard: {
    backgroundColor: "#12121A",
    padding: 30,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A2A3A",
    marginTop: "30%",
  },
  qrPlaceholder: {
    backgroundColor: "#1A1A2E",
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 24,
    padding: 20,
  },
  qrText: {
    color: "#666",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    textAlign: "center",
  },
});
