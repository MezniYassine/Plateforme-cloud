variable "esxi_host" {
  description = "Adresse IP ou FQDN du serveur VMware ESXi"
  type        = string
  default     = "192.168.8.132"
}

variable "esxi_user" {
  description = "Utilisateur administrateur de l'ESXi (généralement root)"
  type        = string
  default     = "root"
}

variable "esxi_password" {
  description = "Mot de passe administrateur de l'ESXi"
  type        = string
  sensitive   = true
}

variable "datacenter_name" {
  description = "Nom du Datacenter (par défaut 'ha-datacenter' sur un ESXi autonome)"
  type        = string
  default     = "ha-datacenter"
}

variable "datastore_name" {
  description = "Nom du datastore principal pour le stockage des disques"
  type        = string
  default     = "datastore1"
}

variable "vswitch_name" {
  description = "Nom du switch virtuel standard où brancher les Port Groups"
  type        = string
  default     = "vSwitch0"
}

variable "tenant_pool_size" {
  description = "Nombre de réseaux isolés dans le pool pour les clients (entreprises et particuliers)"
  type        = number
  default     = 100
}

variable "tenant_vlan_start" {
  description = "Premier VLAN ID utilisé pour le pool de tenants isolés"
  type        = number
  default     = 101
}
