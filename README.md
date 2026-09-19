# Saúde+ — Lagoa Conectada

Plataforma de cuidado integrado para a rede hospitalar de Lagoa de Itaenga:
agendamento de consultas, exames e alertas de
doenças por região. HTML5/CSS3/JS no front, Node/Express + MySQL na API.

> Todo o setup abaixo foi testado de ponta a ponta (banco, API, cadastro,
> login, isolamento de dados por usuário e bloqueio de rotas de admin) antes
> de chegar até você.

## Estrutura

```
saude-plus/
├── index.html          # landing page
├── auth.html           # login e cadastro
├── dashboard.html       # painel do usuário comum
├── admin.html            # painel do administrador
├── assets/
│   ├── styles.css       # design system
│   └── api.js            # cliente HTTP + helpers (auth, toast, fmtDate)
└── server/
    ├── schema.sql         # estrutura do banco MySQL
    ├── package.json
    ├── .env.example
    ├── src/
    │   ├── app.js          # configuração do Express + rotas
    │   ├── server.js        # ponto de entrada
    │   ├── db.js             # pool de conexão MySQL
    │   ├── middleware/auth.js # JWT + checagem de admin
    │   └── routes/           # auth, appointments, exams, reminders, diseases, admin
    └── scripts/
        ├── seed-admin.js      # cria o usuário admin
        └── migrate-supabase.js # migração opcional do Supabase
```

## 1) Banco de dados

```bash
mysql --default-character-set=utf8mb4 -u root -p < server/schema.sql
```

> **Importante (Windows):** o `mysql.exe` no Windows costuma usar `latin1` por
> padrão na sessão de linha de comando. A flag `--default-character-set=utf8mb4`
> garante que os nomes das unidades de saúde (com acentos) sejam gravados
> corretamente. Sem ela, você verá caracteres corrompidos nos seletores de Local.

Isso cria o banco `saude` com as tabelas `users`, `appointments`, `exams`,
`reminders` e `diseases`.

## 2) API

```bash
cd server
cp .env.example .env      # no Windows (cmd): copy .env.example .env
# edite o .env com suas credenciais de MySQL e um JWT_SECRET forte
npm install
npm run migrate         # atualiza bancos existentes para o schema atual
npm run seed:admin        # cria o usuário admin definido no .env
npm start
```

A API sobe em `http://localhost:4000`. Se mudar a porta, defina
`window.API_BASE` antes de carregar `assets/api.js` (no `<head>` de cada
HTML, antes do `<script defer src="assets/api.js">`).

## 3) Frontend

```bash
npx serve .
```

Acesse `http://localhost:8080` (ou a porta que o `serve` indicar).

## Decisões técnicas que valem registro

- **Autenticação por JWT**, guardado no `localStorage` do navegador. Simples
  de implementar e suficiente para o escopo do projeto, mas vale lembrar:
  isso significa que se o token vazar (XSS, por exemplo), ele é válido até
  expirar — não há como "revogar" um token específico no servidor sem
  adicionar uma blocklist. Para uma ONG/projeto de aprendizado é uma
  troca razoável; para produção com dados de saúde reais, vale revisar.
- **`bcryptjs` em vez de `bcrypt`**: o `bcrypt` original (binding nativo) só
  instala com toolchain de compilação (Python, build tools) ou baixando
  binário pré-compilado do GitHub — qualquer um dos dois pode falhar
  silenciosamente em máquina Windows de aluno sem essas ferramentas, ou
  atrás de uma rede restrita. `bcryptjs` é JS puro, mesma API, sem essa
  fragilidade. Testei a instalação de ambos antes de decidir.
- **Sem nenhuma API/lib externa por padrão.** O core funciona 100% offline
  depois de instalado. Mapas, SMS/WhatsApp, etc. ficam como próximo passo
  deliberado, não como dependência de dia 1.
- **Dados sensíveis (LGPD):** o app guarda histórico de saúde de pessoas
  reais. `password_hash` nunca é devolvido pela API, todo acesso a dado de
  paciente passa por `verifyToken` (e `requireAdmin` quando for o caso), e
  cada usuário só lê/apaga os próprios registros (`WHERE user_id = ?` em
  toda query). Antes de usar com dados reais da população, vale também:
  HTTPS obrigatório em produção, política de retenção/expurgo de dados, e
  checar se a Secretaria de Saúde já tem um termo de consentimento para
  esse tipo de coleta.

## Pendências conhecidas (próximos passos naturais)

- Lembretes (`reminders`) hoje só são lidos — não existe ainda nada que os
  crie automaticamente (ex.: lembrete gerado 1 dia antes de uma consulta).
  Daria pra ser um job agendado simples no backend.
- Sem recuperação de senha ("esqueci minha senha").
- Sem rate limiting no login (proteção básica contra força bruta).

Nenhum desses bloqueia o funcionamento do projeto — são só o que eu
implementaria a seguir, em ordem de prioridade.
