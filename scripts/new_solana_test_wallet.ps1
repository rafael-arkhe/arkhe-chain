param([string]$Name = 'solana-testnet')
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows DPAPI is required.' }
if ($Name -notmatch '^[a-zA-Z0-9_-]{1,48}$') { throw 'Invalid wallet name.' }
$walletRoot = Join-Path $env:LOCALAPPDATA 'Arkhe\wallets'
$walletPath = Join-Path $walletRoot $Name
if (Test-Path -LiteralPath $walletPath) { throw 'Wallet already exists; refusing overwrite.' }
[void](New-Item -ItemType Directory -Path $walletPath)
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $walletPath '/inheritance:r' '/grant:r' "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to restrict wallet directory permissions.' }
$generate = @'
const {generateKeyPairSync}=require('node:crypto');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const pub=publicKey.export({type:'spki',format:'der'}).subarray(-32);
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n=BigInt('0x'+pub.toString('hex')),address='';
while(n){address=alphabet[Number(n%58n)]+address;n/=58n;}
for(const b of pub){if(b!==0)break;address='1'+address;}
process.stdout.write(JSON.stringify({address,privatePkcs8:privateKey.export({type:'pkcs8',format:'der'}).toString('base64')}));
'@
$generated = (& node -e $generate) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $generated.address) { throw 'Key generation failed.' }
$secure = ConvertTo-SecureString -String $generated.privatePkcs8 -AsPlainText -Force
$protected = ConvertFrom-SecureString -SecureString $secure
$secretPath = Join-Path $walletPath 'private-key.dpapi'
[System.IO.File]::WriteAllText($secretPath, $protected)
# Validate persistence by decrypting and signing in memory; no secret is logged.
$restoredSecure = ConvertTo-SecureString -String ([System.IO.File]::ReadAllText($secretPath))
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restoredSecure)
try {
    $restored = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $verify = @'
const crypto=require('node:crypto');let input='';
process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);
process.stdin.on('end',()=>{
 const key=crypto.createPrivateKey({key:Buffer.from(input.trim(),'base64'),type:'pkcs8',format:'der'});
 const pub=crypto.createPublicKey(key),message=Buffer.from('arkhe-wallet-persistence-check/v1');
 if(!crypto.verify(null,message,pub,crypto.sign(null,message,key)))process.exit(1);
 process.stdout.write(pub.export({type:'spki',format:'der'}).subarray(-32).toString('hex'));
});
'@
    $publicHex = $restored | & node -e $verify
    if ($LASTEXITCODE -ne 0 -or $publicHex -notmatch '^[0-9a-f]{64}$') { throw 'Persistence verification failed.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $restored = $null
    $generated.privatePkcs8 = $null
}
$metadata = [ordered]@{
    schema = 1; name = $Name; address = $generated.address; public_key_hex = $publicHex
    intended_network = 'testnet'; usage = 'test SOL only'
    protection = 'Windows DPAPI current user + restricted directory ACL'
    private_key_format = 'Ed25519 PKCS8 DER, base64 inside DPAPI encrypted text'
    persistence_signature_check = 'PASS'; created_at = [DateTime]::UtcNow.ToString('o')
}
$publicPath = Join-Path $walletPath 'public.json'
$metadata | ConvertTo-Json | Set-Content -LiteralPath $publicPath -Encoding utf8
[ordered]@{address=$generated.address;public_metadata=$publicPath;encrypted_key=$secretPath;verification='PASS'} | ConvertTo-Json
