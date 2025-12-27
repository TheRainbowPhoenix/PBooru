<script>
  import { onMount } from 'svelte';
  import { status, currentView, config, activeFilter, filteredGallery, actions } from '$lib/store';
  
  import Header from '$lib/components/Header.svelte';
  import ImageCard from '$lib/components/ImageCard.svelte';
  import ViewerModal from '$lib/components/ViewerModal.svelte';
  import TagList from '$lib/components/TagList.svelte';

  let localUrl = $config.url;
  let localKey = $config.key;

  onMount(() => {
    actions.init();
    
    // Check hash for direct linking
    if (window.location.hash.length > 1) {
      actions.openImage(window.location.hash.slice(1));
    }
  });

  function saveConfig() {
    config.set({ url: localUrl, key: localKey });
    actions.init();
  }
</script>

<Header />

<main>
  <!-- CONFIG SCREEN -->
  {#if $currentView === 'config'}
    <div class="panel">
      <h2>Configuration</h2>
      <label>Asset URL <input class="input-field" bind:value={localUrl} placeholder="https://example.com/enc" /></label>
      <label>XOR Key <input class="input-field" bind:value={localKey} type="password" /></label>
      <button class="primary" on:click={saveConfig}>Load Gallery</button>
      
      {#if $status === 'error'}
        <p style="color: #ff6b6b; margin-top: 1rem;">Failed to load manifest. Check console.</p>
      {/if}
      <p style="font-size: 0.8rem; opacity: 0.7; margin-top: 2rem;">
        Note: Key usage is client-side obfuscation only.
      </p>
    </div>

  <!-- GALLERY SCREEN -->
  {:else if $currentView === 'posts'}
    {#if $status === 'loading'}
      <div class="center-msg">Loading Library...</div>
    {:else}
      <div class="toolbar">
        {#if $activeFilter}
          <div class="filter-badge">
            Filter: <strong>{$activeFilter}</strong>
            <button on:click={() => actions.setFilter(null)}>×</button>
          </div>
        {/if}
        <div class="stats">{$filteredGallery.length} posts</div>
      </div>

      <div class="gallery-grid">
        {#each $filteredGallery as item (item.hash)}
          <ImageCard {item} />
        {/each}
      </div>
    {/if}

  <!-- TAGS SCREEN -->
  {:else if $currentView === 'tags'}
    <TagList />
  {/if}
</main>

<ViewerModal />

<style>
  main { padding: 20px; max-width: 1600px; margin: 0 auto; }
  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }
  .center-msg { text-align: center; margin-top: 50px; color: var(--c-light); }
  
  .toolbar { margin-bottom: 20px; display: flex; gap: 10px; align-items: center; }
  .filter-badge {
    background: var(--c-light); color: var(--c-dark);
    padding: 4px 12px; border-radius: 20px; display: flex; gap: 8px; align-items: center;
  }
  .filter-badge button { border: none; background: none; font-weight: bold; cursor: pointer; }
</style>