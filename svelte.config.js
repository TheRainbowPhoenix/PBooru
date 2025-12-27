import adapter from '@sveltejs/adapter-static';

const dev = process.env.NODE_ENV === 'development';

// For project pages, this should be "/PBooru"
const base = dev ? '' : (process.env.BASE_PATH ?? '/PBooru');

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    paths: {
      base
    }
  }
};

export default config;
