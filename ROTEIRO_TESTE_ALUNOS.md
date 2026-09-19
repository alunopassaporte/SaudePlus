# Roteiro de teste — Saúde+ (para usar em sala)

Use dados fictícios (nomes/e-mails inventados). Mesmo sendo um ambiente de
teste, é um bom hábito pegar desde já: nunca digitar dado de saúde real de
ninguém num sistema em desenvolvimento.

## 0) Checklist antes da aula começar

- [ ] MySQL rodando e `schema.sql` importado
- [ ] `server/.env` preenchido (`DB_PASSWORD`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`)
- [ ] `npm install` rodado dentro de `server/`
- [ ] `npm run seed:admin` rodado (cria o usuário admin)
- [ ] `npm start` rodando — `http://localhost:4000/health` responde `{"ok":true}`
- [ ] `npx serve .` rodando na raiz do projeto — anote a porta exata que apareceu
- [ ] Se a porta do `serve` não for 8080, ajustar `CORS_ORIGIN` no `.env` e reiniciar a API

## 1) Papel: aluno (usuário comum)

1. Abrir a página inicial → **Criar conta** → preencher nome, e-mail e senha fictícios.
2. Fazer login com a conta recém-criada.
3. Verificar que caiu em `dashboard.html` (não em `admin.html`).
4. Aba **Consultas** → agendar uma consulta fictícia → confirmar que aparece na lista "Minhas consultas".
5. Aba **Exames** → agendar um exame fictício → confirmar que aparece em "Meus exames".
6. Aba **Início** → confirmar que a consulta e o exame aparecem em "Próximos eventos" e que os números do topo (cards) bateram.
7. Clicar **Sair** → confirmar que volta para a tela de login.

## 2) Papel: você (admin)

1. Login com a conta admin (criada pelo `seed:admin`).
2. Confirmar que caiu direto em `admin.html`.
3. Aba **Visão geral** → confirmar que aparecem as consultas e exames **de todos os alunos que testaram**, não só os seus.
4. Aba **Histórico de consultas** → buscar pelo e-mail de um aluno específico → confirmar que aparece *só* o histórico daquele aluno.
5. Aba **Doenças** → cadastrar um alerta (ex: "Dengue", região "Centro", nível "alto") → salvar.
6. Pedir para um aluno recarregar a aba **Alertas** no painel dele → confirmar que o alerta aparece lá.

## 3) Teste de segurança (a parte que realmente importa)

Esse é o ponto que prova que "usuário só vê o que é dele" não é só uma
promessa da interface — é uma regra do servidor.

1. Com dois alunos logados em navegadores/abas diferentes: o aluno A não
   deve ver, em nenhuma tela, qualquer consulta ou exame do aluno B.
2. Pedir para um aluno (não-admin) digitar a URL `admin.html` diretamente
   na barra de endereço, estando logado → deve ser redirecionado
   automaticamente para `dashboard.html` com um aviso de "acesso restrito".
3. Abrir o DevTools (F12) → aba **Network** → refazer uma ação qualquer →
   mostrar para a turma que toda chamada à API carrega um cabeçalho
   `Authorization: Bearer ...` — é esse token que a API usa para saber
   quem está pedindo o quê, e por isso o front sozinho não basta para
   proteger nada: a regra real está no `server/src/middleware/auth.js`.
4. Deslogar (botão **Sair**) e tentar digitar `dashboard.html` direto na
   URL → deve redirecionar para `auth.html` (ninguém vê nada sem login).

## 4) Problemas comuns

| Sintoma                                                | Causa provável                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| "Failed to fetch" no console                           | API não está rodando, ou `CORS_ORIGIN` no `.env` não bate com a porta do `npx serve`         |
| "Token inválido ou expirado"                           | Token expira em 7 dias por padrão (`JWT_EXPIRES_IN`) — basta logar de novo                   |
| Erro ao instalar dependências                          | Confirme que está usando `bcryptjs` (não `bcrypt`) — já vem assim no `package.json` entregue |
| Porta 4000 ocupada                                     | Mude `PORT` no `.env` **e** `window.API_BASE` no front antes de carregar `assets/api.js`     |
| Aluno cria conta mas não consegue ver alerta de doença | Alertas só aparecem com `active = 1` — confirme no painel admin                              |
