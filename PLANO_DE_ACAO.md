# Plano de Ação — Nexus Arena

Stack confirmada no código: front-end vanilla JS (sem bundler/framework),
Firebase Auth + Firestore, Firebase Hosting (plano **Spark**, gratuito), PWA
com service worker. Sem backend próprio.

## Diagnóstico (feito lendo o código real, não supondo)

| # | Item pedido | Situação encontrada |
|---|---|---|
| 1 | Sessão persistente | ✅ Já funcionava. `Api.onAuthReady()` + `onAuthStateChanged` (persistência local padrão do Firebase) são aguardados em `init()` antes de renderizar a UI. Nenhuma mudança de código necessária. |
| 2 | Esqueci a senha | ✅ Já funcionava. Link → modal → `Api.forgotPassword()` → `sendPasswordResetEmail` do Firebase Auth, com mensagem genérica anti-enumeração. |
| 4 | Verificação de senha | ✅ Já funcionava. `Utils.passwordStrength()` bloqueia senha fraca no cadastro; campo `#regPassword2` já valida "senhas coincidem" em tempo real. |
| 7 | Cupom na loja | ✅ Já funcionava. Campo de cupom no carrinho e no checkout, `Api.applyCoupon()` valida contra a lista `COUPONS` e aplica desconto (percentual ou frete grátis) antes do total final. |
| 3 | Mobile responsivo | ⚠️ Parcialmente revisado nesta rodada. O código já tinha menu hambúrguer, grids que colapsam e drawer full-width — não encontrei `<table>` nem uma causa óbvia de "tudo quebrado" olhando só o código estático. Apliquei um hardening defensivo (abaixo), mas **preciso de um print ou da URL ao vivo** pra caçar o bug exato — senão fico chutando CSS. |
| 5 | Newsletter funcional | ❌ Gap real — implementado nesta rodada com EmailJS (ver seção 5). |
| 6 | Moedas Nexus grátis | ❌ Gap real — implementado nesta rodada: bônus diário de 15 moedas (ver seção 6). |

## O que foi alterado nesta rodada

### 3. Hardening mobile (`style.css`)
Adicionei um bloco `HARDENING MOBILE ADICIONAL` no final do arquivo:
- `overflow-x:hidden` em `html, body` — a causa nº1 de "tudo desalinhado" no
  celular é UM elemento largo demais forçando scroll horizontal, que empurra
  o layout inteiro.
- `img, svg, video, canvas { max-width:100% }` — trava imagens que não têm
  largura relativa.
- `.search-box` (tinha `width:230px` fixo) e `.search-dropdown` (tinha
  `width:340px` fixo) agora usam `min()` com teto em `vw` — eram os dois
  elementos com largura fixa em px que mais arriscavam estourar telas
  <380px.
- Breakpoints extras em 900px, 600px e 420px para modal, toast e drawer.

**Próximo passo necessário de você:** me manda um print (ou a URL do site
publicado) mostrando a tela quebrada. Com o código sozinho eu só consigo
blindar riscos óbvios, não reproduzir "tudo fora do lugar" — pode ser CSS,
mas também pode ser algo tipo cache de uma versão antiga do `style.css` no
Firebase Hosting.

### 6. Bônus diário de moedas Nexus (`js/api.js`, `js/app.js`)
- `Api.claimDailyBonus(userId)`: credita **15 moedas** (`DAILY_BONUS_AMOUNT`)
  uma vez por dia de calendário (chave `YYYY-MM-DD`, não "últimas 24h"
  corridas — evita gente reivindicando de novo perto da meia-noite). Também
  guarda `dailyStreak` (dias seguidos) só para exibição, sem afetar o valor.
- Chamado automaticamente em `enterApp()` (login ou F5 com sessão ativa),
  via `claimDailyBonusIfAvailable()`. Silencioso se já foi resgatado hoje.
- Mostra toast + notificação, atualiza o chip de moedas na navbar na hora.
- **Por que 15 e não mais:** hoje o pacote pago (`p9`, Loja) vende 5.000
  moedas. Um bônus grátis de 15/dia = ~450/mês, bem abaixo do que dá pra
  desbloquear um item caro da Loja de Recompensas sem nunca comprar — o
  cap intencional que você pediu.

### 5. Newsletter funcional (`js/newsletter-admin.js`, `js/db.js`, `js/app.js`, `index.html`)

**Por que não é SMTP puro:** o protocolo SMTP é um socket TCP — nenhum
navegador (nenhum framework) consegue falar SMTP diretamente. Enviar e-mail
de verdade sempre passa por um servidor. Como seu projeto está no plano
**Spark** (Cloud Functions não fazem chamada de rede externa nesse plano),
a rota escolhida foi:

**EmailJS** — serviço com tier gratuito (200 e-mails/mês) que conecta
diretamente com **a sua conta Gmail ou Zoho** (você autoriza uma vez no
painel deles) e expõe um SDK que o navegador pode chamar. É o único jeito
de usar seu Gmail/Zoho de verdade sem pagar por backend.

**O que eu implementei:**
- `js/db.js`: `getAllNewsletterSubs()` — lê a coleção `newsletterSubs` já
  existente.
- `js/newsletter-admin.js` (novo arquivo): `NewsletterAdmin.sendBlast()`
  carrega o SDK do EmailJS sob demanda, itera os inscritos e envia um
  e-mail por vez (600ms de intervalo, pra respeitar o rate limit do free
  tier).
- Aba **ADMIN** nova no painel de perfil (só visível para e-mails na
  allowlist `ADMIN_EMAILS`, em `js/app.js`) com campo de assunto, corpo e
  barra de progresso.

**O que falta você fazer (não dá pra automatizar sem suas credenciais):**
1. Criar conta grátis em https://www.emailjs.com
2. Em "Email Services", conectar seu Gmail ou Zoho (fluxo OAuth deles).
3. Criar um template com as variáveis `{{to_email}}`, `{{subject}}`,
   `{{body}}`.
4. Copiar `Public Key`, `Service ID` e `Template ID` e colar no topo de
   `js/newsletter-admin.js` (constantes `EMAILJS_PUBLIC_KEY`,
   `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`).
5. Trocar `seu-email@exemplo.com` em `ADMIN_EMAILS` (topo de `js/app.js`)
   pelo e-mail da sua conta na Nexus Arena.

**Opção B, se um dia migrar pro plano Blaze:** Cloud Function com
`nodemailer` usando SMTP do Gmail (senha de app) ou Zoho — mais robusto
(sem limite de 200/mês, roda no servidor, não depende de o admin estar com
o navegador aberto o tempo todo do envio). Se quiser esse caminho no
futuro, me chama que eu escrevo o `functions/index.js`.

## Resumo do que falta de você para tudo funcionar 100%
1. Credenciais do EmailJS (passos acima).
2. Seu e-mail real em `ADMIN_EMAILS`.
3. Print/URL do bug mobile, para eu corrigir a causa raiz (não só blindar
   riscos).
