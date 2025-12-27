<script>
  import { currentView } from '../store';
  let menuOpen = false;
</script>

<header>
  <div class="logo">PB<span class="text-accent">ooru</span></div>

  <!-- Desktop Nav -->
  <nav class="desktop-nav">
    <button class:active={$currentView === 'posts'} on:click={() => $currentView = 'posts'}>Posts</button>
    <button class:active={$currentView === 'tags'} on:click={() => $currentView = 'tags'}>Tags</button>
    <button class:active={$currentView === 'config'} on:click={() => $currentView = 'config'}>Config</button>
  </nav>

  <!-- Mobile Nav Toggle -->
  <button class="hamburger btn-reset" on:click={() => menuOpen = !menuOpen}>
    <span></span><span></span><span></span>
  </button>

  {#if menuOpen}
    <div class="mobile-menu">
      <button on:click={() => { $currentView = 'posts'; menuOpen = false; }}>Posts</button>
      <button on:click={() => { $currentView = 'tags'; menuOpen = false; }}>Tags</button>
      <button on:click={() => { $currentView = 'config'; menuOpen = false; }}>Config</button>
    </div>
  {/if}
</header>

<style>
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: rgba(12, 14, 24, 0.9);
    border-bottom: 1px solid var(--c-border);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .logo { font-size: 1.5rem; font-weight: bold; letter-spacing: 2px; }
  
  nav button {
    background: transparent;
    border: 1px solid transparent;
    color: var(--c-text);
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    margin-left: 8px;
  }
  nav button:hover { border-color: var(--c-border); }
  nav button.active { background: var(--c-light); color: var(--c-dark); }

  .desktop-nav { display: none; }
  @media (min-width: 768px) {
    .desktop-nav { display: block; }
    .hamburger { display: none; }
  }

  .hamburger { display: flex; flex-direction: column; gap: 5px; width: 30px; }
  .hamburger span { height: 2px; background: var(--c-text); width: 100%; }

  .mobile-menu {
    position: absolute;
    top: 100%; right: 0;
    background: var(--c-dark);
    border: 1px solid var(--c-border);
    padding: 10px;
    display: flex; flex-direction: column; gap: 5px;
    width: 200px;
  }
  .mobile-menu button { padding: 10px; text-align: left; background: none; border: none; color: white; }
</style>