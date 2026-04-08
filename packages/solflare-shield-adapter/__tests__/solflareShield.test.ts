import { describe, it, expect, beforeEach } from 'vitest';
import { SolflareShieldAdapter } from '../src';
import { TransportMethod, HardwareWalletConnectionError, HardwareWalletSignError } from '@solana-wallet-sdk/core';
import { PublicKey } from '@solana/web3.js';

describe('SolflareShieldAdapter', () => {
  let adapter: SolflareShieldAdapter;

  beforeEach(() => {
    adapter = new SolflareShieldAdapter();
  });

  it('rejects unsupported transports like NFC', async () => {
    await expect(adapter.connect(TransportMethod.NFC)).rejects.toThrow(
      HardwareWalletConnectionError
    );
  });

  it('connects via USB', async () => {
    await expect(adapter.connect(TransportMethod.USB)).resolves.not.toThrow();
  });

  it('connects via BLUETOOTH', async () => {
    await expect(adapter.connect(TransportMethod.BLUETOOTH)).resolves.not.toThrow();
  });

  it('derives accounts securely over simulation', async () => {
    await adapter.connect(TransportMethod.BLUETOOTH);
    const result = await adapter.deriveAccount('m/44/501/0/0');
    expect(result).toBeInstanceOf(PublicKey);
  });

  it('fails deriving when disconnected', async () => {
    await expect(adapter.deriveAccount('m/44/501/0/0')).rejects.toThrow(
      HardwareWalletConnectionError
    );
  });

  it('throws standard error for unimplemented signature methods via mocked backend', async () => {
    await adapter.connect(TransportMethod.USB);
    await expect(adapter.signMessage(new Uint8Array(32), 'm/44/501/0/0')).rejects.toThrow(
      HardwareWalletSignError
    );
  });
});
