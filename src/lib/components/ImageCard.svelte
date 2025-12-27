<script>
  import { onMount } from 'svelte';
  import { config, actions } from '../store';
  import { ImageLoader } from '../loader';

  export let item;
  
  let src = '';
  let loading = true;
  
  onMount(async () => {
    const loader = new ImageLoader($config.url, $config.key);
    try {
      // Prioritize thumb, fallback to clip
      src = await loader.load(item, 'thumb');
    } catch (e) {
      console.error("Failed to load thumb", e);
    } finally {
      loading = false;
    }
  });

  $: aspect = item.full ? `${item.full.width}/${item.full.height}` : '1/1';
</script>

<button 
  class="card btn-reset" 
  on:click={() => actions.openImage(item.hash)}
  aria-label={item.name}
>
  <div class="media-container" style="aspect-ratio: {aspect}">
    {#if src}
      <img {src} alt={item.name} loading="lazy" />
    {:else}
      <div class="skeleton"></div>
    {/if}
  </div>
  <div class="overlay">
    <div class="tags">
      {#each item.tags.slice(0, 3) as tag}
        <span class="pill">{tag}</span>
      {/each}
    </div>
  </div>
</button>

<style>
  .card {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: var(--c-card-bg);
    border: 1px solid var(--c-border);
    transition: transform 0.2s, border-color 0.2s;
    width: 100%;
  }
  .card:hover { transform: translateY(-4px); border-color: var(--c-light); }
  
  .media-container { width: 100%; background: #000; position: relative; }
  img { width: 100%; height: 100%; object-fit: cover; display: block; }
  
  .skeleton {
    width: 100%; height: 100%;
    background: linear-gradient(90deg, #1f2233, #2a2d40, #1f2233);
    background-size: 200% 100%;
    animation: shim 1.5s infinite;
  }
  
  .overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 8px;
    background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .card:hover .overlay { opacity: 1; }
  
  .pill { font-size: 0.7rem; background: rgba(238, 205, 142, 0.2); padding: 2px 6px; border-radius: 4px; margin-right: 4px; color: var(--c-light); }
  
  @keyframes shim { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>