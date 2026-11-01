// Tailwind CSS v4 runs as a PostCSS plugin — there is no tailwind.config.js
// anymore. Configuration (plugins, theme) lives in src/app/globals.css instead.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
