import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrezorAdapter } from '../src';
import { TransportMethod, HardwareWalletConnectionError, HardwareWalletSignError } from '@solana-wallet-sdk/core';
import { PublicKey, Transaction } from '@solana/web3.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const MOCK_ADDRESS = '11111111111111111111111111111112';

vi.mock('@trezor/connect', () => {
  const MOCK_ADDR = '11111111111111111111111111111112';
  const MOCK_SIG_HEX = 'ab'.repeat(64);
  return {
    default: {
      init: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      solanaGetAddress: vi.fn().mockResolvedValue({
        success: true,
        payload: { address: MOCK_ADDR },
      }),
      solanaSignTransaction: vi.fn().mockResolvedValue({
        success: true,
        payload: { signature: MOCK_SIG_HEX },
      }),
      solanaSignMessage: vi.fn().mockResolvedValue({
        success: true,
        payload: { signature: MOCK_SIG_HEX },
      }),
    },
  };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TrezorAdapter', () => {
  let adapter: TrezorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TrezorAdapter({
      email: 'test@test.com',
      appUrl: 'https://test.com',
    });
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(adapter.name).toBe('Trezor');
    });

    it('should only support USB', () => {
      expect(adapter.transportMethods).toEqual([TransportMethod.USB]);
    });
  });

  describe('connect()', () => {
    it('should initialize TrezorConnect with manifest', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      await adapter.connect(TransportMethod.USB);
      expect(TrezorConnect.init).toHaveBeenCalledWith({
        lazyLoad: true,
        manifest: {
          email: 'test@test.com',
          appUrl: 'https://test.com',
        },
      });
    });

    it('should reject non-USB transport methods', async () => {
      await expect(adapter.connect(TransportMethod.BLUETOOTH)).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });
  });

  describe('disconnect()', () => {
    it('should call dispose when initialized', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      await adapter.connect(TransportMethod.USB);
      await adapter.disconnect();
      expect(TrezorConnect.dispose).toHaveBeenCalledOnce();
    });
  });

  describe('deriveAccount()', () => {
    it('should throw when not connected', async () => {
      await expect(adapter.deriveAccount("m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });

    it('should return a PublicKey', async () => {
      await adapter.connect(TransportMethod.USB);
      const pk = await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(pk).toBeInstanceOf(PublicKey);
    });

    it('should pass the path to TrezorConnect', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      await adapter.connect(TransportMethod.USB);
      await adapter.deriveAccount("m/44'/501'/0'/0'");
      expect(TrezorConnect.solanaGetAddress).toHaveBeenCalledWith({
        path: "m/44'/501'/0'/0'",
      });
    });
  });

  describe('signTransaction()', () => {
    it('should throw when not connected', async () => {
      const tx = new Transaction();
      await expect(adapter.signTransaction(tx, "m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletConnectionError
      );
    });

    it('should call solanaSignTransaction with hex-encoded tx', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      await adapter.connect(TransportMethod.USB);

      const tx = new Transaction();
      tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
      tx.feePayer = new PublicKey(MOCK_ADDRESS);

      await adapter.signTransaction(tx, "m/44'/501'/0'/0'");
      expect(TrezorConnect.solanaSignTransaction).toHaveBeenCalledOnce();
    });

    it('should handle Trezor failure response', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      TrezorConnect.solanaSignTransaction = vi.fn().mockResolvedValue({
        success: false,
        payload: { error: 'User cancelled' },
      });

      await adapter.connect(TransportMethod.USB);

      const tx = new Transaction();
      tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
      tx.feePayer = new PublicKey(MOCK_ADDRESS);

      await expect(adapter.signTransaction(tx, "m/44'/501'/0'/0'")).rejects.toThrow(
        HardwareWalletSignError
      );
    });
  });

  describe('signMessage()', () => {
    it('should throw when not connected', async () => {
      await expect(
        adapter.signMessage(new Uint8Array([1, 2, 3]), "m/44'/501'/0'/0'")
      ).rejects.toThrow(HardwareWalletConnectionError);
    });

    it('should call solanaSignMessage with hex-encoded message', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      await adapter.connect(TransportMethod.USB);

      const msg = new TextEncoder().encode('Hello, SIWS!');
      const sig = await adapter.signMessage(msg, "m/44'/501'/0'/0'");

      expect((TrezorConnect as any).solanaSignMessage).toHaveBeenCalledOnce();
      expect(sig).toBeInstanceOf(Uint8Array);
    });

    it('should handle Trezor failure response', async () => {
      const TrezorConnect = (await import('@trezor/connect')).default;
      (TrezorConnect as any).solanaSignMessage = vi.fn().mockResolvedValue({
        success: false,
        payload: { error: 'Signing not supported' },
      });

      await adapter.connect(TransportMethod.USB);

      await expect(
        adapter.signMessage(new Uint8Array([1, 2, 3]), "m/44'/501'/0'/0'")
      ).rejects.toThrow(HardwareWalletSignError);
    });
  });
});
