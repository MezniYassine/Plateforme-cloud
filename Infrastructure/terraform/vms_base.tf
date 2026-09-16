# ==============================================================================
# Machine Virtuelle Socle "DBaaS Worker"
# ==============================================================================
# Cette ressource décrit l'instance worker DBaaS qui héberge les conteneurs 
# Docker pour le PaaS (PostgreSQL, MySQL, Redis, MongoDB).
# ==============================================================================

# Lecture du Datastore de destination
data "vsphere_datastore" "ds" {
  name          = var.datastore_name
  datacenter_id = data.vsphere_datacenter.dc.id
}

# Lecture du Resource Pool par défaut de l'hôte
data "vsphere_resource_pool" "pool" {
  datacenter_id = data.vsphere_datacenter.dc.id
}

# Documentation du gabarit socle DBaaS
# Note : Peut être instancié ou cloné à partir d'un template socle existant
/*
resource "vsphere_virtual_machine" "dbaas_worker" {
  name             = "DBaaS"
  resource_pool_id = data.vsphere_resource_pool.pool.id
  datastore_id     = data.vsphere_datastore.ds.id

  num_cpus = 2
  memory   = 4096
  guest_id = "ubuntu64Guest"

  network_interface {
    network_id = vsphere_host_port_group.enterprise_pg["DBaaS-PaaS"].id
  }

  disk {
    label = "disk0"
    size  = 40
  }
}
*/
