<script>
  import { onMount } from 'svelte';
  import { status, currentView, config, activeFilter, filteredGallery, actions, isPaginated, currentPage, itemsPerPage } from '$lib/store';
  
  import Header from '$lib/components/Header.svelte';
  import ImageCard from '$lib/components/ImageCard.svelte';
  import PostCard from '$lib/components/PostCard.svelte';
  import ViewerModal from '$lib/components/ViewerModal.svelte';
  import TagList from '$lib/components/TagList.svelte';

  
  // State
  let infiniteLimit = itemsPerPage; // How many items shown in infinite mode
  let scrollY = 0; // Remembers scroll position

  // -- PAGINATION LOGIC --
  $: totalPages = Math.ceil($filteredGallery.length / itemsPerPage);
  
  // Decide which items to render based on mode
  $: displayItems = $isPaginated 
    ? $filteredGallery.slice(($currentPage - 1) * itemsPerPage, $currentPage * itemsPerPage)
    : $filteredGallery.slice(0, infiniteLimit);

  // -- INFINITE SCROLL HANDLER --
  function onScroll() {
    if ($isPaginated) return;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    // Save scroll position
    scrollY = scrollTop; 
    
    // Load more when close to bottom
    if (scrollTop + clientHeight > scrollHeight - 300) {
      if (infiniteLimit < $filteredGallery.length) {
        infiniteLimit += 20;
      }
    }
  }
  
  // Reset Infinite limit when filter changes
  $: if ($filteredGallery) {
     if (!$isPaginated) infiniteLimit = itemsPerPage; 
  }

  function toggleMode() {
    isPaginated.update(v => !v);
    if ($isPaginated) {
      window.scrollTo(0, 0); // Reset scroll for pages
    } else {
      // Restore infinite scroll pos (approximate)
      setTimeout(() => window.scrollTo(0, scrollY), 10);
    }
  }

  let localUrl = $config.url;
  let localKey = $config.key;

  onMount(() => {
    actions.init();
    
    // Check hash for direct linking
    if (window.location.hash.length > 1) {
      actions.openImage(window.location.hash.slice(1));
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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
      <label>Asset URL <input class="input-field" bind:value={$config.url} /></label>
      <label>XOR Key <input class="input-field" bind:value={$config.key} type="password" /></label>
      <button class="primary" on:click={actions.init}>Save & Reload</button>
      
      <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
      
      <h3 style="color: #ff6b6b">Danger Zone</h3>
      <button class="danger" on:click={actions.factoryReset}>Factory Reset / Clear Cache</button>
    </div>

  <!-- GALLERY SCREEN -->
  {:else if $currentView === 'posts'}
    <div class="toolbar">
        
      <div class="left">

        {#if $activeFilter}
          <span>Filter: </span>
          <div class="filter-badge">
            <strong>{$activeFilter}</strong>
            <button on:click={() => actions.setFilter(null)}>×</button>
          </div>
        {/if}
        <div class="stats">{$filteredGallery.length} posts</div>
      </div>
      
      <!-- PAGINATION CONTROLS -->
      <div class="center">
        {#if $isPaginated}
          <button disabled={$currentPage===1} on:click={() => actions.setPage($currentPage-1)}>«</button>
          <span>Page {$currentPage} of {totalPages}</span>
          <button disabled={$currentPage===totalPages} on:click={() => actions.setPage($currentPage+1)}>»</button>
        {/if}
      </div>

      <div class="right">
        <label class="switch">
          <input type="checkbox" checked={$isPaginated} on:change={toggleMode}>
          <span class="slider"></span>
        </label>
        <span class="mode-label">{$isPaginated ? 'Pages' : 'Scroll'}</span>
      </div>
    </div>

    <div class="gallery-grid">
      {#each displayItems as item (item.hash)}
        <PostCard {item} />
      {/each}
    </div>

    {#if !$isPaginated && infiniteLimit < $filteredGallery.length}
      <div class="loading-more">Loading more...</div>
    {/if}

  <!-- TAGS SCREEN -->
  {:else if $currentView === 'tags'}
    <TagList />
  {/if}
</main>

<ViewerModal />

<style>
  main { padding: 20px; max-width: 1800px; margin: 0 auto; }
  
  .toolbar {
    display: flex; justify-content: space-between; align-items: center;
    background: #1b1e2e; padding: 10px 20px; border-radius: 8px; margin-bottom: 20px;
    position: sticky; top: 70px; z-index: 5;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
  }

  .gallery-grid {
    display: grid;
    /* Forces columns to be at least 200px wide, filling the space */
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
  }

  .left {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  button.danger {
    background: #552222; color: #ffcccc; width: 100%; border: none; padding: 12px; border-radius: 8px; cursor: pointer;
  }
  button.danger:hover { background: #772222; }

  .filter-badge {
    background: var(--c-light); color: var(--c-dark);
    padding: 4px 12px; border-radius: 20px; display: flex; gap: 8px; align-items: center;
  }
  .filter-badge button { border: none; background: none; font-weight: bold; cursor: pointer; padding: 0; }

  /* Switch Toggle */
  .switch { position: relative; display: inline-block; width: 40px; height: 20px; vertical-align: middle; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; inset: 0; background-color: #333; transition: .4s; border-radius: 20px; }
  .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .4s; border-radius: 50%; }
  input:checked + .slider { background-color: #eecd8e; }
  input:checked + .slider:before { transform: translateX(20px); }
  
  .mode-label { font-size: 0.8rem; margin-left: 8px; }
  .center button { background: #333; color: white; border: none; padding: 4px 12px; cursor: pointer; border-radius: 4px; }
  .center button:disabled { opacity: 0.3; }
  .loading-more { text-align: center; padding: 20px; opacity: 0.5; }
</style>