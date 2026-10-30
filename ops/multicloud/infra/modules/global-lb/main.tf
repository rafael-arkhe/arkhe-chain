terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 4.52.0" }
  }
}
variable "account_id" { type = string }
variable "zone_id" { type = string }
variable "hostname" { type = string }
variable "aws_origin" { type = string }
variable "azure_origin" { type = string }
variable "active_active_reads" {
  type    = bool
  default = true
}
resource "cloudflare_load_balancer_monitor" "http" {
  account_id       = var.account_id
  type             = "https"
  port             = 443
  method           = "GET"
  path             = "/healthz"
  expected_codes   = "200"
  interval         = 30
  timeout          = 5
  retries          = 2
  consecutive_down = 3
  consecutive_up   = 2
  allow_insecure   = false
  header {
    header = "Host"
    values = [var.hostname]
  }
}
resource "cloudflare_load_balancer_pool" "cloud" {
  for_each        = { aws = var.aws_origin, azure = var.azure_origin }
  account_id      = var.account_id
  name            = "arkhe-${each.key}"
  monitor         = cloudflare_load_balancer_monitor.http.id
  check_regions   = ["ENAM", "WEU"]
  minimum_origins = 1
  origins {
    name    = each.key
    address = each.value
    enabled = true
    header {
      header = "Host"
      values = [var.hostname]
    }
  }
}
resource "cloudflare_load_balancer" "data" {
  zone_id          = var.zone_id
  name             = var.hostname
  proxied          = true
  default_pool_ids = [cloudflare_load_balancer_pool.cloud["aws"].id, cloudflare_load_balancer_pool.cloud["azure"].id]
  fallback_pool_id = cloudflare_load_balancer_pool.cloud["azure"].id
  steering_policy  = var.active_active_reads ? "random" : "off"
}
# This is HTTP availability only; it must never be used as a writer election.
