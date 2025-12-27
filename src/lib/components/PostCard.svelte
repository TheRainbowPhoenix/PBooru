<script>
  import { onMount } from 'svelte';
  import { config, actions } from '../store';
  import { ImageLoader } from '../loader';

  export let item;
  
  let src = '';
  let el; // DOM Reference
  let loaded = false;

  // Danbooru-like data string construction
  $: tagString = item.tags.join(' ');
  $: dataTitle = `${tagString} rating:${item.rating}`;
  
  // Calculate aspect ratio for layout prevention
  $: width = item.full?.width || 200;
  $: height = item.full?.height || 200;
  $: aspectRatio = `${width}/${height}`;

  onMount(() => {
    // Intersection Observer for efficient "Decrypt on Scroll"
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadImage();
        observer.disconnect();
      }
    }, { rootMargin: "200px" }); // Start loading 200px before it hits view

    if (el) observer.observe(el);

    return () => observer.disconnect();
  });

  async function loadImage() {
    const loader = new ImageLoader($config.url, $config.key);
    try {
      // Priority: Thumb -> Clip -> Full fallback
      src = await loader.load(item, 'thumb');
      loaded = true;
    } catch (e) {
      console.error("Load failed", e);
    }
  }
</script>

<article 
  bind:this={el}
  id={`post_${item.hash.slice(0,6)}`}
  class="post-preview"
  data-id={item.hash}
  data-tags={tagString}
  data-rating={item.rating}
  style="aspect-ratio: {aspectRatio};"
>
  <div class="post-preview-container">
    <a 
      class="post-preview-link" 
      href="#{item.hash}" 
      on:click|preventDefault={() => actions.openImage(item.hash)}
      draggable="false"
    >
      {#if src}
        <img 
          {src} 
          class="post-preview-image" 
          title={dataTitle}
          alt={tagString}
          draggable="false"
          {width} {height}
        />
      {:else}
        <div class="skeleton"></div>
      {/if}

      <!-- RESTORED OVERLAY -->
      <div class="overlay">
        <div class="tags">
          {#each item.tags.slice(0, 4) as tag}
            <span class="pill">{tag}</span>
          {/each}
          {#if item.tags.length > 4}
            <span class="pill">+{item.tags.length - 4}</span>
          {/if}
        </div>
      </div>
    </a>
  </div>
</article>

<style>
  /* Danbooru-ish Compact Style */
  .post-preview {
    position: relative;
    display: block;
    overflow: hidden;
    width: 100%; 
    height: 250px; 
    border-radius: 8px;
    background-color: var(--c-panel);
    border: 1px solid transparent;
    transition: transform 0.2s, border-color 0.2s;
  }
  
  .post-preview:hover {
    border-color: var(--c-light);
    transform: translateY(-2px);
    z-index: 2;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  .post-preview-container {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .post-preview-link {
    display: block;
    width: 100%;
    height: 100%;
    position: relative; /* Anchor for absolute overlay */
  }

  .post-preview-image {
    width: 100%;
    height: 100%;
    object-fit: contain; /* or contain, depending on preference */
    display: block;
  }

  .skeleton {
    width: 100%; height: 100%;
    background: linear-gradient(90deg, #1f2233, #2a2d40, #1f2233);
    background-size: 200% 100%;
    animation: shim 1.5s infinite;
  }
  @keyframes shim { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Overlay on Hover */
  .overlay {
    position: absolute; 
    bottom: 0; left: 0; right: 0;
    padding: 8px;
    background: linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.6) 70%, transparent);
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none; /* Let clicks pass through to link */
  }

  .post-preview:hover .overlay {
    opacity: 1;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-start;
  }

  .pill {
    font-size: 0.7rem;
    background: rgba(238, 205, 142, 0.2); 
    border: 1px solid rgba(238, 205, 142, 0.3);
    padding: 2px 6px; 
    border-radius: 4px; 
    color: var(--c-light);
    /* backdrop-filter: blur(2px); */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
</style>