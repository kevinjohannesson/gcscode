import { systemIdOf } from './asset-adapter';

/** The bridge's state as the client reports it. After `disconnected` nothing reconnects today. */
export type BridgeState = 'connecting' | 'connected' | 'disconnected';

/** The last heartbeat heard from one MAVLink system. */
export interface HeartbeatSeen {
  /** `header.system_id` of the sender. */
  systemId: number;
  /** The sender's `MAV_TYPE` without its prefix (`QUADROTOR`, `GCS`), or null when unreadable. */
  type: string | null;
  /** When the heartbeat arrived, on the clock the state was built with. */
  at: number;
}

/**
 * What the link looks like from the page: the mavlink2rest bridge's state and
 * since when, and per system ID the time its last heartbeat arrived. It reads
 * the extension's one socket and opens none of its own, and it stores times,
 * not ages: the view works the age out against its own clock, so an age keeps
 * growing while nothing arrives, which is the point.
 */
export class LinkState {
  private _bridge = $state<BridgeState>('connecting');
  private _bridgeSince = $state(0);
  // Keyed by system ID, a whole number, so `Object.values` already lists the
  // systems in ascending ID order: integer keys enumerate ascending by spec.
  private _systems = $state<Record<number, HeartbeatSeen>>({});
  private readonly _sorted = $derived(Object.values(this._systems));

  private readonly now: () => number;

  public constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this._bridgeSince = now();
  }

  public get bridge(): BridgeState {
    return this._bridge;
  }

  /** When the bridge entered its current state. */
  public get bridgeSince(): number {
    return this._bridgeSince;
  }

  /** Every system heard so far, by system ID. A system never drops out: a silent one shows a growing age. */
  public get systems(): readonly HeartbeatSeen[] {
    return this._sorted;
  }

  public setBridge(state: BridgeState): void {
    if (state === this._bridge) return;
    this._bridge = state;
    this._bridgeSince = this.now();
  }

  /** Records a heartbeat; any other message, or one with no readable sender, is ignored. */
  public noteMessage(json: unknown): void {
    const message = heartbeatOf(json);
    if (message === undefined) return;
    const id = systemIdOf(json);
    if (id === undefined) return;
    const systemId = Number(id);
    this._systems[systemId] = { systemId, type: typeName(message['mavtype']), at: this.now() };
  }

  public reset(): void {
    this._bridge = 'connecting';
    this._bridgeSince = this.now();
    this._systems = {};
  }
}

/** The extension's one link state, fed by its one socket. */
export const linkState = new LinkState();

function heartbeatOf(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const message = (json as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return undefined;
  const msg = message as Record<string, unknown>;
  return msg['type'] === 'HEARTBEAT' ? msg : undefined;
}

/** mavlink2rest sends `{ type: 'MAV_TYPE_QUADROTOR' }`; a bare string is accepted too. */
function typeName(value: unknown): string | null {
  const name =
    typeof value === 'object' && value !== null ? (value as { type?: unknown }).type : value;
  return typeof name === 'string' ? name.replace(/^MAV_TYPE_/, '') : null;
}
