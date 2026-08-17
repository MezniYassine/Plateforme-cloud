export enum SaasAppType {
  PHPMYADMIN = 'phpmyadmin/phpmyadmin:latest',
  PGADMIN = 'dpage/pgadmin4:latest',
  WORDPRESS = 'wordpress:latest',
  N8N = 'n8nio/n8n:latest',
}

export const SAAS_APP_OPTIONS = [
  { key: SaasAppType.WORDPRESS, label: 'WordPress', icon: 'wordpress', color: '#21759b', bg: '#e3f2fd', desc: 'CMS pour créer des sites web et blogs' },
  { key: SaasAppType.PHPMYADMIN, label: 'phpMyAdmin', icon: 'phpmyadmin', color: '#f89b24', bg: '#fff8e1', desc: 'Interface web pour gérer MySQL', needsPaas: true, paasType: 'MYSQL' },
  { key: SaasAppType.PGADMIN, label: 'pgAdmin', icon: 'pgadmin', color: '#326690', bg: '#e8f4fd', desc: 'Interface web pour gérer PostgreSQL', needsPaas: true, paasType: 'POSTGRESQL' },
  { key: SaasAppType.N8N, label: 'n8n', icon: 'n8n', color: '#ea4b71', bg: '#fce4ec', desc: 'Automatisation de workflows' },
];
