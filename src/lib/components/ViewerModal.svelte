<script>
  import { gallery, activeHash, config, actions } from '../store';
  import { ImageLoader } from '../loader';
  import { timeAgo, formatBytes } from '../utils';

  let item = null;
  let src = '';
  let isLoadingFull = false;
  let isFullView = false;
  let progress = 0;
  let loader = null;

  // Reactivity
  $: item = $gallery.find(i => i.hash === $activeHash) || null;
  
  // Load sequence when item changes
  $: if (item) loadSequence(item);

  // Lock Body Scroll when modal is open
  $: if (typeof document !== 'undefined') {
    document.body.style.overflow = item ? 'hidden' : '';
  }

  // Group Tags
  $: tagGroups = item ? groupTags(item.tags) : { artist: [], char: [], gen: [] };

  // Calculate Mobile Aspect Ratio Style
  $: stageStyle = getMobileStageStyle(item);

  function getMobileStageStyle(i) {
    if (!i || !i.full) return '';
    // Used only in mobile CSS via media query
    return `aspect-ratio: ${i.full.width} / ${i.full.height};`;
  }

  // Keyboard navigation
  const onKey = (e) => {
    if (e.key === 'Escape') actions.closeModal();
  };

  function groupTags(tags) {
    const g = { artist: [], char: [], gen: [] };
    tags.forEach(t => {
      if (t.startsWith('artist:')) g.artist.push(t.replace('artist:', ''));
      else if (t.startsWith('character:')) g.char.push(t.replace('character:', ''));
      else g.gen.push(t);
    });
    return g;
  }

  // Loading Logic
  async function loadSequence(targetItem) {
    src = '';
    progress = 0;
    isLoadingFull = false;
    isFullView = false;
    loader = new ImageLoader($config.url, $config.key);
    try {
      src = await loader.load(targetItem, 'clip');

      if (targetItem.clip?.bytes === targetItem.full?.bytes) {
        isFullView = true;
      }
    } catch(e) { /* ignore */ }
  }

  async function loadFull() {
    if(!item || isLoadingFull) return;
    isLoadingFull = true;
    try {
      const fullSrc = await loader.load(item, 'full', (p) => progress = p);
      src = fullSrc;
      isFullView = true; 
    } catch(e) {
      alert("Failed to decrypt full image");
    } finally {
      isLoadingFull = false;
    }
  }

  const filter = (tag) => {
    actions.closeModal();
    actions.setFilter(tag);
  };
</script>

<svelte:window on:keydown={onKey} />

{#if item}
  <div class="modal-backdrop" on:click|self={actions.closeModal}>
    <div class="modal-layout">
      
      <!-- LEFT SIDEBAR -->
      <aside class="sidebar" on:click|stopPropagation>
        
        <!-- Header with Close Button -->
        <div class="sidebar-top">
          <h2 class="tag-header">Details</h2>
          <button class="close-btn" on:click={actions.closeModal} aria-label="Close">×</button>
        </div>


        {#if tagGroups.artist.length}
          <h2 class="title tag-header artist">Artist</h2>
          <ul class="tag-list">
            {#each tagGroups.artist as t}
              <li><button on:click={() => filter(`artist:${t}`)}>{t}</button></li>
            {/each}
          </ul>
        {/if}

        {#if tagGroups.char.length}
          <h2 class="title tag-header char">Character</h2>
          <ul class="tag-list">
            {#each tagGroups.char as t}
              <li><button on:click={() => filter(`character:${t}`)}>{t}</button></li>
            {/each}
          </ul>
        {/if}

        <h2 class="title tag-header">General</h2>
        <ul class="tag-list">
          {#each tagGroups.gen as t}
            <li><button on:click={() => filter(t)}>{t}</button></li>
          {/each}
        </ul>

        
        <h2 class="title">Information</h2>

        <ul class="meta-list">
          <li><strong>Date:</strong> {timeAgo(item.date)}</li>
          <li>
            <strong>Size:</strong> 
            {formatBytes(item.full?.bytes)} ({item.full?.width}x{item.full?.height})
          </li>
          <li><strong>Rating:</strong> {item.rating}</li>
          {#if item.source}
            <li><strong>Source:</strong> <a href={item.source} target="_blank">Link</a></li>
          {/if}
        </ul>

        <div class="actions">
          {#if !isFullView}
            <button class="primary" on:click={loadFull} disabled={isLoadingFull}>
                {isLoadingFull ? `${Math.round(progress*100)}%` : 'Load Full Quality'}
            </button>
          {/if}
          <a href={src} download={item.name} class="btn secondary link">Download</a>
        </div>
      </aside>

      <!-- RIGHT IMAGE STAGE -->
      <div
        class="stage"
        style={stageStyle} 
        on:click|self={actions.closeModal}
       >
        {#if src}
          <img src={src} alt={item.name} />
        {:else}
          <div class="spinner"></div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,0.95);
    display: flex;
    overflow: hidden;
  }

  .modal-layout { 
    display: flex; 
    width: 100%; 
    height: 100%; 
  }

  /* SIDEBAR STYLING */
  .sidebar {
    width: 280px;
    background: #131420;
    border-right: 1px solid #333;
    padding: 20px;
    overflow-y: auto;
    font-size: 0.9rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sidebar-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* border-bottom: 2px solid #333; */
    padding-bottom: 8px;
  }

  .title { margin: 0; font-size: 1rem; color: #aaa; text-transform: uppercase; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .info-title { margin-top: 12px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  
  .close-btn {
    background: #333; border: none; color: #fff;
    width: 32px; height: 32px; border-radius: 4px;
    font-size: 1.5rem; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .close-btn:hover { background: #555; }
  .meta-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
  .meta-list li { color: #ccc; }
  .meta-list strong { color: #eecd8e; }
  .meta-list a { color: #88aaff; text-decoration: none; }

  .tag-header { margin: 12px 0 4px; font-size: 0.85rem; text-transform: uppercase; color: #888; }
  .tag-header.artist { color: #dd8888; }
  .tag-header.char { color: #88dd88; }

  .tag-list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 4px; }
  .tag-list button {
    background: none; border: none; color: #88aaff; 
    cursor: pointer; padding: 0; font-size: 0.9rem; text-align: left;
    max-width: 180px;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .tag-list button:hover { text-decoration: underline; color: #fff; }

  .actions { margin-top: auto; display: grid; gap: 8px; }

  /* STAGE (Desktop: Flex centered, fixed) */
  .stage { 
    flex: 1; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    overflow: hidden; 
    position: relative;
  }
  .stage img { 
    max-width: 100%; 
    max-height: 100%; 
    object-fit: contain; 
    box-shadow: 0 0 50px rgba(0,0,0,0.5);
  }

  /* --- MOBILE LAYOUT --- */
  @media(max-width: 900px) {
    /* Make the backdrop scrollable */
    .modal-backdrop {
      display: block; 
      overflow-y: auto; 
      -webkit-overflow-scrolling: touch;
    }

    .modal-layout { 
      display: flex; 
      flex-direction: column-reverse; 
      height: auto;
      min-height: 100%;
    }

    .stage {
      flex: none; /* Don't try to fill height */
      width: 100%;
      /* height is set via inline style (aspect-ratio) */
      max-height: 400vh; /* Limit for insane images */
      min-height: 40vh;
      background: #000;
    }

    .stage img {
      width: 100%;
      height: auto; /* Allow it to flow naturally */
      max-height: 400vh;
      min-height: 40vh;
      object-fit: contain;
    }

    /* Sidebar flows naturally at bottom */
    .sidebar { 
      width: 100%; 
      height: auto; 
      border-right: none; 
      border-top: 1px solid #333; 
      overflow: visible;
      position: relative;
      padding: .25rem 1rem;
      padding-bottom: 2rem;
    }

    .sidebar-top {
      position: sticky;
      background: #131420; z-index: 10; padding-top: 5px;
      top: 0;
      right: 0;
    }
  }
</style>