export const environment = {
  production: false,
  /**
   * Base path for the Nest API. With `ng serve`, `proxy.conf.json` forwards
   * `/api/*` → `http://localhost:3000/*` so the browser stays same-origin and sends JSON reliably.
   * For a production build behind your own host, set this to the public API origin (no trailing slash).
   */
  apiBaseUrl: '/api',
};
