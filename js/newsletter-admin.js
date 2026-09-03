/* ==========================================================================
   newsletter-admin.js — disparo real de e-mail para os inscritos da
   newsletter, usando SUA conta Gmail/Zoho como remetente.
   --------------------------------------------------------------------------
   POR QUE NÃO É "SMTP DIRETO"?
   O protocolo SMTP (porta 587/465) é um protocolo de socket TCP — o
   navegador NUNCA consegue falar SMTP diretamente, com nenhum framework,
   independente de plano do Firebase. Enviar e-mail de verdade sempre exige
   um servidor no meio. As duas rotas possíveis são:

     A) Cloud Functions (Firebase) + Nodemailer com SMTP do Gmail/Zoho
        → exige o plano Blaze (Functions só fazem chamada de rede externa
          no Blaze). Ver PLANO_DE_ACAO.md, seção 5, para o código.

     B) EmailJS (o que está implementado aqui)
        → serviço gratuito (tier free: 200 e-mails/mês) que conecta com a
          SUA conta Gmail/Zoho via OAuth/senha de app e expõe um SDK que o
          navegador PODE chamar. É a opção que funciona hoje, no plano
          Spark, sem custo e sem servidor próprio.

   SEGURANÇA: o disparo em massa (para todos os inscritos) só deve ser
   acionado por você (admin), nunca por qualquer usuário logado — por isso
   a UI que chama isto fica atrás de um allowlist de e-mail (ver app.js,
   ADMIN_EMAILS). Isso não é 100% à prova de adulteração de front-end,
   mas o `service_id`/`template_id`/`public_key` do EmailJS são projetados
   para serem públicos (não são um segredo tipo API key de backend).
   ========================================================================== */

const NewsletterAdmin = {
  // Preencha depois de criar sua conta em https://www.emailjs.com
  EMAILJS_PUBLIC_KEY: 'HFY4O0h1zvtNX8N_r',
  EMAILJS_SERVICE_ID: 'service_iykqsil',       // já conectado ao Gmail (ver Config Service no EmailJS)
  EMAILJS_TEMPLATE_ID: 'template_zvykdae',     // template "Welcome" reaproveitado com {{to_email}}, {{subject}}, {{body}}

  _sdkLoaded: false,

  async _ensureSdk(){
    if (this._sdkLoaded) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar o SDK do EmailJS.'));
      document.head.appendChild(s);
    });
    window.emailjs.init({ publicKey: this.EMAILJS_PUBLIC_KEY });
    this._sdkLoaded = true;
  },

  /* Dispara para todos os inscritos, um a um, com um pequeno intervalo
     entre envios (o free tier do EmailJS tem limite de requisições por
     segundo). onProgress(sent, total) é chamado a cada envio, para a UI
     mostrar uma barra de progresso. */
  async sendBlast(subject, bodyHtml, onProgress){
    await this._ensureSdk();
    const subs = await DB.getAllNewsletterSubs();
    if (!subs.length) return { sent: 0, failed: 0, total: 0 };

    let sent = 0, failed = 0;
    for (let i = 0; i < subs.length; i++){
      try{
        await window.emailjs.send(this.EMAILJS_SERVICE_ID, this.EMAILJS_TEMPLATE_ID, {
          to_email: subs[i].email,
          subject,
          body: bodyHtml
        });
        sent++;
      }catch(err){
        console.error('Falha ao enviar para', subs[i].email, err);
        failed++;
      }
      if (onProgress) onProgress(sent + failed, subs.length);
      await new Promise(r => setTimeout(r, 600)); // respeita rate limit do free tier
    }
    return { sent, failed, total: subs.length };
  }
};
