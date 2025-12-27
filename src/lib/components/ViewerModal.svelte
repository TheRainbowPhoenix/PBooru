<script>
  import { gallery, activeHash, config, actions } from '../store';
  import { ImageLoader } from '../loader';
  import { onMount, onDestroy } from 'svelte';

  let item = null;
  let src = '';
  let isLoadingFull = false;
  let progress = 0;
  let loader = null;

  // Find item when hash changes
  $: {
    item = $gallery.find(i => i.hash === $activeHash) || null;
    if(item) loadSequence(item);
  }

  // Keyboard navigation
  const onKey = (e) => {
    if (e.key === 'Escape') actions.closeModal();
  };

  async function loadSequence(targetItem) {
    src = '';
    progress = 0;
    isLoadingFull = false;
    loader = new ImageLoader($config.url, $config.key);

    // 1. Load Clip (High quality preview) immediately
    try {
      src = await loader.load(targetItem, 'clip');
    } catch(e) { /* Ignore, maybe try thumb */ }
    
    // Auto load full after short delay or via manual trigger?
    // Let's do manual trigger via button, or auto if cached.
  }

  async function loadFull() {
    if(!item || isLoadingFull) return;
    isLoadingFull = true;
    try {
      const fullSrc = await loader.load(item, 'full', (p) => progress = p);
      src = fullSrc;
    } catch(e) {
      alert("Failed to decrypt full image");
    } finally {
      isLoadingFull = false;
    }
  }

  function filterBy(tag) {
    actions.closeModal();
    actions.setFilter(tag);
  }
</script>

<svelte:window on:keydown={onKey} />

{#if item}
  <div class="modal-backdrop" on:click|self={actions.closeModal}>
    <div class="modal-layout">
      
      <!-- Left: Image Stage -->
      <div class="stage" on:click|self={actions.closeModal}>
        {#if src}
          <img {src} alt={item.name} style="aspect-ratio: {item.full?.width}/{item.full?.height}" />
        {:else}
          <div class="spinner"></div>
        {/if}
        
        {#if isLoadingFull}
          <div class="progress-bar"><div style="width: {progress*100}%"></div></div>
        {/if}
      </div>

      <!-- Right: Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <button class="btn-reset close-btn" on:click={actions.closeModal}>&times;</button>
          <h3>Metadata</h3>
        </div>

        <div class="meta-row">
          <strong>Hash:</strong> <code>{item.hash.slice(0, 8)}...</code>
        </div>
        <div class="meta-row">
          <strong>Size:</strong> {item.full?.width}x{item.full?.height}
        </div>

        <div class="tags-section">
          {#each item.tags as tag}
            <button class="tag-btn" on:click={() => filterBy(tag)}>{tag}</button>
          {/each}
        </div>

        <div class="actions">
          <button class="primary" on:click={loadFull} disabled={isLoadingFull}>
            {isLoadingFull ? 'Decrypting...' : 'Load Full Quality'}
          </button>
          <a href={src} download={item.name + '.' + item.full.ext} class="btn secondary">Download Displayed</a>
        </div>
      </aside>

    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.9);
    display: flex;
  }
  .modal-layout { display: flex; width: 100%; height: 100%; }
  
  .stage {
    flex: 1;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    position: relative;
  }
  .stage img {
    max-width: 100%; max-height: 100%;
    object-fit: contain;
    box-shadow: 0 0 50px rgba(0,0,0,0.5);
  }

  .sidebar {
    width: 320px;
    background: var(--c-modal-bg);
    border-left: 1px solid var(--c-border);
    padding: 20px;
    display: flex; flex-direction: column; gap: 16px;
    overflow-y: auto;
  }
  
  .tag-btn {
    display: block; width: 100%; text-align: left;
    background: rgba(255,255,255,0.05);
    border: none; color: var(--c-light);
    padding: 6px 10px; margin-bottom: 4px;
    border-radius: 4px; cursor: pointer;
  }
  .tag-btn:hover { background: rgba(255,255,255,0.1); }

  .progress-bar {
    position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: #333;
  }
  .progress-bar > div { height: 100%; background: var(--c-light); transition: width 0.1s; }

  .close-btn { font-size: 2rem; color: var(--c-text); }
  .sidebar-header { display: flex; justify-content: space-between; align-items: center; }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  @media (max-width: 800px) {
    .modal-layout { flex-direction: column; }
    .sidebar { width: 100%; height: 40%; border-left: none; border-top: 1px solid var(--c-border); }
  }
</style>