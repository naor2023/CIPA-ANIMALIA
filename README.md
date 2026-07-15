# CIPA Animália Park

Canal interno de sugestões, reclamações, riscos e melhorias, pronto para uso em rede LAN e preparado para deploy no Render via GitHub.

## Requisitos

- Windows com Node.js 22.5 ou superior (recomendado: versão LTS atual).
- Computadores na mesma rede do servidor.

## Instalação e início

1. Abra o PowerShell nesta pasta.
2. Execute `Set-ExecutionPolicy -Scope Process Bypass` se o Windows bloquear scripts.
3. Execute `.\iniciar.ps1`.

Na primeira execução, o script executa `npm install`. Depois, o terminal mostrará o endereço local e os endereços LAN, como `http://192.168.1.20:3000`.

Também é possível executar manualmente:

```powershell
npm install
npm start
```

Não feche o PowerShell enquanto o sistema estiver em uso.

## Acesso inicial

- Formulário: `http://IP-DO-SERVIDOR:3000`
- Administração: `http://IP-DO-SERVIDOR:3000/login`
- Usuário inicial: `admincipa`
- Senha inicial: `Cipa@2027@`

## Configuração segura

Antes do primeiro uso real, defina as variáveis no PowerShell. A senha é gravada com hash somente na criação inicial do usuário:

```powershell
$env:ADMIN_USER="admincipa"
$env:ADMIN_PASSWORD="uma-senha-forte"
$env:SESSION_SECRET="uma-frase-longa-aleatoria-e-secreta"
$env:PUBLIC_URL="http://192.168.1.20:3000"
.\iniciar.ps1
```

Para tornar essas configurações permanentes no servidor, crie variáveis de ambiente do Windows com os mesmos nomes. Se o usuário `admin` já tiver sido criado, alterar `ADMIN_PASSWORD` não troca sua senha; remova `data\cipa.db` apenas antes de começar a usar o sistema para recriar um banco vazio.

## Deploy no Render via GitHub

O projeto já inclui `render.yaml`, então o Render consegue detectar os comandos de build e start automaticamente depois que o repositório estiver no GitHub.

Importante: como este sistema usa SQLite e uploads, ele precisa de disco persistente. Segundo a documentação do Render, discos persistentes são anexados a serviços pagos; por isso o `render.yaml` usa o plano `starter`.

1. Suba este projeto para um repositório GitHub.
2. No Render, crie um **Blueprint** apontando para o repositório, ou crie um **Web Service** manualmente.
3. Use:
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Node: `22.17.0` ou superior
4. Configure as variáveis obrigatórias no Render:
   - `ADMIN_PASSWORD`: senha forte do administrador inicial.
   - `PUBLIC_URL`: URL pública do serviço no Render, por exemplo `https://seu-app.onrender.com`.
5. Mantenha estas variáveis como estão no `render.yaml`:
   - `DATA_DIR=/var/data`
   - `BACKUP_DIR=/var/data/backups`
   - `TRUST_PROXY=true`
   - `COOKIE_SECURE=true`

O `render.yaml` cria um disco persistente em `/var/data`. O banco SQLite, uploads e backups ficam nesse disco para não serem perdidos em novos deploys.

Observação: o Render injeta a variável `PORT` automaticamente. Não defina uma porta fixa no painel do Render.

## Rede e firewall

O servidor escuta em `0.0.0.0`. Se outro computador não conseguir abrir o endereço, execute `configurar-firewall.ps1` e aceite a solicitação de Administrador. Confirme também que o celular/computador está no Wi-Fi da mesma rede LAN. Para mudar a porta, defina `$env:PORT="8080"` antes de iniciar.

## Preparação para acesso WAN

1. Execute `Preparar_WAN.bat` uma única vez no servidor. Ele cria uma chave de sessão forte e configura a escuta em `0.0.0.0:3000`.
2. Execute `configurar-firewall.ps1` como Administrador.
3. No roteador/firewall de borda, encaminhe a porta TCP pública 3000 para o IP LAN do servidor na porta 3000.
4. O acesso externo será `http://IP-PUBLICO:3000`. Se houver domínio e proxy HTTPS, configure `PUBLIC_URL`, `TRUST_PROXY=true` e `COOKIE_SECURE=true` no arquivo `.env`.

O programa inclui limitação de tentativas de login e de envios. Para uso permanente pela internet, recomenda-se HTTPS; sem HTTPS, o tráfego HTTP não é criptografado.

## Dados e backup

Em uso local, o banco fica em `data\cipa.db` e as fotos em `data\uploads`. No Render, esses arquivos ficam em `/var/data` por causa da variável `DATA_DIR`. Faça backup periódico da pasta de dados inteira com o sistema parado. Os registros exportados pelo painel usam CSV compatível com Excel em português (separador `;` e UTF-8).

## QR Code

No painel, abra **QR Code**, informe o endereço LAN mostrado no terminal e clique em **Atualizar QR Code**. A página pode ser impressa diretamente pelo navegador.

## Estrutura

- `src/`: servidor, banco e sessões.
- `views/`: páginas EJS.
- `public/`: estilos e arquivos públicos.
- `data/`: banco SQLite criado automaticamente.
- `iniciar.ps1`: inicializador para PowerShell.
