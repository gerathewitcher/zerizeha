export {};

declare global {
  interface Window {
    electron?: {
      ptt: {
        setEnabled: (enabled: boolean) => Promise<void> | void;
        setKey: (code: string) => Promise<void> | void;
        onState: (callback: (active: boolean) => void) => () => void;
      };
      desktop?: {
        getSources: () => Promise<
          { id: string; name: string; thumbnail?: string | null }[]
        >;
      };
    };
  }
}
