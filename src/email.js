// Envio do orçamento por e-mail (SMTP configurado na tela de Configurações).

const nodemailer = require('nodemailer');

function transportador(cfgEmail) {
  if (!cfgEmail.host || !cfgEmail.usuario) {
    throw Object.assign(
      new Error('O envio por e-mail ainda não foi configurado. Acesse Configurações › E-mail.'),
      { status: 400 }
    );
  }
  return nodemailer.createTransport({
    host: cfgEmail.host,
    port: Number(cfgEmail.porta) || 587,
    secure: Boolean(cfgEmail.seguro),
    auth: { user: cfgEmail.usuario, pass: cfgEmail.senha },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
}

function remetente(cfgEmail) {
  const email = cfgEmail.remetenteEmail || cfgEmail.usuario;
  return cfgEmail.remetenteNome ? `"${cfgEmail.remetenteNome.replace(/"/g, '')}" <${email}>` : email;
}

async function enviar(cfgEmail, { para, assunto, mensagem, anexos = [] }) {
  const t = transportador(cfgEmail);
  const info = await t.sendMail({
    from: remetente(cfgEmail),
    to: para,
    cc: cfgEmail.copiaPara || undefined,
    subject: assunto,
    text: mensagem,
    attachments: anexos,
  });
  return { id: info.messageId };
}

async function testar(cfgEmail) {
  const t = transportador(cfgEmail);
  await t.verify();
  return true;
}

module.exports = { enviar, testar };
