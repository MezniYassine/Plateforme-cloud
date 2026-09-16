data "vsphere_datacenter" "dc" {
  name = var.datacenter_name
}

data "vsphere_host" "host" {
  datacenter_id = data.vsphere_datacenter.dc.id
}

# 1. Réseau dédié pour les bases de données et services PaaS
resource "vsphere_host_port_group" "dbaas_pg" {
  name                = "PG-DBaaS-PaaS"
  host_system_id      = data.vsphere_host.host.id
  virtual_switch_name = var.vswitch_name
  vlan_id             = 50
}

# 2. Pool dynamique de réseaux isolés étanches (Multi-tenant Entreprises & Personnels)
# Chaque client (particulier ou entreprise) se voit attribuer son PROPRE réseau unique avec son propre VLAN.
# - Un utilisateur personnel a son propre VLAN étanche dédié, isolé de tous les autres particuliers et entreprises.
# - Une entreprise a son propre VLAN étanche dédié, partagé par tous ses collaborateurs.
resource "vsphere_host_port_group" "tenant_pool" {
  count = var.tenant_pool_size

  name                = format("PG-Tenant-%02d", count.index + 1)
  host_system_id      = data.vsphere_host.host.id
  virtual_switch_name = var.vswitch_name
  vlan_id             = var.tenant_vlan_start + count.index
}

# 3. Port Group Trunk (VLAN 4095) pour la passerelle Cloud-Gateway
# Le VLAN 4095 (VGT - Virtual Guest Tagging) transmet tous les flux 802.1Q (VLAN 101 à 130)
# sur la deuxième interface réseau de la passerelle Cloud.
resource "vsphere_host_port_group" "gateway_trunk_pg" {
  name                = "PG-Cloud-Gateway-Trunk"
  host_system_id      = data.vsphere_host.host.id
  virtual_switch_name = var.vswitch_name
  vlan_id             = 4095
}

