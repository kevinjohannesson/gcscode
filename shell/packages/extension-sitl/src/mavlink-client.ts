export interface MavlinkClient {
  close(): Promise<void>;
}

export function createMavlinkClient(options: {
  url: string;
  onMessage: (json: unknown) => void;
  onConnectionStateChange: (s: 'connecting' | 'connected' | 'disconnected') => void;
}): MavlinkClient {
  const { url, onMessage, onConnectionStateChange } = options;

  const socket = new WebSocket(url);

  // Pending close promise resolver — set when close() is called before the
  // socket has actually closed. Resolved when the close event fires.
  let pendingCloseResolve: (() => void) | null = null;
  // The deferred promise returned by the first close() call.
  let closePromise: Promise<void> | null = null;

  // Notify the consumer immediately — connecting starts synchronously.
  onConnectionStateChange('connecting');

  socket.onopen = () => {
    onConnectionStateChange('connected');
  };

  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse((event as MessageEvent).data);
      onMessage(parsed);
    } catch {
      console.warn('[mavlink-client] Failed to parse message:', (event as MessageEvent).data);
    }
  };

  socket.onerror = () => {
    console.error('[mavlink-client] WebSocket error. Waiting for close event.');
    // Do NOT call socket.close() here — the WebSocket spec fires the close
    // event automatically after an error event.
  };

  socket.onclose = () => {
    onConnectionStateChange('disconnected');
    if (pendingCloseResolve) {
      pendingCloseResolve();
      pendingCloseResolve = null;
    }
  };

  return {
    close(): Promise<void> {
      // Already closed (readyState === CLOSED = 3)
      if (socket.readyState === 3) {
        return Promise.resolve();
      }

      // Idempotent: if a close is already in-flight, return the same promise.
      if (closePromise !== null) {
        return closePromise;
      }

      closePromise = new Promise<void>((resolve) => {
        pendingCloseResolve = resolve;
      });

      socket.close(1000, 'extension-deactivate');

      return closePromise;
    },
  };
}
