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
