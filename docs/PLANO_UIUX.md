# Plano de Melhorias — Interface, UX e UI (Saúde+)

Análise gerada em 2026-07-20, complementar ao [PLANO_MELHORIAS.md](PLANO_MELHORIAS.md) (backend/segurança). Escopo: `index.html`, `auth.html`, `dashboard.html`, `admin.html`, `atendente.html`, `assets/styles.css`. Só leitura — nada alterado.

## O que já está bem resolvido (não mexer sem motivo)

- **Design system consolidado** em `styles.css` via CSS custom properties (`--primary`, `--radius`, `--shadow`...) — paleta "lagoa" com propósito declarado (alto contraste, tipografia generosa para público com baixa familiaridade digital).
- **Acessibilidade de base já presente**: `:focus-visible` global com outline de 3px, `prefers-reduced-motion` respeitado, `aria-selected`/`role="tab"`/`role="tabpanel"` nas abas de todos os 3 painéis internos, `autocomplete` correto nos campos de login/senha.
- **Sanitização de output**: função `esc()` usada consistentemente antes de injetar dado dinâmico no DOM — evita XSS refletido via nome/observações do usuário.
- **Estado vazio tratado** (`.empty`, mensagens tipo "Nenhum registro") em vez de listas quebradas ou brancas.
- **Feedback de carregamento** (`.spinner`) e feedback de ação (`.toast` com variantes success/error) presentes em todo fluxo assíncrono.
- **Wizard de cadastro em 4 passos** com indicador visual de progresso (`.wizard-steps`) — bem pensado para reduzir abandono num formulário longo (20+ campos).
- **Máscaras de input em tempo real** (CPF, telefone, CEP) e autopreenchimento via ViaCEP com fallback manual.

## Achados por prioridade

### 🔴 Alto impacto — usabilidade/acessibilidade real

1. **Uso de `confirm()` nativo do navegador** para cancelar agendamento (`dashboard.html:330`) — inconsistente com o design system (não segue a paleta, não é responsivo em mobile, texto do botão não customizável, ruim para leitor de tela). Deveria ser um modal próprio com os mesmos componentes (`.card`, `.btn`) do resto do app.
2. **`alert()`/`confirm()` como única confirmação destrutiva** — cancelar consulta/exame é ação com peso real (paciente pode perder vaga), e a única fricção é um `confirm()` de uma linha, sem explicar consequência específica (ex.: "essa vaga pode não voltar a ficar disponível").
3. **Sem loading state nos botões de submit dos formulários de agendamento** (`addAppt`, `addExam`) — só o botão de signup (`submitBtn`) desabilita e troca texto durante o request; os formulários do dashboard não bloqueiam duplo clique, permitindo submissão dupla acidental (ex.: rede lenta + usuário clica de novo).
4. **Mensagens de erro genéricas demais em alguns pontos** — `toast(err.message||'Erro','error')` em `addAppt/addExam` não diferencia erro de rede, erro de validação do servidor, ou erro de horário no passado; usuário não entende o que corrigir.
5. **Navegação por teclado dentro das tabs não implementada** — `role="tab"` está presente mas não há handler de seta esquerda/direita entre abas (padrão ARIA para `tablist` esperado por leitores de tela avançados/usuários de teclado).
6. **Campos obrigatórios do wizard (passo 2 e 3) não usam `aria-invalid` nem mensagem inline** — a validação (`validateStep2`, `validateStep3`) só foca o campo e dispara toast; usuário de leitor de tela não é avisado *qual* campo falhou de forma associada ao input (`aria-describedby`).
7. **Sem indicação de força de senha** no cadastro — só valida `length >= 6` no `submitSignup`; senha fraca (`123456`) passa sem aviso, em app que guarda dado de saúde sensível.

### 🟠 Médio impacto — consistência e polimento

8. **Duplicação quase total de CSS inline em `style="..."`** espalhado pelos HTMLs (ex.: `style="text-align:center;margin-bottom:8px"` repetido em várias seções, `style="grid-column:1/-1"` repetido dezenas de vezes) — quebra a disciplina de design system que `styles.css` estabelece; deveria virar classes utilitárias (`.text-center`, `.col-span-full`) reaproveitáveis.
9. **Duplicação de JS entre `dashboard.html`, `admin.html`, `atendente.html`** — cada um reimplementa `switchTab`, `statusClass`, `fmtDate`-adjacent helpers, `esc()` já está em `api.js` mas outros helpers (`stat()`, `levelClass()`) são redefinidos por página. Risco: corrigir um bug de status/badge em uma tela e esquecer as outras duas (mesmo padrão já sinalizado no plano de backend para as rotas).
10. **Formulários de agendamento não usam `datetime-local` `max`** — só têm `min` (`nowLocalForInput()`), então dá pra agendar consulta daqui a 50 anos sem aviso; UX permite erro de digitação de data óbvio (ano errado) sem qualquer alerta.
11. **Botão "Editar" em itens de lista faz scroll pro formulário** (`form.scrollIntoView`) mas não há indicação visual de "modo edição ativo" além do texto do título/botão mudar — em telas longas, fácil perder o contexto de que está editando algo específico (ex.: destacar borda do card do formulário).
12. **Select de especialidade "Outra"** (`specialtySelect` com `__outra`) é um padrão bom, mas não existe equivalente para tipo de exame nem local (`exam_type`, `location`) — inconsistência: em um form dá pra digitar livre, no outro não.
13. **Painel admin: busca de usuário e busca de histórico são telas/abas separadas** (`Histórico` busca por e-mail exato, `Usuários` busca por nome/e-mail parcial) fazendo praticamente a mesma coisa com UX diferente — unificar reduziria carga cognitiva do atendente/admin.
14. **Sem "Cancelar" nos formulários de criação** (só existe "Cancelar edição", que só aparece em modo edição) — usuário que preenche metade de um formulário longo (agendamento com observações) não tem botão explícito de "descartar e voltar", só pode trocar de aba.
15. **Mobile**: `.grid-2` em vários formulários vira 1 coluna abaixo de 480px/760px (bom), mas `.wizard-steps` (indicador de progresso do cadastro) não tem regra de mobile específica — com 4 passos e texto ("Tipo", "Dados", "Endereço", "Acesso") pode apertar em telas muito pequenas (< 360px), vale checar visualmente.

### 🟡 Baixo impacto — refinamento

16. **Tipografia**: só um peso de família (Inter) carregado via Google Fonts sem `font-display` explícito no `<link>` (embora `&display=swap` já esteja na URL — correto) — ok, mas vale considerar hospedar a fonte localmente para não depender de request externo (relevante para público rural com internet instável, que é justamente o público-alvo declarado no README).
17. **Ícones SVG inline repetidos** (ex.: ícone de cadeado em "trust-item", ícone de coração) — sem um sprite/symbol compartilhado, cada HTML carrega o path SVG duplicado; não afeta performance de forma crítica no tamanho atual, mas cresce mal.
18. **Sem skeleton loading** — usa spinner central genérico (`.spinner`) em vez de skeleton nas listas (cards cinza pulsando no formato do conteúdo final), o que causa mais "pulo" de layout quando o conteúdo chega.
19. **Sem dark mode** — não é falha, só ausência; dado o público (baixa familiaridade digital, provavelmente uso diurno), baixa prioridade real.
20. **Contraste de `.opt` (texto "(opcional)")** usa `--muted` (#5B6E6A) em fonte pequena (.75rem/.8rem) — vale checar contraste mínimo AA para texto pequeno (WCAG exige 4.5:1 para texto < 18px; `--muted` sobre `--surface` branco dá aproximadamente 5.3:1, deve passar, mas vale confirmar com ferramenta em vez de estimar).
21. **`atendenteNote`, mensagens de aviso (`⚠️`)** usam emoji direto no texto — funciona, mas emoji não tem `aria-label`/`role="img"`, leitor de tela pode ler o nome do emoji de forma estranha ("sinal de aviso" antes do texto) dependendo do software.

## Plano de ação sugerido (ordem recomendada)

### Fase 1 — Acessibilidade e confirmação de ações críticas
- [ ] Substituir todo `confirm()`/`alert()` nativo por modal próprio do design system (componente `.modal` reaproveitável, mesmo padrão dos `.card`).
- [ ] Adicionar `aria-invalid` + mensagem inline associada (`aria-describedby`) nos campos obrigatórios do wizard, além do toast atual.
- [ ] Implementar navegação por seta esquerda/direita nas `role="tab"` (padrão ARIA APG para tablist).
- [ ] Adicionar `max` em todos os inputs `datetime-local` (limite razoável, ex.: +1 ano) para pegar erro de digitação de data.

### Fase 2 — Consistência de estado e feedback
- [ ] Desabilitar + trocar texto do botão em `addAppt`/`addExam` durante o request (mesmo padrão já usado em `submitSignup`), evitando duplo submit.
- [ ] Diferenciar mensagens de erro por causa (rede vs. validação vs. servidor) nos `catch` dos formulários.
- [ ] Adicionar indicador de força de senha no cadastro (mínimo: fraca/média/forte, sem lib externa — regex simples já resolve).
- [ ] Adicionar botão "Cancelar" explícito (não só "Cancelar edição") nos formulários de criação, limpando o form.

### Fase 3 — Consolidação de design system
- [ ] Extrair `style="..."` inline repetido para classes utilitárias em `styles.css` (`.text-center`, `.col-span-full`, `.mt-*`).
- [ ] Extrair helpers JS duplicados (`switchTab`, `statusClass`, `stat`, `levelClass`) para um `assets/ui.js` compartilhado entre `dashboard.html`, `admin.html`, `atendente.html`.
- [ ] Padronizar campo "Outro/Outra" (texto livre) em todos os selects que hoje têm lista fechada (`exam_type`, `location`), não só em `specialty`.
- [ ] Unificar busca de usuário/histórico no admin numa única tela.

### Fase 4 — Polimento visual
- [ ] Trocar spinner central por skeleton loading nas listas (`.item` placeholder cinza).
- [ ] Avaliar hospedar Inter localmente (`assets/fonts/`) para reduzir dependência de rede externa, dado público-alvo rural.
- [ ] Consolidar ícones SVG repetidos em um `<svg><symbol>` sprite único, referenciado via `<use>`.
- [ ] Rodar checagem de contraste real (ex. `axe DevTools` ou Lighthouse) nos textos `--muted` pequenos para confirmar AA.

## Observação sobre plugins/skills

Diagnóstico feito por leitura direta do HTML/CSS (sem alterar nada), como pedido. Para aprofundar quando o usuário quiser agir:
- `web-design-guidelines` — checklist formal de Web Interface Guidelines (contraste, foco, ARIA) aplicado item a item nas páginas.
- `frontend-design` — orientação de direção visual caso queira revisar identidade além do que já existe (paleta "lagoa" já é uma escolha deliberada e coerente, não recomendo redesenho do zero).
- `design-taste-frontend` / `minimalist-ui` — só relevantes se o pedido for redesign visual amplo; hoje o sistema visual atual é consistente e não parece "genérico", então baixa prioridade.

Nenhuma dessas foi executada agora — só citadas como próximo passo, conforme pedido de "só informação".
