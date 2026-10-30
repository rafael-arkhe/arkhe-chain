terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}
provider "aws" { region = "us-east-1" }
provider "azurerm" {
  features {}
}

variable "name" { type = string }
variable "eks_version" { type = string }
variable "aks_version" { type = string }
variable "aws_vpc_id" { type = string }
variable "aws_subnet_ids" { type = list(string) }
variable "aws_administrator_role_arn" { type = string }
variable "azure_subnet_id" { type = string }
variable "azure_administrator_group_ids" { type = list(string) }
variable "azure_resource_group_name" { type = string }
variable "bucket_name" { type = string }
variable "storage_account_name" { type = string }

module "eks" {
  source                 = "../../modules/aws-eks"
  name                   = var.name
  kubernetes_version     = var.eks_version
  vpc_id                 = var.aws_vpc_id
  subnet_ids             = var.aws_subnet_ids
  administrator_role_arn = var.aws_administrator_role_arn
}
module "aks" {
  source                  = "../../modules/azure-aks"
  name                    = var.name
  kubernetes_version      = var.aks_version
  resource_group_name     = var.azure_resource_group_name
  location                = "westeurope"
  subnet_id               = var.azure_subnet_id
  administrator_group_ids = var.azure_administrator_group_ids
}
module "evidence" {
  source               = "../../modules/evidence-storage"
  bucket_name          = var.bucket_name
  storage_account_name = var.storage_account_name
  resource_group_name  = var.azure_resource_group_name
  location             = "westeurope"
}
output "eks_endpoint" { value = module.eks.endpoint }
output "aks_id" { value = module.aks.cluster_id }
output "evidence_blob_url" { value = module.evidence.blob_url }
