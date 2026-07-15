$Host.UI.RawUI.WindowTitle = "Configurar Firewall - CIPA Animália Park"
$ruleName = "CIPA Animália Park - Porta 3000"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Solicitando permissao de Administrador..." -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
  exit
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Any | Out-Null
  Write-Host "Porta TCP 3000 liberada com sucesso." -ForegroundColor Green
} else {
  Enable-NetFirewallRule -DisplayName $ruleName | Out-Null
  Set-NetFirewallRule -DisplayName $ruleName -Profile Any | Out-Null
  Write-Host "A regra da CIPA ja existe e foi ativada." -ForegroundColor Green
}

Write-Host "O celular deve estar no Wi-Fi da mesma rede do computador." -ForegroundColor Cyan
Read-Host "Pressione ENTER para fechar"
