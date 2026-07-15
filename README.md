# CIPA Animália Park

Canal interno de sugestões, reclamações, riscos e melhorias, preparado para Render Free com banco e anexos no Supabase.

## Requisitos

- Node.js 22.5 ou superior.
- Projeto Supabase com PostgreSQL ativo.
- Chave `service_role` do Supabase para o servidor gravar anexos no Storage.

## Variáveis obrigatórias

Configure no Render e, se rodar localmente, no arquivo `.env`:

```env
ADMIN_USER=admincipa
ADMIN_PASSWORD=uma-senha-forte
SESSION_SECRET=uma-frase-longa-aleatoria-e-secreta
PUBLIC_URL=https://cipa-animalia.onrender.com
TRUST_PROXY=true
COOKIE_SECURE=true
DATABASE_URL=postgresql://...
SUPABASE_URL=https://ecalkwqqydkrhcjbyzhq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
SUPABASE_BUCKET=cipa-anexos
```

O link informado do Supabase (`https://ecalkwqqydkrhcjbyzhq.supabase.co/rest/v1/`) vira `SUPABASE_URL=https://ecalkwqqydkrhcjbyzhq.supabase.co`.

## Supabase

O app cria automaticamente as tabelas e o bucket privado `cipa-anexos` ao iniciar. Se preferir criar as tabelas manualmente, use o arquivo `supabase/schema.sql` no SQL Editor do Supabase.

Dados salvos no Supabase:

- `users`: usuário administrador.
- `records`: manifestações recebidas.
- `attachments`: metadados das imagens.
- `sessions`: sessões de login.
- `audit_logs`: histórico de alterações.
- Storage bucket `cipa-anexos`: fotos/anexos.

## Deploy no Render Free

O projeto inclui `render.yaml` configurado para plano `free`. Como os dados ficam no Supabase, o app não depende do disco local do Render e não perde banco ao reiniciar.

1. Suba este projeto para o GitHub.
2. No Render, crie um **Blueprint** apontando para o repositório, ou um **Web Service** manual.
3. Use:
   - Build Command: `npm ci`
   - Start Command: `npm start`
   - Node: `22.17.0` ou superior
4. Configure no Render:
   - `DATABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - `PUBLIC_URL=https://cipa-animalia.onrender.com`
   - `SESSION_SECRET`

O Render injeta `PORT` automaticamente. Não defina uma porta fixa no painel.

## Acesso Inicial

- Formulário: `PUBLIC_URL`
- Administração: `PUBLIC_URL/login`
- Usuário inicial: valor de `ADMIN_USER`, padrão `admincipa`
- Senha inicial: valor de `ADMIN_PASSWORD`

A senha é gravada com hash somente na criação inicial do usuário. Depois que o usuário existir, mudar `ADMIN_PASSWORD` não troca a senha já criada.

## Uso Local

Crie `.env` com as variáveis acima, depois execute:

```powershell
npm install
npm start
```

## QR Code

No painel, abra **QR Code**, informe a URL pública do Render e clique em **Atualizar QR Code**. A página pode ser impressa diretamente pelo navegador.

## Estrutura

- `src/`: servidor, banco, sessões e Storage.
- `views/`: páginas EJS.
- `public/`: estilos e imagens públicas.
- `supabase/schema.sql`: schema de referência para o Supabase.
- `render.yaml`: configuração para Render Free.
