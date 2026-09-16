output "datacenter_id" {
  description = "Identifiant du Datacenter ESXi"
  value       = data.vsphere_datacenter.dc.id
}

output "host_id" {
  description = "Identifiant de l'hôte ESXi"
  value       = data.vsphere_host.host.id
}

output "dbaas_network" {
  description = "Réseau dédié pour le worker DBaaS / PaaS"
  value = {
    name    = vsphere_host_port_group.dbaas_pg.name
    vlan_id = vsphere_host_port_group.dbaas_pg.vlan_id
  }
}

output "tenant_pool_summary" {
  description = "Résumé du pool de réseaux multi-tenants isolés"
  value = {
    total_networks = length(vsphere_host_port_group.tenant_pool)
    vlan_range     = "${var.tenant_vlan_start} à ${var.tenant_vlan_start + var.tenant_pool_size - 1}"
    networks = [
      for pg in vsphere_host_port_group.tenant_pool : {
        name    = pg.name
        vlan_id = pg.vlan_id
      }
    ]
  }
}
