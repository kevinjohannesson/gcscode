<script lang="ts">
  import { onMount } from 'svelte';

  import {
    buttonsText,
    controlLabel,
    isOneSided,
    onOffText,
    percentFill,
    unmappedLine,
  } from './controls-format';
  import { usbId } from './radio-format';
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
  const controls = $derived(station.controls);
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
  {:else if !controls}
    <p class="message">
      No profile matches this radio: {radio.name}
      {usbId(radio.vendorId, radio.productId)}, {radio.axes.length} axes, {radio.buttons.length}
      buttons. Its raw input is in Radio input. The station's terminal names its profiles; the TX16S needs
      its gcscode-adv model.
    </p>
  {:else}
    <p class="profile">profile {controls.profile} · {radio.name}</p>

    <table class="axes">
      <thead>
        <tr><th>control</th><th>value</th><th class="scale">-100% · 0 · 100%</th><th>from</th></tr>
      </thead>
      <tbody>
        {#each controls.axes as c (c.role)}
          <tr class:unmapped={c.percent === null}>
            <td>{controlLabel(c.role)}</td>
            {#if c.percent === null}
              <td class="num">not mapped</td>
              <td class="bar"></td>
              <td></td>
            {:else}
              {@const fill = percentFill(c.role, c.percent)}
              <td class="num">{c.percent}%</td>
              <td class="bar" class:one-sided={isOneSided(c.role)}>
                <span class="fill" style:left="{fill.left}%" style:width="{fill.width}%"></span>
                {#if !isOneSided(c.role)}<span class="mid"></span>{/if}
              </td>
              <td class="from">axis {c.axis}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>

    <table class="states">
      <tbody>
        {#each controls.onOff as c (c.role)}
          <tr class:unmapped={c.on === null}>
            <td>{controlLabel(c.role)}</td>
            <td class="state" class:on={c.on === true}>{onOffText(c.on)}</td>
            <td class="from">{c.button === null ? '' : buttonsText([c.button])}</td>
          </tr>
        {/each}
        {#each controls.switches as s (s.name)}
          <tr>
            <td>{s.name}</td>
            <td class="state" class:unknown={s.position === null}>{s.position ?? 'unknown'}</td>
            <td class="from">{buttonsText(s.buttons)}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="unmapped-line">{unmappedLine(controls.unmappedAxes, controls.unmappedButtons)}</p>
  {/if}
</div>

<style>
  .view {
    /* A control's bar is data, not chrome: the extension's own colour, the
       same as the Radio input view's axis bar (ADR-0017 Decision 3). */
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
  .profile,
  .from,
  .unmapped-line,
  .unmapped {
    color: var(--gcscode-descriptionForeground);
  }
  table {
    border-collapse: collapse;
    margin-bottom: 0.75rem;
  }
  th,
  td {
    border: 1px solid var(--gcscode-widget-border);
    padding: 0.1rem 0.5rem;
  }
  th {
    font-weight: normal;
    color: var(--gcscode-descriptionForeground);
  }
  .num {
    text-align: right;
  }
  .scale,
  .bar {
    min-width: 16rem;
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
  .state {
    min-width: 6rem;
  }
  .state.on {
    background: var(--gcscode-foreground);
    color: var(--gcscode-panel-background);
  }
  .state.unknown {
    color: var(--gcscode-descriptionForeground);
    font-style: italic;
  }
</style>
