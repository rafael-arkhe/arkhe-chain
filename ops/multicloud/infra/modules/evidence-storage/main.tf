terraform {
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.0" }
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}
variable "bucket_name" { type = string }
variable "storage_account_name" { type = string }
variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "retention_days" {
  type    = number
  default = 30
  validation {
    condition     = var.retention_days >= 1 && var.retention_days <= 36500
    error_message = "retention_days must be between 1 and 36500."
  }
}
resource "aws_s3_bucket" "evidence" {
  bucket              = var.bucket_name
  object_lock_enabled = true
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket                  = aws_s3_bucket.evidence.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.evidence.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.evidence.arn, "${aws_s3_bucket.evidence.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.retention_days
    }
  }
  depends_on = [aws_s3_bucket_versioning.evidence]
}
resource "azurerm_storage_account" "replica" {
  name                            = var.storage_account_name
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "ZRS"
  min_tls_version                 = "TLS1_2"
  shared_access_key_enabled       = false
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  blob_properties { versioning_enabled = true }
  lifecycle { prevent_destroy = true }
}
resource "azurerm_storage_container" "replica" {
  name                  = "evidence"
  storage_account_id    = azurerm_storage_account.replica.id
  container_access_type = "private"
}
resource "azurerm_storage_container_immutability_policy" "replica" {
  storage_container_resource_manager_id = azurerm_storage_container.replica.id
  immutability_period_in_days           = var.retention_days
  # Lock through the reviewed operational procedure after validating retention.
  # An unlocked policy can still be removed by an administrator: not production WORM.
  protected_append_writes_enabled = false
}
output "bucket" { value = aws_s3_bucket.evidence.id }
output "blob_url" { value = azurerm_storage_account.replica.primary_blob_endpoint }
