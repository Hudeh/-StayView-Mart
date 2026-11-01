export {};

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      printReceiptSilent?: (plainText: string, deviceName: string | null) => Promise<unknown>;
      listPrinters?: () => Promise<{ name: string; displayName?: string; isDefault?: boolean }[]>;
      printRawNetwork?: (host: string, port: number, plainText: string) => Promise<unknown>;
    };
  }
}
