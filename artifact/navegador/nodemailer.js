// Substitui o nodemailer na versão de teste: dentro do Claude a página não
// pode se conectar a um servidor de e-mail, então o envio avisa e para.

function indisponivel() {
  return Object.assign(
    new Error('O envio por e-mail não funciona na versão de teste dentro do Claude. No sistema instalado no computador ele funciona normalmente.'),
    { status: 503 }
  );
}

module.exports = {
  createTransport() {
    return {
      sendMail: async () => {
        throw indisponivel();
      },
      verify: async () => {
        throw indisponivel();
      },
    };
  },
};
