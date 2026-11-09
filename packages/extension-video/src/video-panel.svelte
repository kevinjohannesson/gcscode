<script lang="ts">
  import { onMount } from 'svelte';

  import { getVideoAddress } from './video-address';
  import { VideoPanelState } from './video-panel-state.svelte';
  import { openWhepSession } from './whep-session';

  const address = getVideoAddress();
  const panel = new VideoPanelState(address, (listener) => openWhepSession(address, listener));

  let video: HTMLVideoElement | undefined = $state();

  onMount(() => {
    panel.start();
    return () => panel.stop();
  });

  $effect(() => {
    const element = video;
    if (!element) return;
    try {
      element.srcObject = panel.stream;
    } catch {
      // A browser that rejects the stream leaves the panel on its message.
    }
  });

  // A hidden dock tab keeps this mounted but takes the element out of the page,
  // which pauses the video; resume when it is visible again.
  $effect(() => {
    const element = video;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    let observer: IntersectionObserver;
    try {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!element.paused || !element.srcObject) return;
        try {
          element.play().catch(() => {});
        } catch {
          // play() unavailable; autoplay covers the common case.
        }
      });
      observer.observe(element);
    } catch {
      return;
    }
    return () => observer.disconnect();
  });
</script>

<div class="panel">
  <video bind:this={video} muted autoplay playsinline class:hidden={panel.status !== 'playing'}
  ></video>
  {#if panel.status !== 'playing'}
    <p class="message">{panel.message}</p>
  {/if}
</div>

<style>
  .panel {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000;
    color: #ddd;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  video.hidden {
    display: none;
  }
  .message {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 1rem;
    text-align: center;
  }
</style>
