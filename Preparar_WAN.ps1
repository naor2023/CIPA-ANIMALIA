param([int]$Port = 3000, [switch]$Force, [switch]$NonInteractive)
$Host.UI.RawUI.WindowTitle = "Preparar acesso WAN - CIPA Animália Park"
Set-Location -LiteralPath $PSScriptRoot
$envFile = Join-Path $PSScriptRoot '.env'

if ((Test-Path $envFile) -and -not $Force) {
  Write-Host "A configuracao .env ja existe e foi preservada." -ForegroundColor Yellow
  if (-not $NonInteractive) { Read-Host "Pressione ENTER para fechar" }
  exit 0
}

$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
@"
PORT=$Port
HOST=0.0.0.0
ADMIN_USER=admincipa
ADMIN_PASSWORD=Cipa@2027@
SESSION_SECRET=$secret
PUBLIC_URL=
TRUST_PROXY=false
COOKIE_SECURE=false
"@ | Set-Content -LiteralPath $envFile -Encoding UTF8

Write-Host "Modo WAN preparado na porta $Port." -ForegroundColor Green
Write-Host "Agora configure o Firewall e o redirecionamento da porta no roteador." -ForegroundColor Cyan
Write-Host "Para HTTPS com proxy reverso, altere TRUST_PROXY e COOKIE_SECURE para true." -ForegroundColor Gray
if (-not $NonInteractive) { Read-Host "Pressione ENTER para fechar" }
