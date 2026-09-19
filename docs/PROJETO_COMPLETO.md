# Saúde+ — documentação completa do projeto

> Documento técnico consolidado a partir da leitura dos arquivos existentes no workspace em 18/09/2026. Ele descreve o comportamento implementado no código atual e separa explicitamente funcionalidades planejadas ou mencionadas em documentos antigos.

## 1. Resumo executivo

O Saúde+ é uma aplicação web para apoiar o atendimento da rede de saúde de Lagoa de Itaenga. A solução tem três camadas:

- **Frontend:** páginas HTML, CSS e JavaScript vanilla executadas no navegador.
- **Backend:** API REST em Node.js e Express.
- **Persistência:** MySQL acessado pelo `mysql2/promise`.

Os fluxos implementados hoje são cadastro, login, perfil, agendamento de consultas, agendamento de exames, leitura de lembretes, visualização de alertas de doenças, consulta de unidades de saúde e operações administrativas. Existem três papéis: `paciente`, `atendente` e `admin`.

### Estado importante do código atual

- Consultas e exames estão implementados ponta a ponta.
- O escopo atual está deliberadamente limitado a consultas, exames, alertas epidemiológicos, lembretes e unidades de saúde.
- Lembretes são lidos pelo paciente e gerados automaticamente na véspera de consultas/exames pendentes ou confirmados.
- O painel administrativo possui indicadores de usuários pendentes, unidades ativas e alertas ativos, além de filtros de auditoria e gestão de alertas.
- A aplicação usa JWT no `localStorage`; o README registra esse risco para produção.
- A auditoria registra ações administrativas de agendamentos, doenças e usuários.

## 2. Arquitetura e fluxo principal

```text
Navegador
  páginas HTML + assets/api.js
          |
          | fetch + Authorization: Bearer <JWT>
          v
API Express (server/src/app.js)
          |
          | pool.query parametrizado
          v
MySQL (banco saude)
```

### Inicialização

1. `server/src/server.js` importa a aplicação Express.
2. `server/src/app.js` carrega `.env`, configura CORS e JSON e registra as rotas.
3. `server/src/db.js` cria um pool MySQL com até 10 conexões.
4. O navegador carrega `assets/api.js`, recupera a sessão do `localStorage` e envia o JWT nas chamadas protegidas.

### Fluxo de autenticação

1. `auth.html` envia cadastro para `POST /auth/signup`.
2. A API normaliza o e-mail, verifica duplicidade, aplica `bcryptjs` e grava o usuário.
3. `POST /auth/login` verifica status da conta e senha.
4. A API devolve um JWT com `id`, `email`, `role` e `full_name`.
5. `assets/api.js` salva o token e os dados públicos do usuário no `localStorage`.
6. O middleware `verifyToken` valida o JWT em cada rota protegida.

## 3. Papéis e permissões

| Papel       | Cadastro                                      | Acesso principal                                             | Restrições                                                |
| ----------- | --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `paciente`  | Aberto                                        | Próprios agendamentos, exames, lembretes, alertas e unidades | Não vê dados de outros usuários nem rotas administrativas |
| `atendente` | Aberto, começa `pendente`                     | Consultas/exames de todos, busca de pacientes e histórico    | Precisa ser ativado; não acessa rotas exclusivas de admin |
| `admin`     | Criado/promovido pelo script de seed ou banco | Usuários, históricos, agendamentos, doenças e auditoria      | Não deve alterar o próprio status pela API                |

### Middleware de segurança

- `verifyToken(req, res, next)`: extrai o header Bearer, valida o JWT usando `JWT_SECRET` e coloca o payload em `req.user`.
- `requireAdmin(req, res, next)`: aceita somente `req.user.role === 'admin'`.
- `requireStaff(req, res, next)`: aceita `atendente` ou `admin`.

## 4. Banco de dados

O arquivo `server/schema.sql` cria o banco `saude` com `utf8mb4` e as tabelas abaixo.

### `users`

Cadastro de pacientes, atendentes e administradores.

- Identidade: `id`, `full_name`, `email`, `password_hash`.
- Acesso: `role` (`paciente`, `atendente`, `admin`) e `account_status` (`ativo`, `inativo`, `pendente`).
- Contato: `phone`, `mobile`.
- Documentos: `cpf`, `rg`.
- Perfil: nascimento, gênero, tipo sanguíneo, nomes dos pais.
- Endereço: CEP, rua, número, bairro, cidade, UF, zona e referência.
- Atendente: `job_role`.
- `email` é único. A senha nunca é devolvida pelas rotas.

### `appointments`

Consultas médicas do paciente. Possui especialidade, profissional opcional, unidade/local, data, observações e status. `user_id` referencia `users` com exclusão em cascata.

### `exams`

Exames separados de consultas, com tipo, local, data, observações e os mesmos status: `pendente`, `confirmado`, `cancelado` e `concluido`.

### `reminders`

Lembretes associados a um usuário, com título, mensagem, data (`remind_at`) e indicador `read`. O job do servidor cria lembretes únicos na véspera de consultas e exames.

### `diseases`

Alertas de doenças por região. Guarda nome, região, nível (`baixo`, `medio`, `alto`), descrição e flag `active`.

### `health_units`

Catálogo de unidades de saúde usado nos selects de consultas e exames. O schema insere dez unidades iniciais de Lagoa de Itaenga, com tipo (`ubs`, `hospital`, `clinica`, `caps`, `outro`) e bairro.

### `audit_log`

Rastreia ações administrativas com ator, ação, tipo/ID da entidade, detalhes e data. A função de gravação é tolerante a falhas: erro no log é impresso, mas não derruba a operação principal.

### Status e regras de agendamento

- Novo agendamento nasce `pendente`.
- O paciente pode editar ou cancelar registros pendentes/confirmados.
- Registros cancelados ou concluídos não podem ser editados.
- O cancelamento é lógico: muda o status para `cancelado` e preserva o histórico.

## 5. API REST

Todas as queries usam parâmetros `?` do MySQL. Rotas marcadas como protegidas exigem `Authorization: Bearer <token>`.

### Saúde e autenticação

| Método | Rota           | Proteção | Função                                                             |
| ------ | -------------- | -------- | ------------------------------------------------------------------ |
| GET    | `/health`      | Pública  | Retorna `{ ok: true }` para verificar disponibilidade da API.      |
| POST   | `/auth/signup` | Pública  | Cria paciente ou atendente. Atendente inicia como pendente.        |
| POST   | `/auth/login`  | Pública  | Valida e-mail/senha e gera JWT por padrão com validade de 7 dias.  |
| GET    | `/auth/me`     | Login    | Devolve o perfil completo do próprio usuário, sem CPF/RG.          |
| PUT    | `/auth/me`     | Login    | Atualiza perfil próprio; não permite alteração de papel ou status. |

### Área do paciente (`/me`)

| Método | Rota                          | Função                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------- |
| GET    | `/me/appointments`            | Lista somente consultas cujo `user_id` é o usuário do token.  |
| POST   | `/me/appointments`            | Cria consulta; exige especialidade, local e data/hora.        |
| PUT    | `/me/appointments/:id`        | Edita uma consulta própria não cancelada/concluída.           |
| PATCH  | `/me/appointments/:id/cancel` | Cancela uma consulta própria sem apagar o registro.           |
| GET    | `/me/exams`                   | Lista somente exames próprios.                                |
| POST   | `/me/exams`                   | Cria exame; exige tipo, local e data/hora.                    |
| PUT    | `/me/exams/:id`               | Edita exame próprio não cancelado/concluído.                  |
| PATCH  | `/me/exams/:id/cancel`        | Cancela exame próprio preservando o histórico.                |
| GET    | `/me/reminders`               | Lista lembretes do próprio usuário ordenados por `remind_at`. |

### Dados gerais protegidos

| Método | Rota            | Função                                           |
| ------ | --------------- | ------------------------------------------------ |
| GET    | `/diseases`     | Lista alertas; `?active=true` limita aos ativos. |
| GET    | `/health-units` | Lista unidades com `id`, nome, tipo e bairro.    |

### Área de atendente (`/staff`)

Todas as rotas exigem `verifyToken` e `requireStaff`.

| Método | Rota                          | Função                                                                 |
| ------ | ----------------------------- | ---------------------------------------------------------------------- |
| GET    | `/staff/appointments`         | Lista consultas de todos os usuários; `limit` padrão 50, máximo 200.   |
| GET    | `/staff/exams`                | Lista exames de todos os usuários; `limit` padrão 50, máximo 200.      |
| GET    | `/staff/patients?q=...`       | Busca pacientes ativos por nome ou e-mail, até 20 resultados.          |
| GET    | `/staff/patients/:id/history` | Devolve perfil público, consultas e exames do paciente.                |
| PATCH  | `/staff/:kind/:id`            | Atualiza status e/ou data de consulta/exame e registra `staff_update`. |

`kind` só pode ser `appointments` ou `exams`. O histórico não devolve CPF/RG.

### Área administrativa (`/admin`)

Todas as rotas exigem `verifyToken` e `requireAdmin`.

| Método | Rota                        | Função                                                                             |
| ------ | --------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/admin/appointments`       | Lista consultas de todos; limite padrão 20, máximo 100.                            |
| GET    | `/admin/exams`              | Lista exames de todos; limite padrão 20, máximo 100.                               |
| PATCH  | `/admin/:kind/:id`          | Confirma, cancela ou reagenda qualquer consulta/exame; audita como `admin_update`. |
| GET    | `/admin/users`              | Busca usuários por e-mail parcial; retorna dados resumidos.                        |
| GET    | `/admin/history?userId=...` | Lista perfil resumido, consultas e exames de um usuário.                           |
| GET    | `/admin/diseases`           | Lista todos os alertas, ativos ou não.                                             |
| POST   | `/admin/diseases`           | Cria alerta e registra ação `create`.                                              |
| DELETE | `/admin/diseases/:id`       | Apaga alerta e registra ação `delete`.                                             |
| GET    | `/admin/audit-log`          | Lista ações administrativas, padrão 50 e máximo 200.                               |

### Usuários administrativos (`/admin/users`)

| Método | Rota               | Função                                                                                       |
| ------ | ------------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/admin/users`     | Lista até 100 usuários, com filtros seguros por papel e e-mail. CPF/RG não aparecem.         |
| GET    | `/admin/users/:id` | Devolve perfil completo, incluindo CPF/RG, somente ao admin.                                 |
| PATCH  | `/admin/users/:id` | Altera `account_status` e/ou `job_role`; impede alterar o próprio status e audita a mudança. |

O campo `role` não é alterável por essa API; a decisão atual é exigir alteração direta no banco ou usar o seed.

## 6. Frontend

### `index.html` — página inicial

Landing page pública com marca Saúde+, explicação em três passos, recursos de consultas/exames/alertas/lembretes, bloco de confiança, links para login/cadastro e política de privacidade. Ao carregar, verifica sessão local e redireciona usuários já autenticados para o painel correspondente ao papel.

### `auth.html` — login e cadastro

Contém duas abas:

- **Login:** envia e-mail e senha para `authLogin`; redireciona admin para `admin.html`, atendente para `atendente.html` e paciente para `dashboard.html`.
- **Cadastro:** wizard de quatro etapas: tipo de conta, dados pessoais, endereço e credenciais.

Funções principais: `switchTab`, `selectRole`, `goStep`, `validateStep2`, `validateStep3`, `lookupCep`, `maskCpf`, `maskPhone`, `maskCep`, `toggleOtherJobRole` e `submitSignup`.

O cadastro usa ViaCEP para preencher rua, bairro, cidade e UF, mas permite correção manual. Contas de atendente são criadas como `pendente` e precisam de ativação administrativa.

### `dashboard.html` — painel do paciente

Protege a entrada com `requireAuth`; redireciona admin e atendente para os próprios painéis. As abas atuais são:

- **Início:** cards de consultas, exames, alertas ativos e lembretes não lidos; próximos eventos.
- **Minha agenda:** consolida consultas e exames em ordem cronológica.
- **Consultas:** cria, edita e cancela consultas.
- **Exames:** cria, edita e cancela exames.
- **Alertas:** exibe doenças ativas.

Funções principais: `switchTab`, `nowLocalForInput`, `loadHealthUnits`, `loadAll`, `renderList`, `cancelItem`, `confirmCancel`, `editAppt`, `editExam`, `addAppt`, `addExam`, `toggleSpecialtyOutra`, `toggleExamTypeOutro`, `statusClass`, `levelClass` e `esc`.

O arquivo também cria modal próprio para cancelamento e inclui navegação de abas pelas setas do teclado. Há definições duplicadas de algumas funções no final do script, especialmente edição de consulta, o que merece limpeza futura.

### `admin.html` — painel administrativo

Protege a entrada com `requireAuth` e `isAdmin`. As abas são visão geral, usuários/histórico, doenças e auditoria.

Funções principais:

- `loadOverview`: carrega consultas, exames e doenças ativas.
- `renderActionableTable`: cria tabelas com confirmar, cancelar e reagendar.
- `adminAction` e `confirmReagendar`: atualizam status/data via `/admin`.
- `searchUsers`, `showHistory` e `viewUser`: buscam usuários, histórico e perfil detalhado.
- `adminUpdateUser`: altera status/cargo permitido via `/admin/users`.
- `loadDiseases`, `addDisease` e `delDisease`: gerenciam alertas.
- `loadAuditLog`: exibe a trilha de auditoria.
- `renderTable`, `renderCell`, `statusClass`, `levelClass` e `esc`: helpers de apresentação.

O campo de motivo de alteração de usuário é enviado pelo frontend como `reason` e `status_notes`, mas a rota atual não persiste esses campos no `audit_log`.

### `atendente.html` — painel de atendimento

Protege a entrada com `requireRole(['atendente', 'admin'])`. Oferece fila do dia, consultas, exames e busca de pacientes.

Funções principais: `formatJobRole`, `ensureReagendarModal`, `reagendar`, `confirmReagendar`, `loadAll`, `itemRow`, `act`, `searchPatient`, `viewPatient`, `renderHistory`, `fmtSimpleDate`, `statusClass`, `stat` e `esc`.

O painel calcula pendências do dia, permite confirmar/cancelar/reagendar e mostra histórico de consultas/exames. A implementação atual da rota `/staff/patients` filtra apenas pacientes ativos, portanto a interface não consegue exibir avisos para contas inativas/pendentes apesar de possuir esse tratamento visual.

### `privacy.html` — política de privacidade

Página pública em linguagem simples que explica dados coletados, finalidade, acesso, proteção e direitos do usuário. O próprio arquivo informa que o texto ainda não é revisão jurídica e que o contato precisa ser confirmado antes de publicação real.

## 7. Assets compartilhados

### `assets/api.js`

É o cliente HTTP global usado pelas páginas. A IIFE define:

- `apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`: wrappers HTTP.
- `authLogin` e `authSignup`: autenticação.
- `signOut`: limpa sessão e vai para `auth.html`.
- `getSession`, `requireAuth`, `requireRole`: leitura e proteção de sessão no frontend.
- `isAdmin`, `isAtendente`, `isStaff`: verificações de papel.
- `fmtDate`: formatação `pt-BR`.
- `toast`: mensagens temporárias de sucesso/erro.

O token fica em `saude_token` e o usuário resumido em `saude_user`. Respostas 401 limpam a sessão.

### `assets/styles.css`

Define o design system inteiro: variáveis de cor/tipografia, reset básico, topbar, hero, containers, grids, cards, tabs, formulários, botões, badges, tabelas, listas, spinner, tela de autenticação, toast e estado visual de edição. Também inclui foco visível e `prefers-reduced-motion`.

## 8. Backend por arquivo

### `server/src/app.js`

Monta o Express, carrega `.env`, configura CORS, JSON, `/health`, registra todas as rotas, trata 404 e possui middleware final de erro 500.

### `server/src/server.js`

Ponto de entrada do processo. Escuta `PORT` ou 4000 e informa a URL no console.

### `server/src/db.js`

Cria o pool MySQL com host, porta, usuário, senha e banco vindos do ambiente. Usa `utf8mb4`, `waitForConnections`, limite de 10 conexões e `dateStrings: true`.

### `server/src/routes/auth.routes.js`

Implementa `signup`, `login`, `GET /me` e `PUT /me`. Também define `VALID_ROLES`, normaliza e-mails, aplica hash/comparação de senha, gera JWT e seleciona cuidadosamente os campos devolvidos.

### `server/src/routes/appointments.routes.js`

Router protegido para listar, criar, editar e cancelar consultas do usuário autenticado. Cada leitura/alteração contém `user_id` na query para impedir acesso cruzado.

### `server/src/routes/exams.routes.js`

Repete o mesmo padrão de propriedade e status para exames, usando `exam_type` no lugar de especialidade.

### `server/src/routes/reminders.routes.js`

Router protegido somente de leitura. Lista lembretes do usuário por data crescente; os registros são gerados pelo job automático do servidor.

### `server/src/jobs/reminders.js`

Job sem dependência externa que executa na inicialização e a cada 24 horas. Busca consultas e exames pendentes/confirmados do dia seguinte, cria um lembrete na véspera e verifica registros existentes para não duplicar notificações.

### `server/src/routes/diseases.routes.js`

Permite que qualquer usuário autenticado consulte alertas, com filtro opcional de ativos.

### `server/src/routes/units.routes.js`

Lista unidades ativas para os selects do frontend e fornece CRUD administrativo protegido: catálogo completo, cadastro, edição e ativação/desativação. As alterações são registradas na auditoria.

### `server/src/routes/staff.routes.js`

Protege atendentes/admins, lista agendamentos gerais, busca pacientes ativos, devolve históricos e atualiza status/data de consultas e exames. Usa `ENTITY_MAP` para selecionar somente tabelas permitidas e chama `logAction`.

### `server/src/routes/admin.routes.js`

Protege exclusivamente admin. Lista operações gerais, modifica agendamentos, busca usuários/históricos, cria/exclui doenças e consulta auditoria. `VALID_STATUS` e `ENTITY_MAP` controlam atualizações permitidas.

### `server/src/routes/admin.users.routes.js`

Lista usuários com filtros, devolve perfil administrativo completo e permite alterar status/cargo. `SAFE_ROLES` e `SAFE_STATUSES` evitam valores arbitrários.

### `server/src/middleware/auth.js`

Centraliza autenticação JWT e autorização por papel com `verifyToken`, `requireAdmin` e `requireStaff`.

### `server/src/utils/audit.js`

Expõe `logAction(actorId, action, entityType, entityId, details)`. Gera UUID e insere em `audit_log`; falha de auditoria é registrada sem interromper a operação.

### `server/src/api.js`

Arquivo que também contém cliente HTTP, sessão, redirecionamento por papel e helpers de UI. O conteúdo é uma versão paralela de `assets/api.js` e não é importado pelo backend nem pelas páginas atuais; deve ser tratado como legado/duplicado para não ser confundido com a API Express.

## 9. Scripts e configuração do servidor

### `server/package.json`

Define o pacote privado `saude-plus-server`, exige Node 18+, inicia com `src/server.js` e oferece `start`, `dev`, `migrate`, `seed:admin`, `migrate:supabase` e `smoke-test`. Dependências: Express, CORS, dotenv, JWT, MySQL e bcryptjs; Nodemon é de desenvolvimento.

`npm run migrate` aplica `migration_001.sql` em bancos existentes. `node scripts/smoke-test.js` valida a saúde da API e que rotas protegidas rejeitam chamadas sem token.

### `server/scripts/seed-admin.js`

Lê `ADMIN_EMAIL` e `ADMIN_PASSWORD`, valida a senha, cria ou promove o usuário para admin e atualiza o hash. É executado por `npm run seed:admin`.

### `server/scripts/diagnose-db.js`

Mostra configurações do banco sem revelar a senha inteira e testa conexão em `localhost` e `127.0.0.1`, ajudando a diagnosticar diferenças comuns do MySQL no Windows.

### `server/scripts/migrate-supabase.js`

Migração opcional de uma tabela `profiles` do Supabase. Exige dependência adicional `@supabase/supabase-js`, usa senha temporária comum e insere usuários no MySQL. Deve ser revisado antes de uso: o valor de papel legado tratado no script não corresponde ao enum atual (`paciente`, `atendente`, `admin`).

### `server/scripts/build-pdf.js`

Lê `docs/TAREFAS_SIMPLES_V3.md`, converte Markdown com `temp_marked.js`, grava `TAREFAS_SIMPLES_V3.html` e chama o Chrome em modo headless para gerar o PDF correspondente.

### `server/scripts/temp_marked.js`

Bundle gerado do parser Markdown `marked` v15.0.12, usado pelo script de PDF. Não deve ser editado manualmente.

### `server/.gitignore`

Ignora `node_modules`, `.env` e arquivos de log. O `.env` real não deve ser compartilhado nem versionado.

### `server/migration_001.sql`

Migração para bancos antigos: adiciona perfil estendido, status de conta, converte papel legado `user` para `paciente` e ajusta o enum de papéis. Deve ser usada somente sobre banco existente; instalação nova usa `schema.sql`.

## 10. Documentação e artefatos

| Arquivo                                  | Conteúdo                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `README.md`                              | Setup local, decisões técnicas, segurança, pendências e comandos principais.                      |
| `ROTEIRO_TESTE_ALUNOS.md`                | Roteiro manual para testar paciente, admin, segurança, CORS e problemas comuns.                   |
| `docs/PLANO_MELHORIAS.md`                | Diagnóstico de backend, segurança, validação, qualidade e roadmap técnico.                        |
| `docs/PLANO_UIUX.md`                     | Diagnóstico de interface, acessibilidade, duplicação visual e roadmap de UX.                      |
| `docs/PROJETO_DO_ZERO.md`                | Visão de produto, arquitetura alvo, papéis, sprints e preparação comercial.                       |
| `docs/TAREFAS_SIMPLES_V2.md`             | Checklist de melhorias explicado para pessoas não técnicas.                                       |
| `docs/TAREFAS_SIMPLES_V3.md`             | Checklist atualizado com itens feitos, parciais e pendentes, alinhado ao escopo atual do produto. |
| `docs/TAREFAS_SIMPLES_V3.html`           | Renderização HTML da versão 3, produzida para impressão/PDF.                                      |
| `docs/Conectados para o Sucesso 2.0.pdf` | Documento original de proposta do projeto.                                                        |
| `docs/PROJETO_DO_ZERO.pdf`               | Versão PDF do plano de produto.                                                                   |
| `docs/TAREFAS_SIMPLES_V2.pdf`            | Exportação PDF do checklist V2.                                                                   |
| `docs/TAREFAS_SIMPLES_V3.pdf`            | Exportação PDF do checklist V3.                                                                   |

Os PDFs são artefatos binários derivados ou documentos de referência; o código executável não os importa.

## 11. Configurações do workspace

### `.vscode/launch.json`

Configuração de debug que abre o Chrome em `http://localhost:8080` usando a raiz do workspace como `webRoot`.

### `.claude/settings.local.json`

Configuração local de permissões para comandos de diagnóstico. Não participa da execução da aplicação e pode conter regras específicas da máquina/desenvolvimento.

### `package-lock.json` da raiz

Arquivo npm mínimo, sem pacotes na raiz. O frontend não possui `package.json`; o pacote executável fica em `server/`.

### `server/package-lock.json`

Lockfile das dependências npm do backend, usado para instalação reprodutível junto do `server/package.json`.

## 12. Como executar

### Banco

```powershell
mysql --default-character-set=utf8mb4 -u root -p < server/schema.sql
```

### API

```powershell
cd server
copy .env.example .env
npm install
npm run seed:admin
npm start
```

> O repositório atual não contém `server/.env.example`, embora o README e o roteiro o referenciem. É necessário criar esse arquivo/template ou configurar `.env` manualmente.

### Frontend

Na raiz do projeto:

```powershell
npx serve .
```

O frontend usa `http://localhost:4000` como API padrão. Se a API ou a porta do frontend mudar, ajuste `PORT`, `CORS_ORIGIN` e/ou `window.API_BASE`.

## 13. Lacunas e riscos verificados

1. **Escopo alinhado:** consultas, exames, alertas epidemiológicos, lembretes e unidades de saúde são os módulos mantidos no produto.
2. **Lembretes automáticos:** implementados pelo job diário de consultas e exames.
3. **Validação no servidor:** várias validações de formato e datas dependem da interface; chamadas diretas podem enviar dados incompletos ou malformados.
4. **Rate limiting:** não há proteção contra tentativas repetidas de login.
5. **JWT no navegador:** token em `localStorage` não tem revogação server-side.
6. **CORS:** o fallback atual permite `*` quando `CORS_ORIGIN` não é definido.
7. **Testes automatizados:** não há framework/testes configurados no `package.json` atual.
8. **Unidades:** CRUD administrativo implementado; bancos antigos precisam executar `migration_001.sql` para adicionar `health_units.active`.
9. **Histórico de motivo:** alterações de status, cargo, nível administrativo, unidades e alertas são registradas no `audit_log`.
10. **Arquivos paralelos:** `server/src/api.js` duplica o cliente de `assets/api.js` e não é usado pela API.
11. **Níveis administrativos:** o banco e o login suportam `superadmin`, `gestor`, `atendimento` e `alertas`; o painel atual permanece unificado até que telas específicas por nível sejam criadas.
12. **Exportação:** existe o endpoint autenticado `/admin/export/summary.csv`, limitado a indicadores agregados e sem dados pessoais identificáveis.
13. **Migração:** bancos antigos precisam executar `npm run migrate` antes de usar o registro de último acesso e os níveis administrativos.

## 14. Conclusão

O projeto atual é um protótipo funcional de gestão de consultas e exames com autenticação, separação de papéis, isolamento de dados por usuário e painel administrativo. A base está organizada em módulos pequenos e usa SQL parametrizado. Para aproximá-lo de produção com dados de saúde reais, as prioridades são validar entradas no servidor, proteger segredos e login, configurar HTTPS/CORS seguro, criar testes automatizados e implementar backup/retensão de dados.