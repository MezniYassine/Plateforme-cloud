export const environment = {
  production: true,
  /**
   * En production Docker, le serveur SSR Angular tourne dans son propre container.
   * Il appelle le backend NestJS via le réseau interne Docker (nom du service).
   * Le navigateur, lui, passe par le proxy Nginx ou directement par le port exposé.
   */
  apiBaseUrl: 'http://backend:3000',
};
