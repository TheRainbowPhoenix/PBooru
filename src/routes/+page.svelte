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
  let lastScrollY = 0;
  
  // Mobile UI State
  let showUI = true; // Tracks scroll direction
  let mobileDrawerOpen = false;

  // -- PAGINATION LOGIC --
  $: totalPages = Math.ceil($filteredGallery.length / itemsPerPage);
  
  // Decide which items to render based on mode
  $: displayItems = $isPaginated 
    ? $filteredGallery.slice(($currentPage - 1) * itemsPerPage, $currentPage * itemsPerPage)
    : $filteredGallery.slice(0, infiniteLimit);

  // -- INFINITE SCROLL HANDLER --
  function onScroll() {
    const currentY = window.scrollY;
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

    // 1. Direction Detection for UI Visibility
    if (currentY > lastScrollY && currentY > 60) {
      showUI = false; // Scrolling Down
      mobileDrawerOpen = false; // Close drawer on scroll down
    } else {
      showUI = true; // Scrolling Up
    }
    
    // Always show if at bottom (to allow pagination access)
    if (currentY + clientHeight >= scrollHeight - 50) {
      showUI = true;
    }

    lastScrollY = currentY;
    if ($isPaginated) return;
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
     if (!$isPaginated  && infiniteLimit < itemsPerPage) infiniteLimit = itemsPerPage; 
  }

  // Handle Switch Toggle
  function handleModeToggle() {
    actions.toggleMode();
    if ($isPaginated) {
      window.scrollTo(0, 0);
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

    // LISTENER: Handle Browser Back/Forward Buttons
    const onPopState = () => {
      actions.readUrlState();
      // If closing modal via back button
      if (!window.location.hash) actions.closeModal(); 
    };

    window.addEventListener('scroll', onScroll);
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('popstate', onPopState);
    };
  });

  function saveConfig() {
    config.set({ url: localUrl, key: localKey });
    actions.init();
  }
</script>

<!-- HEADER (Slides up on mobile) -->
<div class="header-wrapper {showUI ? '' : 'nav-hidden'}">
  <Header />
</div>

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
    <div class="toolbar desktop-only">
        
      <div class="left">

        {#if $activeFilter}
          <span class="md-hidden">Filter: </span>
          <div class="filter-badge">
            <strong>{$activeFilter}</strong>
            <button on:click={() => actions.setFilter(null)}>×</button>
          </div>
        {/if}
        <div class="stats">{$filteredGallery.length} <span class="md-hidden">posts</span></div>
      </div>
      
      <!-- PAGINATION CONTROLS -->
      <div class="center">
        {#if $isPaginated}
          <button disabled={$currentPage===1} on:click={() => actions.setPage($currentPage-1)}>«</button>
          <span class="md-hidden">Page {$currentPage} of {totalPages}</span>
          <span class="md-visible">{$currentPage}</span>
          <button disabled={$currentPage===totalPages} on:click={() => actions.setPage($currentPage+1)}>»</button>
        {/if}
      </div>

      <div class="right">
        <label class="switch">
          <input type="checkbox" checked={$isPaginated} on:change={handleModeToggle}>
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

  

  {#if $isPaginated}
    <div class="bottom-section">
      <div class="pagination-row md-visible">
        <button disabled={$currentPage===1} on:click={() => actions.setPage($currentPage-1)}>Previous</button>
        <span>{$currentPage} / {totalPages}</span>
        <button disabled={$currentPage===totalPages} on:click={() => actions.setPage($currentPage+1)}>Next</button>
      </div>

    </div>
  {/if}

</main>

<!-- MOBILE FLOATING ACTION BUTTON (Slides down on scroll) -->
{#if $currentView === 'posts'}
  <button 
    class="mobile-fab {showUI ? '' : 'nav-hidden'}" 
    on:click={() => mobileDrawerOpen = !mobileDrawerOpen}
    aria-label="Options"
  >
    <!-- Simple Icon for settings/filter -->
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
      <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
      <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line>
      <line x1="17" y1="16" x2="23" y2="16"></line>
    </svg>
    {#if $activeFilter}<span class="dot"></span>{/if}
  </button>
{/if}
<!-- MOBILE BOTTOM DRAWER -->
{#if mobileDrawerOpen && $currentView === 'posts'}
  <div class="drawer-backdrop" on:click={() => mobileDrawerOpen = false}></div>
  <div class="drawer">
    <div class="drawer-header">
      <h3>Options</h3>
      <button on:click={() => mobileDrawerOpen = false}>Close</button>
    </div>
    
    <div class="drawer-content">
      <!-- Filter Section -->
      <div class="drawer-section">
        <div class="section-label">Active Filter</div>
        {#if $activeFilter}
          <div class="filter-badge large">
            <strong>{$activeFilter}</strong>
            <button on:click={() => actions.setFilter(null)}>Remove</button>
          </div>
        {:else}
          <div class="empty-state">No tags selected</div>
        {/if}
      </div>

      <!-- View Mode Section -->
      <div class="drawer-section">
        <div class="section-label">View Mode</div>
        <div class="toggle-row">
          <span>Infinite Scroll</span>
          <label class="switch">
            <input type="checkbox" checked={$isPaginated} on:change={handleModeToggle}>
            <span class="slider"></span>
          </label>
          <span>Pages</span>
        </div>
      </div>

      <!-- Pagination Controls (Only if Pages mode) -->
      {#if $isPaginated}
        <div class="drawer-section">
          <div class="section-label">Navigation</div>
          <div class="pagination-row">
            <button disabled={$currentPage===1} on:click={() => actions.setPage($currentPage-1)}>Previous</button>
            <span>{$currentPage} / {totalPages}</span>
            <button disabled={$currentPage===totalPages} on:click={() => actions.setPage($currentPage+1)}>Next</button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
<ViewerModal />

<style>

  /* Header Wrapper for sliding animation */
  .header-wrapper {
    position: sticky; top: 0; z-index: 10;
    transition: transform 0.3s ease;
  }
  .header-wrapper.nav-hidden { transform: translateY(-100%); }

  
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

  /* --- MOBILE SPECIFIC --- */
  .mobile-fab { display: none; }
  .drawer { display: none; }

  @media (max-width: 900px) {
    .desktop-only { display: none !important; }

    .toolbar {
      padding: .25rem .5rem;
    }

    .filter-badge { 
      justify-content: space-between;
    }

    /* Floating Action Button */
    .mobile-fab {
      display: flex; align-items: center; justify-content: center;
      position: fixed; bottom: 20px; right: 20px; z-index: 40;
      width: 56px; height: 56px;
      border-radius: 50%; background: #eecd8e; color: #131420;
      border: none; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      transition: transform 0.3s ease;
    }
    .mobile-fab.nav-hidden { transform: translateY(150%); }
    .mobile-fab .dot { position: absolute; top: 12px; right: 14px; width: 8px; height: 8px; background: #d00; border-radius: 50%; }

    /* Bottom Drawer */
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 49; animation: fadein 0.2s; }
    .drawer {
      display: block; position: fixed; bottom: 0; left: 0; right: 0; z-index: 50;
      background: #1b1e2e; border-top: 1px solid #333;
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
      animation: slideup 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .drawer-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .drawer-header h3 { margin: 0; color: #fff; }
    .drawer-header button { background: none; border: none; color: #eecd8e; font-weight: bold; }

    .drawer-content { padding: 24px; display: flex; flex-direction: column; gap: 24px; }
    
    .drawer-section { display: flex; flex-direction: column; gap: 10px; }
    .section-label { font-size: 0.85rem; text-transform: uppercase; color: #888; font-weight: bold; }
    .empty-state { color: #555; font-style: italic; }

    .toggle-row { display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; }
    
    .pagination-row { display: flex; justify-content: space-between; align-items: center; }
    .pagination-row button { background: #333; color: white; border: none; padding: 10px 20px; border-radius: 8px; }
    .pagination-row button:disabled { opacity: 0.3; }
  }

  @keyframes slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
</style>