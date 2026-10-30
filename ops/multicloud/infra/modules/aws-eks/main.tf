terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}
variable "name" { type = string }
variable "kubernetes_version" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "administrator_role_arn" { type = string }
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.37.2"

  cluster_name                    = var.name
  cluster_version                 = var.kubernetes_version
  cluster_endpoint_public_access  = false
  cluster_endpoint_private_access = true
  vpc_id                          = var.vpc_id
  subnet_ids                      = var.subnet_ids
  enable_irsa                     = true
  access_entries = {
    operator = {
      principal_arn = var.administrator_role_arn
      policy_associations = {
        admin = {
          policy_arn   = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = { type = "cluster" }
        }
      }
    }
  }
  eks_managed_node_groups = {
    arkhe = {
      instance_types = ["m6i.xlarge"]
      min_size       = 2
      max_size       = 10
      desired_size   = 3
    }
  }
}
output "cluster_name" { value = module.eks.cluster_name }
output "endpoint" { value = module.eks.cluster_endpoint }
