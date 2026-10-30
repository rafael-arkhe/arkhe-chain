terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 4.52.0" }
  }
}
provider "cloudflare" {}
variable "account_id" { type = string }
variable "zone_id" { type = string }
variable "hostname" { type = string }
variable "aws_origin" { type = string }
variable "azure_origin" { type = string }
variable "active_active_reads" {
  type    = bool
  default = true
}
module "routing" {
  source              = "../../modules/global-lb"
  account_id          = var.account_id
  zone_id             = var.zone_id
  hostname            = var.hostname
  aws_origin          = var.aws_origin
  azure_origin        = var.azure_origin
  active_active_reads = var.active_active_reads
}
