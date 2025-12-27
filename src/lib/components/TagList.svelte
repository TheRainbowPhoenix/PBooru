<script>
  import { gallery, actions } from '../store';

  // Compute tag counts
  $: tagCounts = $gallery.reduce((acc, item) => {
    item.tags.forEach(t => {
      acc[t] = (acc[t] || 0) + 1;
    });
    return acc;
  }, {});

  $: sortedTags = Object.entries(tagCounts).sort((a,b) => b[1] - a[1]);
</script>

<div class="tag-grid">
  {#each sortedTags as [tag, count]}
    <button class="tag-card" on:click={() => actions.setFilter(tag)}>
      <span class="name">{tag}</span>
      <span class="count">{count}</span>
    </button>
  {/each}
</div>

<style>
  .tag-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; padding: 20px; }
  .tag-card {
    display: flex; justify-content: space-between;
    background: var(--c-card-bg);
    border: 1px solid var(--c-border);
    color: var(--c-text);
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .tag-card:hover { border-color: var(--c-light); }
  .count { color: #888; }
</style>