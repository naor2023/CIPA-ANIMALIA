$Host.UI.RawUI.WindowTitle = "CIPA Animália Park"
Set-Location -LiteralPath $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 3000 }

try {
  $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
} catch { $connection = $null }

if ($connection) {
  Write-Host "O sistema ja esta aberto na porta $port." -ForegroundColor Yellow
  Write-Host "Acesso local: http://localhost:$port" -ForegroundColor Cyan
  Write-Host "Feche a outra janela do servidor antes de iniciar novamente." -ForegroundColor Gray
  Read-Host "Pressione ENTER para fechar"
  exit 0
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js nao encontrado. Instale o Node.js 22 ou superior." -ForegroundColor Red
  Read-Host "Pressione ENTER para sair"
  exit 1
}
if (-not (Test-Path "node_modules")) {
  Write-Host "Primeira execucao: instalando dependencias..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { Read-Host "Falha na instalacao. Pressione ENTER"; exit 1 }
}
Write-Host "Iniciando a CIPA Animália Park..." -ForegroundColor Green
npm start
if ($LASTEXITCODE -ne 0) {
  Write-Host "O servidor foi encerrado com erro. Leia a mensagem acima." -ForegroundColor Red
} else {
  Write-Host "O servidor foi encerrado." -ForegroundColor Yellow
}
Read-Host "Pressione ENTER para fechar"
