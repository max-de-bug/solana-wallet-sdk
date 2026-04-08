import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  useHardwareWallet,
  useQRInteraction,
  TransportMethod,
  DEFAULT_DERIVATION_PATH,
} from "@solana-wallet-sdk/react-native";
import {
  LedgerAdapter,
  type TransportCreator,
} from "@solana-wallet-sdk/ledger-adapter";
import { TrezorAdapter } from "@solana-wallet-sdk/trezor-adapter";
import { KeystoneAdapter } from "@solana-wallet-sdk/keystone-adapter";
import { SafePalAdapter } from "@solana-wallet-sdk/safepal-adapter";
import { TangemAdapter } from "@solana-wallet-sdk/tangem-adapter";
import { UnruggableAdapter } from "@solana-wallet-sdk/unruggable-adapter";
import { SolflareShieldAdapter } from "@solana-wallet-sdk/solflare-shield-adapter";
import {
  Transaction,
  SystemProgram,
  PublicKey,
  Connection,
} from "@solana/web3.js";

// ─── Adapter Setup ──────────────────────────────────────────────────────────

// In a real app, inject the actual transport:
//   import TransportBLE from '@ledgerhq/hw-transport-react-native-ble';
//   const ledger = new LedgerAdapter(TransportBLE);
const mockTransport: TransportCreator = {
  create: async () => {
    throw new Error(
      "Inject a real transport (e.g. TransportBLE) for production use.",
    );
  },
};

// ─── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  // QR interaction hook for Keystone and SafePal
  const { qrProvider, qrData, isScanning, onQRScanned, onQRDisplayDone } =
    useQRInteraction();

  // Create adapters (memoized to avoid re-creation on render)
  const adapters = useMemo(
    () => [
      new LedgerAdapter(mockTransport),
      new TrezorAdapter({
        email: "demo@example.com",
        appUrl: "https://example.com",
      }),
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

  // ─── Local State ────────────────────────────────────────────────────────

  const [derivationIndex, setDerivationIndex] = useState("0");
  const [messageText, setMessageText] = useState("Sign-In With Solana");
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleConnect = async (name: string, method: TransportMethod) => {
    clearError();
    setLastSignature(null);
    addLog(`Connecting to ${name} via ${method}...`);
    try {
      await connect(name, method);
      addLog(`✅ Connected to ${name}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${msg}`);
    }
  };

  const handleDisconnect = async () => {
    addLog("Disconnecting...");
    await disconnect();
    setLastSignature(null);
    addLog("Disconnected");
  };

  const handleDeriveAccount = async () => {
    const path = `m/44'/501'/${derivationIndex}'/0'`;
    addLog(`Deriving account at index ${derivationIndex}...`);
    try {
      const pk = await deriveAccount(path);
      addLog(`✅ Derived: ${pk.toBase58()}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${msg}`);
    }
  };

  const handleSignMessage = async () => {
    addLog(`Signing message: "${messageText}"...`);
    try {
      const msg = new TextEncoder().encode(messageText);
      const sig = await signMessage(msg);
      const hex = Buffer.from(sig).toString("hex").substring(0, 32) + "...";
      setLastSignature(hex);
      addLog(`✅ Signature: ${hex}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${msg}`);
    }
  };

  const handleSignTransaction = async () => {
    if (!publicKey) return;
    addLog("Creating and signing SOL transfer transaction...");
    try {
      const connection = new Connection("https://api.devnet.solana.com");
      const blockhash = await connection.getLatestBlockhash();

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: publicKey, // Self-transfer for demo
          lamports: 1000,
        }),
      );
      tx.recentBlockhash = blockhash.blockhash;
      tx.feePayer = publicKey;

      const signed = await signTransaction(tx);
      addLog(
        `✅ Transaction signed with ${signed.signatures.length} signature(s)`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`❌ ${msg}`);
    }
  };

  // ─── QR Overlay ─────────────────────────────────────────────────────────

  if (qrData) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📱 Show this QR to your device</Text>
        <View style={styles.qrPlaceholder}>
          <Text style={styles.qrText}>{qrData.substring(0, 100)}...</Text>
          <Text style={styles.hint}>
            (In production, render this with react-native-qrcode-svg)
          </Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={onQRDisplayDone}>
          <Text style={styles.buttonText}>
            Done — I've shown it to the device
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isScanning) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>📷 Scan the QR from your device</Text>
        <View style={styles.qrPlaceholder}>
          <Text style={styles.hint}>
            (In production, use react-native-vision-camera here)
          </Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() =>
            onQRScanned(JSON.stringify({ status: "ok", result: "" }))
          }
        >
          <Text style={styles.buttonText}>Simulate Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Connected View ──────────────────────────────────────────────────────

  if (publicKey && activeAdapter) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>🔐 {activeAdapter.name} Connected</Text>
        <Text style={styles.address}>{publicKey.toBase58()}</Text>

        {/* Derivation Index */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Multi-Account Derivation</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              value={derivationIndex}
              onChangeText={setDerivationIndex}
              keyboardType="numeric"
              placeholder="Index"
            />
            <TouchableOpacity
              style={styles.buttonSmall}
              onPress={handleDeriveAccount}
            >
              <Text style={styles.buttonText}>Derive</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message Signing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sign Message (SIWS)</Text>
          <TextInput
            style={styles.input}
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Message to sign"
          />
          <TouchableOpacity
            style={[styles.button, isSigning && styles.disabled]}
            onPress={handleSignMessage}
            disabled={isSigning}
          >
            <Text style={styles.buttonText}>
              {isSigning ? "Signing..." : "Sign Message"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Transaction Signing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sign Transaction</Text>
          <TouchableOpacity
            style={[styles.button, isSigning && styles.disabled]}
            onPress={handleSignTransaction}
            disabled={isSigning}
          >
            <Text style={styles.buttonText}>
              {isSigning ? "Signing..." : "Sign SOL Transfer (Devnet)"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Last Signature */}
        {lastSignature && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Last Signature</Text>
            <Text style={styles.mono}>{lastSignature}</Text>
          </View>
        )}

        {/* Disconnect */}
        <TouchableOpacity
          style={styles.dangerButton}
          onPress={handleDisconnect}
        >
          <Text style={styles.buttonText}>Disconnect</Text>
        </TouchableOpacity>

        {/* Log */}
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          {logs.slice(-10).map((log, i) => (
            <Text key={i} style={styles.logLine}>
              {log}
            </Text>
          ))}
        </View>
      </ScrollView>
    );
  }

  // ─── Wallet Selection View ────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🔐 Solana Unified Wallet SDK</Text>
      <Text style={styles.subtitle}>Select a hardware wallet to connect</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity onPress={clearError}>
            <Text style={styles.clearError}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {isConnecting && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#9945FF" />
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      )}

      {capabilities.map((cap, i) => (
        <View key={cap.name} style={styles.walletCard}>
          <Text style={styles.walletName}>{cap.name}</Text>
          <View style={styles.transportRow}>
            {cap.supportsUSB && (
              <TouchableOpacity
                style={styles.transportButton}
                onPress={() => handleConnect(cap.name, TransportMethod.USB)}
                disabled={isConnecting}
              >
                <Text style={styles.transportText}>🔌 USB</Text>
              </TouchableOpacity>
            )}
            {cap.supportsBluetooth && (
              <TouchableOpacity
                style={styles.transportButton}
                onPress={() =>
                  handleConnect(cap.name, TransportMethod.BLUETOOTH)
                }
                disabled={isConnecting}
              >
                <Text style={styles.transportText}>📶 BLE</Text>
              </TouchableOpacity>
            )}
            {cap.supportsQR && (
              <TouchableOpacity
                style={styles.transportButton}
                onPress={() => handleConnect(cap.name, TransportMethod.QR)}
                disabled={isConnecting}
              >
                <Text style={styles.transportText}>📱 QR</Text>
              </TouchableOpacity>
            )}
            {cap.supportsNFC && (
              <TouchableOpacity
                style={styles.transportButton}
                onPress={() => handleConnect(cap.name, TransportMethod.NFC)}
                disabled={isConnecting}
              >
                <Text style={styles.transportText}>📡 NFC</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}

      {/* Log */}
      {logs.length > 0 && (
        <View style={styles.logSection}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          {logs.slice(-5).map((log, i) => (
            <Text key={i} style={styles.logLine}>
              {log}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#0F0F1A",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginBottom: 24,
    textAlign: "center",
  },
  address: {
    fontSize: 12,
    color: "#9945FF",
    fontFamily: "monospace",
    textAlign: "center",
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    backgroundColor: "#252540",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#FFFFFF",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#9945FF",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonSmall: {
    backgroundColor: "#9945FF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  dangerButton: {
    backgroundColor: "#E53E3E",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  walletCard: {
    backgroundColor: "#1A1A2E",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  walletName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 10,
  },
  transportRow: {
    flexDirection: "row",
    gap: 8,
  },
  transportButton: {
    flex: 1,
    backgroundColor: "#252540",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  transportText: {
    color: "#9945FF",
    fontSize: 14,
    fontWeight: "500",
  },
  errorBox: {
    backgroundColor: "#3B1A1A",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    color: "#FF6B6B",
    flex: 1,
    fontSize: 13,
  },
  clearError: {
    color: "#FF6B6B",
    fontWeight: "bold",
    marginLeft: 8,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  loadingText: {
    color: "#9945FF",
    fontSize: 14,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#14F195",
  },
  qrPlaceholder: {
    backgroundColor: "#1A1A2E",
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    marginVertical: 20,
  },
  qrText: {
    fontFamily: "monospace",
    fontSize: 10,
    color: "#888",
    textAlign: "center",
  },
  hint: {
    color: "#666",
    fontSize: 12,
    marginTop: 8,
    textAlign: "center",
  },
  logSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#111122",
    borderRadius: 8,
  },
  logLine: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#666",
    marginBottom: 2,
  },
});
