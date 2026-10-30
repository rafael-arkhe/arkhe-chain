terraform {
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}
variable "name" { type = string }
variable "kubernetes_version" { type = string }
variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "subnet_id" { type = string }
variable "administrator_group_ids" { type = list(string) }
resource "azurerm_kubernetes_cluster" "this" {
  name                              = var.name
  location                          = var.location
  resource_group_name               = var.resource_group_name
  dns_prefix                        = var.name
  kubernetes_version                = var.kubernetes_version
  private_cluster_enabled           = true
  local_account_disabled            = true
  oidc_issuer_enabled               = true
  workload_identity_enabled         = true
  role_based_access_control_enabled = true
  azure_active_directory_role_based_access_control {
    azure_rbac_enabled     = true
    admin_group_object_ids = var.administrator_group_ids
  }
  default_node_pool {
    name                 = "arkhe"
    node_count           = 3
    vm_size              = "Standard_D4s_v5"
    vnet_subnet_id       = var.subnet_id
    zones                = ["1", "2", "3"]
    auto_scaling_enabled = true
    min_count            = 2
    max_count            = 10
  }
  identity { type = "SystemAssigned" }
  network_profile {
    network_plugin = "azure"
    network_policy = "azure"
  }
  lifecycle {
    ignore_changes = [default_node_pool[0].node_count]
  }
}
output "cluster_id" { value = azurerm_kubernetes_cluster.this.id }
output "oidc_issuer_url" { value = azurerm_kubernetes_cluster.this.oidc_issuer_url }
