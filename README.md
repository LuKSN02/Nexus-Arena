# Nexus Arena — Portal de E-Sports + Loja Gamer

Site completo (front-end + "back-end" simulado) de notícias de e-sports com
loja integrada de periféricos, construído em **HTML, CSS e JavaScript puro**
— sem frameworks, sem dependências de build.

## Como rodar

Basta abrir `index.html` no navegador (duplo clique) **ou**, para evitar
qualquer restrição de `file://` no seu navegador, subir um servidor local:

```bash
cd esports-hub
python3 -m http.server 8080
# depois acesse http://localhost:8080
```

Não é necessário instalar nada — não há `npm install`, não há build step.

## Estrutura de arquivos

```
esports-hub/
├── index.html          # Shell da página: tela de login/cadastro, layout do app,
│                        # drawer do carrinho e modal genérico
├── style.css            # Todos os tokens de design (cor, tipografia, espaçamento)
│                        # e estilos de componentes
├── js/
│   ├── icons.js          # Biblioteca própria de ícones SVG inline (substitui 100%
│   │                      # dos emojis do site)
│   ├── utils.js          # Formatação (moeda, datas), validação de e-mail/senha,
│   │                      # sistema de toasts (notificações)
│   ├── db.js              # Camada de "banco de dados" — persiste tudo em
│   │                      # localStorage (usuários, sessão, comentários, curtidas,
│   │                      # carrinho, pedidos)
│   ├── data.js             # Conteúdo semente: categorias de jogos, notícias,
│   │                      # produtos da loja, arte SVG abstrata gerada por jogo
│   ├── api.js               # Camada de "API" — funções assíncronas com latência
│   │                      # simulada (Promises), validações de negócio e erros
│   │                      # no formato { field, message }, igual a uma API real
│   └── app.js               # Estado da aplicação, roteamento entre views,
│                        # renderização e todos os event handlers
└── README.md
```

## Por que "back-end simulado"?

Este é um artefato estático (HTML/CSS/JS puro), então não há servidor real por
trás. Para que a experiência ainda seja **funcional de ponta a ponta**, a
camada `api.js` foi escrita como se fosse uma API de verdade:

- Todos os métodos são `async` e retornam `Promise`.
- Há uma latência artificial (`Utils.delay`) simulando round-trip de rede.
- Erros de validação são lançados no formato `{ field, message }`, do jeito
  que uma API real devolveria erros de campo específico.
- A "persistência" (`db.js`) usa `localStorage` no lugar de um banco de dados.

**Para migrar para um back-end real** (ex.: Node.js/Express + PostgreSQL,
ou Firebase/Supabase), a única coisa que precisa mudar é a implementação
interna de cada método em `api.js` (trocar leitura/escrita no `DB` por
`fetch()` para endpoints reais). Nada em `app.js` precisaria mudar, pois a UI
só conhece o contrato de `Api.*`.

> Nota de segurança: o "hash" de senha em `utils.js` (`simpleHash`) é apenas
> uma simulação para fins de demonstração — **não é criptográfico**. Em um
> back-end real, o hash de senha deve ser feito no servidor com bcrypt/argon2
> e a senha nunca deve trafegar ou ser validada apenas no front-end.

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
