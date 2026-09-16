# Automatisation Ansible - Dyna-Cloud (PaaS & SaaS)

Ce répertoire contient l'ensemble des recettes **Ansible (Configuration as Code)** de la plateforme **Dyna-Cloud**, responsables du cycle de vie complet des conteneurs applicatifs et de données.

---

## 1. Rôle dans l'Architecture DevOps

```
+---------------------+         +---------------------+         +---------------------+
|   TERRAFORM (IaC)   |  ===>   |    ANSIBLE (CaC)    |  ===>   |  DOCKER / RUNTIME   |
| Réseaux ESXi, VLANs |         | Recettes SGBD/Apps  |         | Conteneurs démarrés |
+---------------------+         +---------------------+         +---------------------+
```

* **Terraform** : Crée les Port Groups, VLANs étanches et machines virtuelles sur VMware ESXi.
* **Ansible** : Automatise l'installation, les volumes persistants, les réseaux Docker et le démarrage idempotent des conteneurs.

---

## 2. Arborescence du Projet

* `ansible.cfg` : Paramètres d'exécution globaux.
* `inventory/hosts.ini` : Inventaire des workers (`dbaas_servers`, `saas_servers`).
* `playbooks/` :
  * `setup-worker.yml` : Préparation système du nœud d'hébergement Docker.
  * `paas-deploy.yml` : Déploiement d'une base de données PaaS.
  * `paas-destroy.yml` : Suppression propre d'une base PaaS.
  * `saas-deploy.yml` : Déploiement d'une application SaaS.
  * `saas-destroy.yml` : Suppression propre d'une application SaaS.
* `roles/` :
  * `paas/` : Tâches pour PostgreSQL, MySQL, Redis, MongoDB.
  * `saas/` : Tâches pour phpMyAdmin, pgAdmin, WordPress, n8n, Mongo-Express, Redis-Commander.

---

## 3. Exemples d'Exécution Manuelle (CLI)

### Déployer une base PostgreSQL PaaS :
```bash
ansible-playbook -i inventory/hosts.ini playbooks/paas-deploy.yml --extra-vars '{
  "instance_name": "db_demo_postgres",
  "db_type": "postgresql",
  "db_name": "client_db",
  "db_user": "postgres_user",
  "db_pass": "SuperSecret123!",
  "external_port": 15432,
  "ram_limit": "1024m",
  "cpu_limit": "1.0"
}'
```

### Déployer une application WordPress SaaS :
```bash
ansible-playbook -i inventory/hosts.ini playbooks/saas-deploy.yml --extra-vars '{
  "instance_name": "saas_demo_wp",
  "app_type": "wordpress",
  "external_port": 28080,
  "wp_db_password": "WpPassword123!",
  "linked_paas": false
}'
```
