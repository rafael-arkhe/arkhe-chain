param(
  [string]$TenantId = 'arkhe-local',
  [string]$StarterPrice,
  [string]$ProPrice,
  [string]$AnchoringPrice,
  [string]$MeterEventName = 'arkhe_anchoring_batches'
)
$ErrorActionPreference = 'Stop'
$billingEnvNames = @('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','ARKHE_BILLING_TENANT_ID','ARKHE_BILLING_ENFORCE','STRIPE_PRICE_STARTER','STRIPE_PRICE_PRO','STRIPE_PRICE_ANCHORING','STRIPE_METER_EVENT_NAME')
$previousBillingEnv = @{}
foreach ($billingEnvName in $billingEnvNames) {
  $previousBillingEnv[$billingEnvName] = [Environment]::GetEnvironmentVariable($billingEnvName, 'Process')
}
try {
  foreach ($billingEnvName in @('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET')) {
    if (![Environment]::GetEnvironmentVariable($billingEnvName, 'Process')) {
      $billingSecureInput = Read-Host "$billingEnvName (apenas memória)" -AsSecureString
      $billingPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($billingSecureInput)
      try {
        [Environment]::SetEnvironmentVariable($billingEnvName, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($billingPointer), 'Process')
      } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($billingPointer)
        $billingSecureInput.Dispose()
      }
    }
  }
  if ($env:STRIPE_SECRET_KEY -notmatch '^sk_test_') { throw 'Use uma chave Stripe de teste.' }
  $env:ARKHE_BILLING_TENANT_ID = $TenantId
  $env:ARKHE_BILLING_ENFORCE = 'true'
  if ($StarterPrice) { $env:STRIPE_PRICE_STARTER = $StarterPrice }
  if ($ProPrice) { $env:STRIPE_PRICE_PRO = $ProPrice }
  if ($AnchoringPrice) { $env:STRIPE_PRICE_ANCHORING = $AnchoringPrice }
  $env:STRIPE_METER_EVENT_NAME = $MeterEventName
  Push-Location (Join-Path $PSScriptRoot '..')
  try { node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3003 }
  finally { Pop-Location }
} finally {
  foreach ($billingEnvName in $billingEnvNames) {
    [Environment]::SetEnvironmentVariable($billingEnvName, $previousBillingEnv[$billingEnvName], 'Process')
  }
}
