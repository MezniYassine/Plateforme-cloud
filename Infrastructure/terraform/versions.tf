terraform {
  required_version = ">= 1.5.0"

  required_providers {
    vsphere = {
      source  = "hashicorp/vsphere"
      version = "~> 2.7.0"
    }
  }
}

provider "vsphere" {
  user                 = var.esxi_user
  password             = var.esxi_password
  vsphere_server       = var.esxi_host
  allow_unverified_ssl = true
}
