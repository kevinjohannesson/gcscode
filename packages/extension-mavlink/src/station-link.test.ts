import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RETRY_DELAY_MS,
  SILENCE_LIMIT_MS,
  STATION_PROTOCOL,
  StationLink,
  parseHello,
  type StationSocket,
} from './station-link.svelte';

class FakeSocket implements StationSocket {
  public static instances: FakeSocket[] = [];
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public closeCalls = 0;

  public constructor(public readonly url: string) {
    FakeSocket.instances.push(this);
  }

  public static latest(): FakeSocket {
    const s = FakeSocket.instances.at(-1);
    if (!s) throw new Error('no socket opened');
    return s;
  }

  public close(): void {
    this.closeCalls++;
  }

  public receive(text: string): void {
    this.onmessage?.({ data: text } as MessageEvent);
  }

  public closeFromStation(): void {
    this.onclose?.({} as CloseEvent);
  }
}

const URL = 'ws://127.0.0.1:8091/ws';
/** A hello in whatever protocol this page speaks, so a protocol bump leaves these tests alone. */
const HELLO = `{"type":"hello","protocol":${STATION_PROTOCOL},"station":"0.1.0"}`;
const INPUT = '{"type":"input","radio":null,"eventsPerSecond":0}';

function link(): StationLink {
  return new StationLink((url) => new FakeSocket(url));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  FakeSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('StationLink', () => {
  it("is running once the station says hello in this page's protocol, since then", () => {
    const station = link();
    station.start(URL);
    expect(FakeSocket.latest().url).toBe(URL);
    expect(station.status).toBe('connecting');
    expect(station.since).toBe(10_000);

    vi.setSystemTime(10_400);
    FakeSocket.latest().receive(HELLO);
    expect(station.status).toBe('running');
    expect(station.since).toBe(10_400);
    expect(station.version).toBe('0.1.0');
    station.stop();
  });

  it('stays running while the station keeps talking, and is not running after 3 s of silence', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().receive(HELLO);
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1_000);
      FakeSocket.latest().receive(INPUT);
    }
    expect(station.status).toBe('running');

    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1);
    expect(station.status).toBe('running');
    vi.advanceTimersByTime(1);
    expect(station.status).toBe('not-running');
    expect(station.since).toBe(10_000 + 5_000 + SILENCE_LIMIT_MS);
    expect(station.version).toBeNull();
    expect(FakeSocket.instances[0].closeCalls).toBe(1);
    station.stop();
  });

  it('counts its 3 s of silence from a late hello, not from the connect', () => {
    const station = link();
    station.start(URL);
    vi.advanceTimersByTime(2_500);
    FakeSocket.latest().receive(HELLO);
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1);
    expect(station.status).toBe('running');
    vi.advanceTimersByTime(1);
    expect(station.status).toBe('not-running');
    station.stop();
  });

  it('does not count text that is not a station message as the station talking', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().receive(HELLO);
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1_000);
      FakeSocket.latest().receive('not json');
      FakeSocket.latest().receive('[1]');
      FakeSocket.latest().receive('{"no":"type"}');
    }
    expect(station.status).toBe('not-running');
    station.stop();
  });

  it('is not running when the station closes, and picks it up again on a retry 2 s later', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().receive(HELLO);
    FakeSocket.latest().closeFromStation();
    expect(station.status).toBe('not-running');
    expect(FakeSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(RETRY_DELAY_MS - 1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.latest().url).toBe(URL);

    FakeSocket.latest().receive(HELLO);
    expect(station.status).toBe('running');
    station.stop();
  });

  it('keeps retrying while nothing answers, without moving its since', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().closeFromStation();
    const since = station.since;
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(RETRY_DELAY_MS);
      FakeSocket.latest().closeFromStation();
    }
    expect(FakeSocket.instances).toHaveLength(4);
    expect(station.status).toBe('not-running');
    expect(station.since).toBe(since);
    station.stop();
  });

  it('is not running when a socket opens but no hello comes within 3 s', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().receive(INPUT);
    expect(station.status).toBe('connecting');
    vi.advanceTimersByTime(SILENCE_LIMIT_MS);
    expect(station.status).toBe('not-running');
    station.stop();
  });

  it('is a mismatch, not running, when the station speaks another protocol, and clears once it is gone', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().receive('{"type":"hello","protocol":0,"station":"0.0.9"}');
    expect(station.status).toBe('mismatch');
    expect(station.stationProtocol).toBe(0);
    expect(FakeSocket.instances[0].closeCalls).toBe(1);
    const since = station.since;

    // The same station again on the retry: still a mismatch, since unchanged.
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    FakeSocket.latest().receive('{"type":"hello","protocol":0,"station":"0.0.9"}');
    expect(station.status).toBe('mismatch');
    expect(station.since).toBe(since);

    // Then it stops: the next retry finds nothing.
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    FakeSocket.latest().closeFromStation();
    expect(station.status).toBe('not-running');
    expect(station.stationProtocol).toBeNull();
    station.stop();
  });

  it('is not running and retries when the socket cannot even be made', () => {
    let fail = true;
    const station = new StationLink((url) => {
      if (fail) throw new Error('bad url');
      return new FakeSocket(url);
    });
    station.start(URL);
    expect(station.status).toBe('not-running');
    fail = false;
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    FakeSocket.latest().receive(HELLO);
    expect(station.status).toBe('running');
    station.stop();
  });

  it('stops: closes its socket, leaves no timer, ignores the old socket, and can start again', () => {
    const station = link();
    station.start(URL);
    const first = FakeSocket.latest();
    first.receive(HELLO);
    station.stop();
    expect(first.closeCalls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(station.status).toBe('connecting');
    expect(station.version).toBeNull();

    first.receive(HELLO);
    first.closeFromStation();
    expect(station.status).toBe('connecting');
    expect(vi.getTimerCount()).toBe(0);

    station.start('ws://127.0.0.1:9091/ws');
    expect(FakeSocket.latest().url).toBe('ws://127.0.0.1:9091/ws');
    expect(station.url).toBe('ws://127.0.0.1:9091/ws');
    station.stop();
  });

  it('stops during a retry without opening another socket', () => {
    const station = link();
    station.start(URL);
    FakeSocket.latest().closeFromStation();
    station.stop();
    vi.advanceTimersByTime(RETRY_DELAY_MS * 3);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('holds one socket at a time when started again', () => {
    const station = link();
    station.start(URL);
    const first = FakeSocket.latest();
    station.start(URL);
    expect(first.closeCalls).toBe(1);
    expect(FakeSocket.instances).toHaveLength(2);
    first.receive(HELLO);
    expect(station.status).toBe('connecting');
    station.stop();
  });
});

describe('parseHello', () => {
  it('reads protocol 1 hello', () => {
    expect(parseHello('{"type":"hello","protocol":1,"station":"0.1.0"}')).toEqual({
      protocol: 1,
      station: '0.1.0',
    });
  });

  it.each([
    ['not json', 'hello'],
    ['an array', '[]'],
    ['null', 'null'],
    ['another type', INPUT],
    ['no protocol', '{"type":"hello","station":"0.1.0"}'],
    ['a fractional protocol', '{"type":"hello","protocol":0.5,"station":"0.1.0"}'],
    ['a string protocol', '{"type":"hello","protocol":"0","station":"0.1.0"}'],
    ['no station', '{"type":"hello","protocol":0}'],
  ])('refuses %s', (_, text) => {
    expect(parseHello(text)).toBeNull();
  });
});
