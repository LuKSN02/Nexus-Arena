# Nexus Arena — Portal de E-Sports + Loja Gamer

Site de notícias de e-sports com loja integrada de periféricos, construído
em **HTML, CSS e JavaScript puro** — sem frameworks, sem dependências de
build — com autenticação e persistência de dados reais via **Firebase**
(Authentication + Firestore).

## Como rodar

Basta abrir `index.html` no navegador (duplo clique) **ou**, para evitar
qualquer restrição de `file://` no seu navegador, subir um servidor local:

```bash
cd esports-hub
python3 -m http.server 8080
# depois acesse http://localhost:8080
```

Não é necessário instalar nada — não há `npm install`, não há build step.
Mas login/cadastro só funcionam depois de configurar o Firebase — veja a
seção **Backend real: Firebase** abaixo.

## Estrutura de arquivos

```
esports-hub/
├── index.html          # Shell da página: tela de login/cadastro, layout do app,
│                        # drawer do carrinho e modal genérico
├── style.css            # Todos os tokens de design (cor, tipografia, espaçamento)
│                        # e estilos de componentes
├── firestore.rules       # Regras de segurança do Firestore (cole no console)
├── firebase.json         # Configuração de deploy (Hosting + regras do Firestore)
├── .firebaserc            # ID do seu projeto Firebase (edite antes de publicar)
├── js/
│   ├── firebase-init.js  # Único arquivo que importa o SDK do Firebase; expõe
│   │                      # tudo que o resto do app precisa em window.fb
│   ├── icons.js          # Biblioteca própria de ícones SVG inline (substitui 100%
│   │                      # dos emojis do site)
│   ├── utils.js          # Formatação (moeda, datas), validação de e-mail/senha,
│   │                      # sistema de toasts (notificações)
│   ├── db.js              # Camada de "banco de dados" — fala com o Firestore
│   │                      # (usuários, comentários, curtidas, carrinho, pedidos...)
│   ├── data.js             # Conteúdo estático do catálogo: categorias de jogos,
│   │                      # notícias, produtos da loja, arte SVG por jogo
│   ├── api.js               # Camada de "API" — Firebase Auth + repassa para o
│   │                      # db.js; erros no formato { field, message }
│   └── app.js               # Estado da aplicação, roteamento entre views,
│                        # renderização e todos os event handlers
└── README.md
```

## Por que uma camada de "API" própria?

`api.js` é a única camada que `app.js` (toda a UI) conhece — ela nunca fala
com o Firebase diretamente. Isso existe para que a UI não precise saber de
onde os dados vêm:

- Todos os métodos são `async` e retornam `Promise`.
- Erros são lançados no formato `{ field, message }`, do jeito que uma API
  real devolveria erros de campo específico.
- A "persistência" (`db.js`) fala com o Firestore através da ponte em
  `window.fb` (definida em `js/firebase-init.js`).

Se um dia quiser trocar o Firebase por outro backend (Node/Express, Supabase
etc.), só a implementação interna de `api.js`/`db.js` precisa mudar — nada
em `app.js` seria afetado, porque a UI só conhece o contrato de `Api.*`.

## Backend real: Firebase (Auth + Firestore)

O projeto já está migrado do `localStorage` para o Firebase de verdade —
autenticação, carrinho, lista de desejos, comentários, avaliações, pedidos,
notificações e newsletter são todos lidos/escritos no Firestore. O único
conteúdo que continua estático em `js/data.js` é o catálogo (as notícias e
os produtos em si) — só dado gerado pelo usuário foi para o banco.

### Configurar seu projeto

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com).
2. Em **Build → Authentication**, ative o provedor **E-mail/senha**.
3. Em **Build → Firestore Database**, crie o banco (modo produção).
4. Em **Configurações do projeto → Seus apps**, registre um app Web e copie
   o `firebaseConfig`.
5. Cole esse `firebaseConfig` em `js/firebase-init.js` (tem um `TODO`
   marcando onde). Sem isso preenchido, o site carrega normalmente mas
   login/cadastro vão falhar.
6. Copie o conteúdo de `firestore.rules` (na raiz do projeto) para
   **Firestore Database → Regras** no console e publique. Sem isso, o
   Firestore em modo produção nega todas as leituras/escritas por padrão —
   o app carrega, mas nada funciona.

### Arquitetura da migração

- `js/firebase-init.js` — único arquivo que importa o SDK do Firebase
  (via CDN, como módulo ES). Expõe o necessário em `window.fb` para o
  resto do app, que continua em scripts clássicos.
- `js/db.js` — reescrito para falar com coleções do Firestore em vez do
  `localStorage`. Toda função virou assíncrona.
- `js/api.js` — reescrito para usar Firebase Authentication (cadastro,
  login, logout, troca de senha, exclusão de conta) e para repassar tudo
  o mais para o `db.js` atualizado. `app.js` não precisou saber de nada
  disso — só uns poucos pontos que chamavam `DB.*` direto (carrinho e
  validação de usuário em tempo real) foram ajustados para `await`.

⚠️ Scripts `type="module"` sempre rodam depois de todos os scripts
clássicos da página, mesmo aparecendo antes no HTML. Por isso nenhuma
função de `api.js`/`db.js` lê `window.fb` fora do corpo de uma função —
só dentro, porque essas funções só são chamadas depois que a página
termina de carregar (a partir de `init()`, em `app.js`).

### Modelo de dados no Firestore

| Coleção | Documento | O que guarda |
|---|---|---|
| `users` | `{uid}` | perfil (username, tag, avatar, banner, badges...) |
| `comments` | auto ID | comentários de notícia + respostas (`parentId`) |
| `articleLikes` | `{articleId}` | `{ userIds: [...] }` |
| `reviews` | auto ID | avaliações de produto (uma por usuário/produto) |
| `orders` | auto ID | pedidos, com `ownerKey` = uid do dono |
| `carts` | `{uid}` | `{ items: [{productId, qty}] }` |
| `wishlists` | `{uid}` | `{ productIds: [...] }` |
| `notifications` | auto ID | com `ownerKey` = uid do dono |
| `newsletterSubs` | `{email}` | inscrição na newsletter |
| `meta` | `seedStatus` | trava para o conteúdo de demonstração rodar 1x só |

### O que mudou de comportamento

- **Login aceita "usuário" ou e-mail**, como antes — mas o Firebase Auth só
  autentica por e-mail, então quando você digita um nome de usuário o app
  primeiro resolve o e-mail correspondente no Firestore antes de autenticar.
- **Sessão** não é mais checada de forma síncrona: `Api.onAuthReady()`
  substitui o antigo `Api.getCurrentUser()` e resolve depois que o Firebase
  confirma (ou nega) a sessão restaurada.
- **Troca de senha e exclusão de conta** agora pedem reautenticação (o
  Firebase exige login recente para essas duas operações) — por isso os
  dois fluxos continuam pedindo a senha atual, só que agora ela é validada
  pelo Firebase, não por um hash local.
- **Comentários e avaliações agora são realmente multiusuário** — como o
  Firestore é um banco compartilhado (não mais por navegador), qualquer
  pessoa que acessar o site com sua própria conta vê e participa dos
  mesmos comentários. O conteúdo de demonstração (comentários/avaliações
  de exemplo) roda uma única vez globalmente, controlado pelo documento
  `meta/seedStatus`, em vez de uma flag por navegador.
- **Carrinho de convidado** (antes de logar) continua no `localStorage` —
  o app inteiro fica atrás da tela de login mesmo assim, então esse
  caminho praticamente não é usado na prática.

### Limitações conhecidas (aceitáveis para uso pessoal/demo)

- As regras do Firestore não usam Cloud Functions nem transações — o
  "trava" do seed de conteúdo tem uma pequena janela de corrida teórica em
  cargas simultâneas (não é um problema real no uso normal).
- Sem paginação no `getDocs()` das listagens (comentários, avaliações,
  pedidos, notificações) — para o volume de um projeto pessoal isso não é
  problema, mas cresceria mal em escala de produção real.
- `console.firebase.google.com` cobra por leitura/escrita/armazenamento
  acima do free tier (Spark) — de olho no uso se o tráfego crescer.

### Publicar no Firebase Hosting

O projeto já vem com `firebase.json` e `.firebaserc` prontos — a raiz da
pasta É o site (não há build step), então publicar é direto:

1. Instale a CLI (uma vez só, globalmente):
   ```bash
   npm install -g firebase-tools
   ```
2. Faça login (abre o navegador para autenticar):
   ```bash
   firebase login
   ```
3. Edite `.firebaserc` e troque `"SEU-PROJECT-ID"` pelo ID do seu projeto
   (o mesmo que você já usou em `firebaseConfig`, em `js/firebase-init.js`
   — aparece em **Configurações do projeto** no console).
4. Publique, de dentro da pasta `esports-hub/`:
   ```bash
   firebase deploy
   ```
   Isso sobe o site (Hosting) **e** as regras do Firestore (`firestore.rules`)
   de uma vez. Se quiser publicar só um dos dois:
   ```bash
   firebase deploy --only hosting
   firebase deploy --only firestore:rules
   ```
5. O site fica em `https://SEU-PROJECT-ID.web.app` (e também em
   `https://SEU-PROJECT-ID.firebaseapp.com`).

Rodando em `https://`, o Service Worker (`sw.js`) passa a registrar de
verdade — diferente de abrir o `index.html` direto do disco (`file://`),
onde ele é ignorado. É a partir do deploy que dá pra testar "Instalar app"
e o funcionamento offline pra valer.

> Cada `firebase deploy` sobrescreve a versão anterior do site — não há
> histórico de versões automático além do que o próprio Firebase Hosting
> mantém internamente (dá pra reverter pelo console, em **Hosting → Versões
> anteriores**, se precisar).

## Conta — funcionalidades extras

- **Histórico de pedidos**: nova aba "Meus Pedidos" no painel de perfil,
  listando todos os pedidos do usuário (mais recente primeiro) com resumo
  expansível — itens, subtotal, desconto de cupom, frete e forma de
  pagamento.
- **Central de notificações**: sino na navbar com contador de não lidas.
  O app gera notificações reais para eventos da própria conta: boas-vindas
  ao criar conta, confirmação de pedido, emblema conquistado (primeira
  compra) e confirmação de inscrição na newsletter. Dá pra marcar
  individualmente ou todas de uma vez como lidas.
- **Exportar meus dados**: botão em Configurações da conta que baixa um
  `.json` com tudo que a plataforma guarda sobre o usuário — perfil,
  pedidos, lista de desejos, carrinho, comentários, avaliações e
  notificações (portabilidade de dados, no espírito de LGPD/GDPR).
- **Excluir minha conta**: fluxo de exclusão com duas confirmações
  (digitar "EXCLUIR" + senha atual) antes de apagar a conta e todos os
  dados pessoais vinculados (carrinho, lista de desejos, notificações,
  sessão). Pedidos, comentários e avaliações permanecem no sistema de forma
  desvinculada, como a maioria das plataformas reais faz por motivos de
  histórico/contabilidade.

## Notícias — funcionalidades extras

- **Newsletter**: card na barra lateral da home com captura de e-mail
  validada, salva em `localStorage` (lista de inscritos, sem envio real de
  e-mail — é uma demonstração de front-end).
- **Compartilhar de verdade**: o botão "Compartilhar" usa a Web Share API
  nativa do navegador/celular quando disponível (abre o menu de
  compartilhamento do sistema); nos navegadores sem suporte, copia o link
  para a área de transferência automaticamente.
- **Notícias relacionadas**: ao fim de cada matéria, até 3 notícias da mesma
  categoria, clicáveis (reabrem o modal já na nova notícia).
- **Mais lidas da semana**: widget na lateral da home com o ranking das 5
  notícias com mais curtidas + comentários combinados.
- **Respostas em comentários**: cada comentário de nível principal tem um
  botão "Responder", que abre um campo de resposta em thread (um nível de
  aninhamento, no estilo YouTube/Reddit) — curtir e remover funcionam também
  nas respostas.
- **Busca unificada com dropdown**: digitar na busca da navbar mostra um
  dropdown com notícias e produtos correspondentes em tempo real, sem sair
  da página atual; clicar num resultado abre o item direto. A filtragem da
  página (home/loja) continua acontecendo em paralelo, se você já estiver
  nela.

## Loja — funcionalidades extras

- **Lista de desejos**: ícone de coração na navbar (com contador) e botão de
  favoritar em cada card de produto. Persistida por usuário no `localStorage`,
  com modal próprio para revisar e mover itens direto para o carrinho.
- **Avaliações de produtos**: cada produto tem uma página de detalhe (clique
  no card) com nota em estrelas, comentário e selo de "Compra verificada"
  quando o avaliador já tem um pedido com aquele produto. Um usuário só pode
  ter uma avaliação por produto (enviar de novo edita a existente) e só pode
  remover a própria.
- **Cupom de desconto**: campo de cupom no carrinho e no checkout. Cupons de
  demonstração já cadastrados em `js/data.js` (`COUPONS`):
  `NEXUS10` (10% off), `BEMVINDO20` (20% off) e `FRETEGRATIS` (frete grátis).
- **Página de detalhe do produto**: modal com descrição completa, seletor de
  quantidade, ação de favoritar e a seção de avaliações — tudo no mesmo lugar,
  acessado clicando em qualquer card da vitrine.

## Acessibilidade

- **Link "pular para o conteúdo"**: primeiro elemento focável da página,
  visível apenas ao navegar por teclado (Tab), leva direto para `#mainContent`.
- **Contraste de texto**: a cor `--text-faint`, usada em textos secundários
  (datas, contadores, legendas), foi ajustada para atingir 4,5:1 de contraste
  contra o fundo (mínimo recomendado pelo WCAG AA para texto normal).
- **Navegação por teclado**:
  - `Esc` fecha o modal aberto, o carrinho ou o menu mobile, na ordem.
  - Modal e carrinho prendem o foco enquanto abertos (Tab/Shift+Tab não
    escapam para o conteúdo por trás) e devolvem o foco ao elemento que os
    abriu ao fechar.
  - O carrossel de manchetes responde às setas ← → quando focado (via Tab
    ou clique), além dos botões de seta e dos indicadores.
- **Rótulos ARIA**: todo botão que só tem ícone (curtir, remover do
  carrinho, aumentar/diminuir quantidade, fechar modal, paginação, setas do
  carrossel, mostrar/ocultar senha) tem `aria-label` correspondente; o botão
  de curtir usa `aria-pressed` para expor o estado.
- Os cartões de cor do banner (perfil) agora são `<button>` reais — antes
  eram `<span>`, inacessíveis por teclado.
- Arte SVG decorativa (ilustrações de fundo por categoria) marcada com
  `aria-hidden="true"` para não poluir a leitura por leitor de tela.

## Infraestrutura (PWA, SEO social, performance)

- **PWA instalável**: `manifest.json` + `sw.js` (Service Worker). Com o site
  rodando em `http://localhost` (veja "Como rodar" acima), o navegador passa
  a oferecer "Instalar app", e as páginas visitadas ficam disponíveis mesmo
  offline (estratégia cache-first para o app shell). Existe também uma
  `offline.html` de fallback para quando não há cache disponível.
  > Service Workers exigem contexto seguro — não funcionam abrindo o
  > `index.html` direto do disco (`file://`). O site continua funcionando
  > normalmente nesse caso, só sem o recurso de instalação/offline.
- **Open Graph e Twitter Card**: `assets/og-image.png` (1200×630) + meta tags
  no `<head>`, para o link do site aparecer com título, descrição e imagem ao
  ser compartilhado no WhatsApp, Discord, X/Twitter etc.
- **Favicon completo**: `favicon.ico`, PNGs em 16/32/192/512px e
  `apple-touch-icon` para todos os contextos (aba do navegador, atalho no
  celular, ícone do app instalado).
- **Lazy loading**: avatares carregados dentro de modais (comentários) usam
  `loading="lazy" decoding="async"` para não bloquear o carregamento inicial.
- **Paginação real**: a grade de notícias e a vitrine da loja usam paginação
  numerada (com "…" para muitas páginas) em vez de carregar tudo de uma vez,
  reduzindo a quantidade de DOM renderizado por vez.

## Funcionalidades implementadas
**Autenticação**
- Cadastro e login com validação de campos em tempo real (formato de e-mail,
  força de senha com medidor visual, confirmação de senha).
- Mensagens de erro específicas por campo (usuário não encontrado, senha
  incorreta, e-mail já cadastrado, etc).
- Sessão persistida em `localStorage` (permanece logado ao recarregar).

**Interface estilo Discord**
- Chip de perfil na navbar com avatar e indicador de status (online / ausente
  / não perturbe / invisível).
- Painel de perfil em modal: banner colorível, avatar (upload de foto real,
  redimensionado no canvas), status personalizado, insígnias e aba de
  configurações da conta (troca de senha, logout).

**Portal de notícias**
- Carrossel de manchetes com autoplay, setas e indicadores.
- Filtro por categoria de jogo (League of Legends, CS2, Valorant, Free Fire,
  Dota 2) e busca por texto.
- Grade de artigos com paginação "carregar mais".
- Modal de notícia com curtidas e comentários (adicionar, curtir, remover
  comentário próprio).

**Loja virtual**
- Vitrine de periféricos (mouses, teclados, headsets) e itens virtuais.
- Filtro por categoria e por faixa de preço.
- Carrinho 100% funcional: adicionar, remover, alterar quantidade e total em
  tempo real (com regra de frete grátis acima de R$ 300).
- Checkout em duas etapas (entrega + pagamento) com validação de formulário,
  três formas de pagamento simuladas (cartão, Pix, boleto) e tela de pedido
  confirmado com número de pedido.

Todos os ícones do site (carrinho, curtir, comentar, perfil, configurações,
etc.) são SVG inline nativos — nenhum emoji é usado em nenhuma parte da
interface.
