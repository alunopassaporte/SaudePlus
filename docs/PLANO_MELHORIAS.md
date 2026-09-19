# Plano de Melhorias — Saúde+ (Lagoa Conectada)

Análise gerada em 2026-07-20. Escopo: leitura completa do backend (Node/Express + MySQL) e do frontend (HTML/CSS/JS vanilla). Nenhum arquivo foi alterado — este documento é só diagnóstico + plano de ação.

## Visão geral do projeto

- **Frontend**: HTML5/CSS3/JS puro (sem build step), 5 páginas (`index`, `auth`, `dashboard`, `admin`, `atendente`) + `assets/api.js` (cliente HTTP) + `assets/styles.css`.
- **Backend**: Node/Express, MySQL via `mysql2/promise`, JWT em `localStorage`, `bcryptjs` para hash.
- **Domínio**: agendamento de consultas/exames, alertas de doenças por região, lembretes e unidades de saúde para a rede de Lagoa de Itaenga.
- **Papéis**: `paciente`, `atendente` (precisa ativação), `admin`.
- **Sem git repo** neste diretório (`git init` nunca rodado) — histórico de mudanças não rastreado.

Pontos fortes já presentes no código (vale reconhecer, não é tudo dívida técnica):
- SQL 100% parametrizado (`?` bindings) em todas as rotas — sem injeção SQL.
- Isolamento por `user_id` consistente em rotas `/me/*`.
- `password_hash` nunca retornado; CPF/RG restritos a admin.
- Log de auditoria (`audit_log`) em ações administrativas.
- Separação clara de middleware (`verifyToken`, `requireAdmin`, `requireStaff`).

## Achados por prioridade

### 🔴 Crítico — segurança

1. **`.env` real commitado no diretório do projeto** (`server/.env`), com senha de banco e `JWT_SECRET` reais em texto plano, junto de `ADMIN_PASSWORD=admin1234.`. Mesmo sem git ainda, isso é o arquivo que será commitado no primeiro `git init` + `git add .` se ninguém prestar atenção — o `.gitignore` já lista `.env`, mas o arquivo físico com segredo real está solto no disco/repo.
   - Ação: girar `JWT_SECRET` e senha do MySQL antes de qualquer deploy real; garantir que `.env` nunca entre em nenhum commit (checar `git status` no primeiro commit).
2. **Sem rate limiting em `/auth/login`** — força bruta de senha é trivial. README já lista isso como pendência conhecida.
3. **JWT em `localStorage`** sem blocklist/revogação — token vazado (XSS) fica válido até expirar (7 dias por padrão). Aceitável para escopo educacional, arriscado para dado de saúde real (o próprio README já sinaliza isso).
4. **Sem Helmet / cabeçalhos de segurança HTTP** (`X-Content-Type-Options`, `X-Frame-Options`, CSP) — `app.js` só tem `cors` + `express.json()`.
5. **CORS default `origin: '*'`** quando `CORS_ORIGIN` não definido (`app.js:19`) — hoje mitigado pelo `.env` local, mas é fallback perigoso se `.env` faltar em produção.
6. **Sem validação de formato de entrada** (email, CPF, telefone, datas) além de checagem de presença — abre espaço para dado sujo no banco (CPF inválido, datas malformadas aceitas como string livre).
7. **Sem HTTPS/produção discutido** — README já lista como próximo passo, mas nenhum guia de deploy existe ainda.

### 🟠 Alto — robustez / correção

8. **Sem testes automatizados** (nenhum `jest`/`vitest`/`mocha` no `package.json`, nenhuma pasta `test/`). Qualquer regressão só é pega manualmente.
9. **Sem `.env.example`** de fato no repo (README referencia `cp .env.example .env`, mas só existe `server/.env` real — falta o template).
10. **Rotas de agendamento (`appointments`, `exams`) duplicam lógica quase idêntica** entre `me/*.routes.js`, `admin.routes.js` e `staff.routes.js` (mesmo `ENTITY_MAP`, mesmo `PATCH /:kind/:id`, mesma validação de status) — 3 cópias do mesmo padrão. Candidato natural a um helper compartilhado (`makeEntityRouter` ou serviço comum), reduzindo risco de uma cópia divergir da outra em uma correção futura.
11. **Reminders são somente leitura** — não existe geração automática (ex.: lembrete 1 dia antes de consulta). Já documentado como pendência no README.
12. **Sem paginação real** — rotas usam só `LIMIT` fixo (max 100-200), sem `OFFSET`/cursor, então dado além do limite fica inacessível pela UI.
13. **Sem tratamento de erro estruturado por tipo** — o `error handler` global (`app.js:40`) sempre devolve 500 genérico; erros de constraint do MySQL (ex: FK, unique) não são traduzidos em mensagens úteis pro usuário.
14. **`role` de usuário só pode ser alterado direto no banco** (comentário em `admin.users.routes.js:54`) — não há fluxo de promoção de atendente para admin pela própria aplicação; pode ser intencional (segurança), mas vale documentar como decisão, não lacuna.

### 🟡 Médio — manutenibilidade / DX

15. **Sem linter/formatter configurado** (não há `.eslintrc`, não há `prettier` no `package.json`) — havia um comentário `eslint-disable-next-line` em `app.js:39` mas nenhuma config de ESLint no projeto.
16. **Sem CI** (não há `.github/workflows`, nem outro pipeline) — sem checagem automática em PR.
17. **Sem tipagem** (JS puro, sem TypeScript nem JSDoc consistente) — em projeto de saúde com schema rico (20+ campos em `users`), TS ou JSDoc reduziria erro de campo trocado entre frontend/backend.
18. **`assets/api.js` é só um arquivo global (IIFE)**, sem módulos ES — funcional para o tamanho atual, mas escala mal se o frontend crescer.
19. **Sem `package.json` no nível raiz** (só dentro de `server/`) — o `npx serve .` do frontend não é gerenciado como dependência do projeto.
20. **Datas tratadas como string livre** (`scheduled_at`) sem checagem de formato/futuro — permite agendar no passado.

### 🟢 Baixo — nice-to-have

21. **Sem paginação/UI de busca "carregar mais"** no admin/atendente além do limite fixo.
22. **Sem internacionalização** (tudo hardcoded em pt-BR) — não é problema para escopo atual (produto local), só registrar como decisão consciente.
23. **`migrate-supabase.js`** sugere origem migrada de Supabase/Postgres para MySQL — script de migração populado mas não documentado quando/se ainda é necessário rodar.
24. **Sem monitoramento/logs estruturados** (só `console.error`) — sem correlação de request, sem log level.

### 🔵 Recebimento de dados e formulário de cadastro (campo a campo)

Análise do wizard de 4 passos (`auth.html`) cruzada com o que a rota `POST /auth/signup` (`auth.routes.js`) realmente valida. Achado central: **o front valida muito mais do que o back exige** — toda a integridade de dado de cadastro hoje depende do JS do navegador, não do servidor. Qualquer chamada direta à API (Postman, script, front alternativo) contorna 100% dessas regras.

**Campo `job_role` (cargo/função do atendente) — o exemplo citado**
25. **`job_role` é texto livre** (`<input id="jobRoleInput" placeholder="Ex: Recepcionista, Médico, Enfermeiro...">`, `auth.html`) em vez de seletor fechado. Efeito prático: mesmo cargo vira 5 strings diferentes no banco ("Enfermeira", "enfermeiro", "Enferm.", "ENFERMEIRA(O)"), quebrando qualquer filtro/relatório por cargo no admin. Ação: trocar por `<select>` com lista fixa de cargos da rede de saúde (Recepcionista, Enfermeiro(a), Médico(a), Motorista, Auxiliar Administrativo, Outro — com campo livre condicional só para "Outro", no mesmo padrão já usado em "Especialidade" no dashboard).

**Inconsistência de obrigatoriedade entre front e back**
26. **CPF e RG são `required` no HTML (passo 2) mas opcionais na API** (`auth.routes.js:56`: `cpf || null, rg || null`) — o back aceita cadastro sem CPF/RG se chamado diretamente. Mesma lacuna em `birth_date`, `gender`, `mother_name`, `mobile`: todos `required` no front, todos opcionais no back (`|| null` em cada um). Ação: decidir a regra uma vez (provavelmente: CPF/RG/nascimento realmente obrigatórios para paciente de saúde pública) e replicar no back com `if (!cpf) return res.status(400)...`, não só no HTML.
27. **`password` confirmado (`s4_confirm`) só é comparado no client** (`submitSignup`) — a rota `/auth/signup` nunca recebe nem checa confirmação; não é falha de segurança (senha ainda é hasheada certo), mas mostra o padrão geral: back confia cegamente no front para regra de negócio.

**Validação de formato ausente (aceita estrutura, não valida conteúdo)**
28. **CPF sem dígito verificador**: `maskCpf()` só formata `000.000.000-00`, nunca calcula os dígitos verificadores. `111.111.111-11` (estruturalmente "válido") passa em front e back. Para app com dado de saúde vinculado a CPF, isso é o principal campo de deduplicação/identificação de paciente — vale adicionar validação de dígito verificador (função pura, sem lib).
29. **Email sem validação real no back** — `auth.routes.js` só faz `.toLowerCase().trim()`; `a@b` passa. O front usa `type="email"` (validação HTML5, contorna-se com DevTools ou request direto).
30. **Celular/telefone sem validação de DDD/tamanho real** — máscara aceita qualquer sequência de dígitos no formato `(00) 00000-0000`, incluindo DDDs inexistentes no Brasil (`(00)`, `(01)`).
31. **Datas de agendamento (`scheduled_at`) sem checagem de "não pode ser no passado" no back** — só o front trava via `min` no `datetime-local` (`nowLocalForInput()` no dashboard). Chamada direta à API aceita qualquer data, passada ou futura.

**Passo a passo do wizard — pontos de fricção/qualidade de dado**
32. **CEP preenche endereço mas todos os campos continuam livremente editáveis sem revalidação** — usuário pode buscar CEP de Lagoa de Itaenga (autopreenche cidade/UF corretos) e depois apagar e digitar outra cidade/estado manualmente, sem qualquer alerta de inconsistência. Para um sistema de saúde regional (o propósito é atender **a rede local**), vale pelo menos um aviso soft se `city`/`state` final não bater com o que o CEP indicou.
33. **`zone` (urbana/rural) e `reference_point` são obrigatórios para todo mundo**, inclusive quem já preencheu CEP + número + rua completos (tipicamente zona urbana com endereço formal). Ponto de referência faz sentido para zona rural (onde CEP/numeração é menos confiável), mas forçá-lo sempre é fricção desnecessária para quem já deu endereço completo — poderia ser condicional a `zone === 'rural'` ou pelo menos deixar de ser `*` obrigatório na zona urbana.
34. **Validação do wizard é só "forward"**: `validateStep2()`/`validateStep3()` rodam ao clicar "Continuar", mas `submitSignup()` (passo 4, envio final) não re-valida os passos anteriores. Se o usuário volta ao passo 2 pelo botão "Voltar", apaga um campo obrigatório e vai direto ao passo 4 sem clicar "Continuar" de novo (não é possível pela UI atual, mas o código não impede logicamente), o envio ainda tentaria seguir. Mais relevante: como o back aceita os mesmos campos como opcionais (achado #26), esse é um caso onde duas camadas fracas se somam em vez de uma compensar a outra.
35. **Nenhum campo do wizard mostra o que realmente é obrigatório *por que*** — ex.: não fica claro para o paciente por que CPF/RG são pedidos (LGPD/transparência) nem o que acontece se ele não tiver RG (idoso que só tem CPF, por exemplo). Um subtexto curto por campo sensível ajudaria tanto usabilidade quanto conformidade com LGPD (finalidade do dado coletado).

### 🔵 Recebimento de dados — telas de usuário, admin e atendente

Mesma análise campo a campo aplicada agora às 3 telas internas (`dashboard.html`, `admin.html`, `atendente.html`), cruzando o que cada formulário pede com o que a rota correspondente valida.

**Tela de usuário/paciente (`dashboard.html`) — formulários de agendamento**
36. **Campos "tipo" com opções fechadas incompletas**: `exam_type` (select fixo de 9 opções + Outro) **não tem campo livre condicional para "Outro"**, ao contrário de `specialty` que já tem esse padrão (`specialtyOutra`). Selecionar "Outro" em exame não captura *qual* outro — o dado se perde. Ação: replicar o padrão `__outra` + input condicional já usado em Especialidade.
37. **`location` de consulta/exame vem de um `<select>` alimentado por `GET /health-units`** — bom (evita texto livre, já é o padrão certo), mas o catálogo tem só 10 unidades cadastradas via seed SQL, sem endpoint de cadastro/manutenção pelo admin. Se uma unidade fechar ou abrir, exige `UPDATE` manual no banco — não há tela para isso em `admin.html`, apesar de o admin gerenciar doenças, usuários e diseases pela UI.
38. **Campo `notes`/`reason` (observações/motivo) sem limite de caracteres visível** — `TEXT` no banco aceita praticamente ilimitado, textarea não tem `maxlength`; não é bug, mas nenhum feedback de tamanho ao usuário que escreve muito.
39. **Nenhum campo de agendamento pergunta se é reagendamento de algo cancelado/relacionado** — usuário que teve consulta cancelada e quer remarcar preenche um formulário do zero, sem vínculo com o registro anterior (perde rastreabilidade de "essa é a 2ª tentativa").

**Tela admin (`admin.html`)**
40. **Formulário "Cadastrar doença/alerta": campo `region` é texto livre** (`<input name="region">`), igual ao problema do `job_role` (achado #25) — mesma doença cadastrada por dois admins diferentes vira "Centro", "centro", "Zona Centro" no banco, quebrando filtro por região no dashboard do paciente (`/diseases?active=true` não agrupa por região normalizada). O projeto já tem um catálogo de bairros padronizado (`health_units.neighborhood`, ex.: "Centro", "Salinas", "Vila Boa Esperança") — ação: reaproveitar essa mesma lista como `<select>` em vez de reinventar texto livre.
41. **Reagendamento usa `prompt()` nativo do navegador pedindo data digitada à mão** (`adminReagendar`: `prompt('Nova data/hora (formato: AAAA-MM-DD HH:MM)...')`) — sem datepicker, sem máscara, sem validação de formato antes do envio. E o back (`admin.routes.js` `PATCH /:kind/:id`) também não valida formato: `if (scheduled_at) { updates.push('scheduled_at=?'); ... }` aceita qualquer string. Um admin que digita `20/08/2026` (formato comum no Brasil) em vez de `2026-08-20 14:30` provavelmente grava data inválida ou `NULL`/erro silencioso no MySQL sem feedback claro do motivo. Mesmo problema idêntico em `atendente.html` (`reagendar`). Ação: trocar `prompt()` por um modal com `<input type="datetime-local">` (já usado nos outros formulários do app) + validação de data futura no back.
42. **Duas telas de busca de usuário fazendo quase a mesma coisa com UX diferente** (já sinalizado no plano de UI/UX, achado #13) — reforçando aqui pelo ângulo de dado: `Histórico` exige e-mail (mas back aceita `LIKE`, então parcial já funcionaria), `Usuários` aceita nome/e-mail parcial + filtro de papel. A tela `Histórico` está artificialmente mais restritiva que a própria API permite.
43. **Alteração de status de conta (ativar/inativar usuário) não pede motivo/observação** — o formulário é só um `<select>` + botão "Salvar status"; o audit log grava apenas `status -> inativo`, sem contexto de *por que* (ex.: solicitação do próprio paciente, suspeita de fraude, atendente desligado da rede). Para rastreabilidade real em decisão administrativa sensível, vale um campo de observação opcional que vá para `details` do audit log.
44. **Papel (`role`) do usuário só é mostrado como texto informativo** ("alteração de papel somente via banco de dados diretamente") — correto como decisão de segurança (já sinalizado no achado #14), mas do ponto de vista de dado/operação, cria um processo manual fora do sistema sem trilha de auditoria alguma (mudança direta no banco não gera linha em `audit_log`). Se a intenção é realmente restringir, valeria pelo menos uma rotina/script auditado para promoção de papel, não acesso direto ao banco sem registro.

**Tela atendente (`atendente.html`)**
45. **Mesmo problema de `prompt()` para reagendar** (achado #41) replicado aqui — terceira cópia do mesmo padrão frágil (admin, atendente, e implicitamente qualquer telas futuras que copiarem o padrão).
46. **Busca de paciente (`GET /staff/patients?q=`) só retorna pacientes com `account_status = 'ativo'`** (hardcoded em `staff.routes.js`) — se o atendente busca um paciente inativo ou pendente, a busca simplesmente não retorna nada, sem nenhuma mensagem explicando que existe um cadastro mas está inativo. Do ponto de vista de recepção/atendimento presencial, isso pode ser confundido com "paciente nunca se cadastrou", levando a cadastro duplicado. Ação: back poderia diferenciar "não encontrado" de "encontrado mas inativo" (com mensagem apropriada, sem vazar dado sensível).
47. **Cargo do atendente (`job_role`) é exibido em texto livre no cabeçalho** (`greetingSub`: `SESSION.user.job_role + ' · ' + 'Painel de atendimento'`) — consequência direta de #25: como o dado de origem é texto livre, a saudação também herda qualquer inconsistência de digitação ("recepcionista" minúsculo, com/sem acento, etc.).

## Plano de ação sugerido (ordem recomendada)

### Fase 1 — Segurança básica (antes de qualquer deploy real)
- [ ] Girar `JWT_SECRET` e senha MySQL; nunca reusar os valores atuais do `.env` presente no disco.
- [ ] Criar `server/.env.example` de verdade (sem segredos) para bater com o README.
- [ ] Adicionar rate limiting em `/auth/login` e `/auth/signup` (`express-rate-limit`).
- [ ] Adicionar `helmet` em `app.js`.
- [ ] Trocar fallback de CORS de `'*'` para bloqueio explícito quando `CORS_ORIGIN` ausente em produção (`NODE_ENV=production`).
- [ ] `git init` + primeiro commit com checagem manual de `git status` para garantir que `.env` real não entra.

### Fase 2 — Robustez de dados
- [ ] Validação de payload (ex.: `zod` ou `express-validator`) em todas as rotas `POST`/`PUT`/`PATCH` — formato de email, CPF, datas futuras.
- [ ] Igualar obrigatoriedade de campo entre front e back no `/auth/signup` (CPF, RG, nascimento, gênero, nome da mãe, celular) — decidir a regra uma vez e validar no servidor, não só no HTML.
- [ ] Validar dígito verificador de CPF (função pura) tanto no front (feedback imediato) quanto no back (garantia real).
- [ ] Trocar `job_role` de texto livre para `<select>` com lista fixa de cargos + opção "Outro" condicional (mesmo padrão do campo "Especialidade" no dashboard).
- [ ] Validar `scheduled_at` no back como não-passado em `appointments`/`exams` (hoje só o front trava via `min`).
- [ ] Reavaliar obrigatoriedade de `reference_point`/`zone` — condicionar a exigência de ponto de referência a `zone === 'rural'`.
- [ ] Extrair lógica duplicada de `appointments`/`exams` (admin + staff + me) num helper único parametrizado por tabela.
- [ ] Implementar geração automática de `reminders` (job simples, ex. `node-cron`, rodando 1x/dia, criando lembrete N horas antes de `scheduled_at`).
- [ ] Adicionar paginação real (`OFFSET`/cursor) nas listagens administrativas.
- [ ] Substituir `prompt()` de reagendamento (admin e atendente) por modal com `<input type="datetime-local">` + validação de data futura no back.
- [ ] Trocar `region` do formulário de doenças de texto livre para `<select>` reaproveitando os bairros já cadastrados em `health_units`.
- [ ] Adicionar campo livre condicional ("Outro") em `exam_type`, replicando o padrão já usado em `specialty`.
- [ ] Diferenciar "paciente não encontrado" de "paciente encontrado mas inativo" na busca do atendente (`GET /staff/patients`), sem vazar dado sensível.
- [ ] Adicionar campo de observação/motivo opcional ao alterar `account_status` de usuário, registrado no `audit_log`.

### Fase 3 — Qualidade e manutenção
- [ ] Adicionar testes (Jest + supertest para rotas, mínimo: auth, isolamento por `user_id`, bloqueio de admin).
- [ ] Adicionar ESLint + Prettier, script `npm run lint`.
- [ ] Adicionar CI simples (GitHub Actions: lint + testes) assim que houver repositório remoto.
- [ ] Avaliar migração incremental para TypeScript ou, no mínimo, JSDoc nos modelos de dados principais (`User`, `Appointment`, `Exam`).

### Fase 4 — Produto / próximos passos (já sinalizados no README)
- [ ] Recuperação de senha ("esqueci minha senha").
- [ ] Blocklist de token / logout server-side (se token vazar).
- [ ] HTTPS obrigatório + política de retenção de dados (LGPD) antes de uso com pacientes reais.
- [ ] Confirmar com a Secretaria de Saúde termo de consentimento para coleta de dado sensível.

## Observação sobre uso de plugins/skills

Este diagnóstico foi feito por leitura direta do código (sem alterar nada), conforme pedido. Skills disponíveis no ambiente que se aplicam a fases futuras deste projeto, caso o usuário queira aprofundar depois:
- `security-review` — auditoria de segurança formal antes de deploy (cobre os itens da Fase 1 com mais profundidade).
- `web-design-guidelines` — revisão de acessibilidade/UX do frontend HTML atual.
- `code-review` — revisão de diff quando as mudanças da Fase 2/3 forem implementadas.

Nenhuma dessas foi executada agora — só citadas como próximo passo natural, já que o pedido foi "só informação".
