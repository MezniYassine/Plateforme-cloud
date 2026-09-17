# Infrastructure as Code (IaC) - Terraform pour Dynamix

Ce dossier contient l'infrastructure sous-jacente (**Undercloud**) de la plateforme Cloud **Dynamix**, gérée par **Terraform**.

## 1. Objectifs
- **Automatisation** : Déploiement automatique du réseau et des serveurs socles sur VMware ESXi en une seule commande.
- **Sécurité Multi-tenant** : Création automatique de **Port Groups isolés avec VLANs** (`PG-Entreprise-Alpha`, `PG-Entreprise-Beta`, `PG-DBaaS-PaaS`).
- **Reproductibilité** : Permet de reconstruire l'infrastructure complète de démonstration de zéro sans manipulation manuelle dans l'interface web ESXi.

---

## 2. Structure des Fichiers

| Fichier | Description |
| :--- | :--- |
| `versions.tf` | Configuration de la version minimale de Terraform et du provider `hashicorp/vsphere`. |
| `variables.tf` | Définition des variables paramétrables (Hôte ESXi, identifiants, VLANs). |
| `terraform.tfvars` | Valeurs de configuration concrètes pour le serveur ESXi. *(Ignoré par Git pour la sécurité)* |
| `terraform.tfvars.example` | Exemple de gabarit pour renseigner vos identifiants. |
| `networks.tf` | Déclaration et provisioning des réseaux isolés (VLANs) sur le switch virtuel `vSwitch0`. |
| `vms_base.tf` | Définition de la VM socle de gestion de bases de données (**DBaaS**). |
| `outputs.tf` | Restitution des identifiants et des noms de réseaux créés. |

---

## 3. Commandes Usuelles

### Initialiser Terraform
```bash
terraform init
```

### Prévisualiser les changements (Plan)
```bash
terraform plan
```

### Appliquer les changements (Provisioning réel)
```bash
terraform apply -auto-approve
```

### Détruire les ressources créées (Nettoyage de lab)
```bash
terraform destroy
```

---

## 4. Réseaux Isolés Provisionnés sur l'ESXi (Multi-tenant Entreprises & Personnels)

> [!NOTE]
> **Règles d'isolation multi-tenant :**
> - **Chaque particulier (`RoleClient.PERSONNEL`)** : Reçoit son **propre Port Group / VLAN dédié** dans le pool Terraform. Deux particuliers différents ne partagent jamais le même VLAN.
> - **Chaque entreprise (`ENTREPRISE_ADMIN` / `ENTREPRISE_USER`)** : Reçoit son **propre Port Group / VLAN dédié** dans le pool Terraform, partagé entre les collaborateurs de cette entreprise.
> - **Idempotence** : Lorsqu'un particulier ou une entreprise possède déjà des machines, toutes ses nouvelles machines rejoignent automatiquement son réseau privé existant.

| Nom du Port Group | VLAN ID | Rôle |
| :--- | :---: | :--- |
| `PG-DBaaS-PaaS` | **50** | Réseau réservé à l'hébergement des bases de données PaaS |
| `PG-Tenant-01` à `PG-Tenant-100` | **101** à **200** | Pool de réseaux privés étanches attribués dynamiquement (chaque particulier son VLAN, chaque entreprise son VLAN) |

---

## 5. Plan d'Adressage IP Statique par VLAN (Option A)

Chaque Port Group dispose de son propre sous-réseau privé `/24`. Le backend Dynamix (`TenantNetworkService`) attribue automatiquement les adresses IP séquentielles libres dès le provisionnement de la machine :

| Port Group | VLAN | Sous-réseau (CIDR) | Passerelle réservée | Plage d'adresses pour les VMs |
| :--- | :---: | :---: | :---: | :---: |
| `PG-DBaaS-PaaS` | 50 | `10.50.0.0/24` | `10.50.0.1` | `10.50.0.10` à `10.50.0.250` |
| `PG-Tenant-01` | 101 | `10.101.0.0/24` | `10.101.0.1` | `10.101.0.10` à `10.101.0.250` |
| `PG-Tenant-02` | 102 | `10.102.0.0/24` | `10.102.0.1` | `10.102.0.10` à `10.102.0.250` |
| `PG-Tenant-XX` | `100+XX` | `10.{100+XX}.0.0/24` | `10.{100+XX}.0.1` | `10.{100+XX}.0.10` à `10.{100+XX}.0.250` |

* **Masque de sous-réseau** : `255.255.255.0` (`/24`)
* **Réservations** : `.1` à `.9` pour la passerelle / routeur virtuel futur, `.10`+ pour les machines virtuelles des utilisateurs.



