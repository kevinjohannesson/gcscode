<script lang="ts">
  import { onMount } from 'svelte';

  import { axisFill, buttonRows, eventsLine, isEdgeTx, pressedLine, usbId } from './radio-format';
  import { RadioInputState } from './radio-input-state.svelte';
  import { getStationAddress } from './station-address';
  import { PROTOCOL } from './station-protocol';

  const address = getStationAddress();
  const station = new RadioInputState(address, (url) => new WebSocket(url));

  onMount(() => {
    station.start();
    return () => station.stop();
  });

  const radio = $derived(station.radio);
</script>

<div class="view">
  {#if station.status === 'connecting'}
    <p class="message">Connecting to the station at {address}…</p>
  {:else if station.status === 'unreachable'}
    <p class="message">
      No station at {address}. Start it with <code>pnpm --filter mavlink-station start</code>; this
      view keeps trying. If it is running, it may have refused this page: its terminal says so, and
      <code>--allow-origin {location.origin}</code> lets this page in.
    </p>
  {:else if station.status === 'mismatch'}
    <p class="message">
      The station speaks protocol {station.stationProtocol}, this page protocol {PROTOCOL}. Run the
      two from the same checkout.
    </p>
  {:else if !radio}
    <p class="message">
      The station has no radio open. Plug in the radio and choose USB Joystick (HID).
    </p>
  {:else}
    <p class="radio">
      {radio.name}
      {usbId(radio.vendorId, radio.productId)}
      {isEdgeTx(radio.vendorId, radio.productId) ? '(EdgeTX radio)' : ''}
    </p>
    <p class="detail">
      {#if radio.serial}serial {radio.serial} ·
      {/if}axes {radio.axes.length} · buttons {radio.buttons.length} · hats {radio.hats.length}
    </p>

    <table class="axes">
      <thead>
        <tr>
          <th class="index">axis</th><th class="value">value</th><th class="scale"
            >-32768 · 0 · 32767</th
          >
        </tr>
      </thead>
      <tbody>
        {#each radio.axes as value, i (i)}
          {@const fill = axisFill(value)}
          <tr>
            <td class="num">{i}</td>
            <td class="num">{value}</td>
            <td class="bar">
              <span class="fill" style:left="{fill.left}%" style:width="{fill.width}%"></span>
              <span class="mid"></span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="caption">buttons, highlighted when pressed:</p>
    <table class="buttons">
      <tbody>
        {#each buttonRows(radio.buttons.length) as row, r (r)}
          <tr>
            {#each row as n (n)}
              <td class:pressed={radio.buttons[n]} aria-pressed={radio.buttons[n]}>{n}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="pressed">{pressedLine(radio.buttons)}</p>

    {#if radio.hats.length}
      <p>hats {radio.hats.map((h, i) => `${i}:${h}`).join('  ')}</p>
    {/if}
  {/if}

  {#if station.status === 'live'}
    <p class="events">{eventsLine(station.eventsPerSecond)}</p>
  {/if}
</div>

<style>
  .view {
    /* The axis bar is data, not chrome: the extension's own colour
       (ADR-0017 Decision 3). */
    --manual-control-axis-fill: #4fa3e0;
    height: 100%;
    overflow: auto;
    padding: 0.75rem;
    font-family: var(--gcscode-monospace-font-family);
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
    color: var(--gcscode-foreground);
    box-sizing: border-box;
  }
  p {
    margin: 0 0 0.5rem;
  }
  .detail,
  .caption,
  .events {
    color: var(--gcscode-descriptionForeground);
  }
  table {
    border-collapse: collapse;
    margin-bottom: 0.5rem;
  }
  th,
  td {
    box-sizing: border-box;
    border: 1px solid var(--gcscode-widget-border);
    padding: 0.1rem 0.5rem;
  }
  th {
    font-weight: normal;
    color: var(--gcscode-descriptionForeground);
  }
  /* Fixed columns, sized for the widest value ("-32768") plus padding, so
     the table keeps its shape while values change sign and length. A fixed
     layout needs the table's own width, which is the columns' sum. */
  .axes {
    --manual-control-index-width: 6ch;
    --manual-control-value-width: 9ch;
    --manual-control-scale-width: 16rem;
    table-layout: fixed;
    width: calc(
      var(--manual-control-index-width) + var(--manual-control-value-width) +
        var(--manual-control-scale-width)
    );
  }
  .index {
    width: var(--manual-control-index-width);
  }
  .value {
    width: var(--manual-control-value-width);
  }
  .scale {
    width: var(--manual-control-scale-width);
  }
  .num {
    text-align: right;
  }
  .bar {
    position: relative;
  }
  .fill {
    position: absolute;
    top: 25%;
    bottom: 25%;
    background: var(--manual-control-axis-fill);
  }
  .mid {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--gcscode-descriptionForeground);
  }
  .buttons td {
    width: 2.25rem;
    text-align: right;
  }
  /* Inverted text, so foreground on panel-background is the tested pair. */
  .buttons td.pressed {
    background: var(--gcscode-foreground);
    color: var(--gcscode-panel-background);
  }
</style>
