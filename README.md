# BALANÇAS.COM — Checklist técnico e orçamentos

Sistema que roda **no próprio computador da oficina** para os técnicos:

1. **Checklist técnico**: o técnico informa o **nº da OS** (gerado no sistema de ordens de serviço) e identifica o cliente e a balança. Depois registra:
   - os lacres 1 e 2 de entrada e de saída;
   - os acessórios recebidos, o defeito relatado e a tensão;
   - o checklist funcional (C / NC / N/A), na entrada e após a manutenção.
2. **Serviços e peças**: busca no catálogo ou cadastra na hora, com quantidade e valor. Também aceita item avulso, só para aquela OS.
   - Os serviços têm um **nome interno**, que é o que o técnico vê, e um **nome que sai na OS**.
   - Exemplo: "Mão de obra – balança com compressor" (R$ 190), "sem compressor" (R$ 150) e "PET" (R$ 120) saem como "Limpeza, regulagem, calibração e lacração".
3. **Orçamento em PDF**: o sistema monta o orçamento no papel timbrado da empresa, com totais, desconto, validade, prazo, formas de pagamento, garantia e campo de aceite.
4. **Envio ao cliente**: por WhatsApp (baixa o PDF e abre a conversa com a mensagem pronta), por e-mail (envia o PDF em anexo) ou por download/impressão.
5. **Checklist em A4**: imprime o checklist preenchido de qualquer OS, ou em branco para preencher à mão.

**Clientes:**

- Pessoa física: nome, CPF e cidade.
- Pessoa jurídica: CNPJ, nome e cidade.
- Ao digitar o CNPJ, o sistema consulta a Receita Federal (BrasilAPI, com CNPJá, Minha Receita e ReceitaWS como alternativas) e preenche a razão social e a cidade.
- O CNPJ alfanumérico (em vigor desde julho/2026) também é aceito.

**Tema:** claro, escuro ou igual ao Windows. O seletor fica no rodapé do menu e em Configurações › Aparência. O PDF e o checklist impresso saem sempre no tema claro.

O sistema substitui a planilha `Checklist_Tecnico_Orcamento_revisado.xlsm`. Os itens do checklist, os serviços e peças já cadastrados e o papel timbrado vieram dela.

---

## Instalação no Windows (sem instalar nada)

**Baixar o pacote completo:**

https://github.com/RafaelTessaro/Balan-as.com---Or-amentos/releases/latest/download/BalancasOrcamentos-windows.zip

Também há uma versão dividida em 2 arquivos menores que 30 MB (`BalancasOrcamentos-parte1.zip` e `BalancasOrcamentos-parte2.zip`), que cabe em anexos de e-mail e chat.

O pacote já traz:

- o sistema;
- os componentes;
- o Node.js portátil oficial, sem alterações.

Não precisa instalar nem baixar mais nada.

1. Clique com o botão direito no `.zip` e escolha **"Extrair tudo..."**. Use uma pasta fixa e só deste sistema, por exemplo `C:\BalancasOrcamentos`.
2. Dê dois cliques em **`iniciar.bat`**. Se o Windows mostrar um aviso de segurança, clique em "Mais informações" e depois em "Executar assim mesmo".
3. O sistema abre numa **janela própria**, como um aplicativo, sem abas nem barra de endereço. O endereço é **http://localhost:4980**.
   - A janela preta é o servidor do sistema: ela pode ficar minimizada, mas não pode ser fechada enquanto o sistema estiver em uso.

Na primeira vez, o atalho **"Orcamentos BALANCAS.COM"** é criado na Área de Trabalho e no menu Iniciar. Use sempre esse atalho:

- se o sistema estiver fechado, ele o inicia com a janela preta já minimizada e abre a janela do sistema;
- se já estiver aberto, só abre a janela de novo.

A janela própria usa o navegador padrão do computador quando ele é o Chrome, o Edge ou o Brave, para o WhatsApp Web abrir na conta de sempre. Com outro navegador padrão, ela usa o Edge, que já vem no Windows.

**Versão em 2 partes:**

- Extraia só a parte 1.
- Deixe o arquivo `BalancasOrcamentos-parte2.zip` na pasta Downloads, ou dentro da pasta do sistema.
- O `iniciar.bat` junta as partes na primeira vez e confere a soma SHA-256 oficial do Node.js.

Requisitos e atualização:

- Funciona no Windows 10 e 11 de 64 bits.
- Para atualizar:
  1. feche a janela preta do sistema;
  2. extraia a versão nova por cima da pasta antiga. A pasta `dados` é mantida.

### Junto com outros sistemas da empresa (BC Fichas Control e outros)

Cada sistema tem a sua porta, a sua pasta de dados e o seu atalho. Por isso um nunca abre no lugar do outro.

| | Este sistema | BC Fichas Control |
|---|---|---|
| Endereço | `http://localhost:4980` | `http://localhost:3000` (padrão dele) |
| Pasta dos dados | `dados`, dentro da pasta deste sistema | a pasta dele |
| Abre por | atalho "Orcamentos BALANCAS.COM" | o atalho dele |

**Como o sistema evita conflito:**

- Ao iniciar, se a porta estiver ocupada, o sistema pergunta ao programa que está nela quem ele é.
  - Se for este mesmo sistema, com a mesma pasta de dados, só abre a janela.
  - Se for outro programa, passa para a próxima porta livre (4981, 4982...) e grava a escolha para as próximas vezes.
  - Se for outra cópia deste sistema, de outra pasta, ele avisa e não abre, para não misturar dois bancos de dados.
- Antes desta versão, este sistema também usava a porta 3000, igual ao BC Fichas Control: era por isso que o `iniciar.bat` abria o outro sistema.
- Tablets e computadores que usavam o endereço antigo, com `:3000`, precisam do endereço novo, com `:4980`. Ele aparece em **Configurações › Rede e dados**.

**Use pastas separadas para cada sistema**, por exemplo `C:\BalancasOrcamentos` e `C:\BC-Fichas-Control`. Não extraia um sistema dentro da pasta do outro.

**Para mudar a porta ou o jeito de abrir:**

1. feche a janela preta;
2. edite o arquivo `dados\servidor.json`, criado na primeira vez:

```json
{ "porta": 4980, "janela": "aplicativo" }
```

Use `"janela": "navegador"` para abrir numa aba do navegador comum, em vez da janela própria.

**Geração automática:**

- O GitHub Actions (`.github/workflows/pacote-windows.yml`) gera o pacote e o publica em **Releases** a cada atualização do código, com o mesmo link fixo acima.
- Para gerar na hora, vá à aba **Actions**, escolha "Pacote para Windows" e clique em **Run workflow**.

**Gerar manualmente** (para quem mantém o sistema, em Linux/macOS com git, npm, curl, zip e unzip):

```bash
npm run empacotar                # dist/BalancasOrcamentos-windows.zip (≈ 46 MB)
npm run empacotar -- --dividir   # dist/BalancasOrcamentos-parte1.zip e -parte2.zip (< 30 MB cada)
```

O script usa a última versão commitada e instala só os componentes de produção. Ele também baixa o `node.exe` oficial de nodejs.org e confere a soma SHA-256 publicada.

### Alternativa: cópia do GitHub (com Node.js instalado)

1. Instale o **Node.js LTS** (22 ou mais novo): https://nodejs.org/pt-br/download
2. Baixe o código e dê dois cliques em `iniciar.bat`.

Na primeira vez, os componentes são baixados da internet.

### Usar em tablets e em outros computadores da oficina

1. Abra **Configurações › Rede e dados**. A tela mostra o endereço do sistema na rede, do tipo `http://192.168.0.10:4980`. Ele também aparece na janela preta, em "Na rede local".
2. Abra esse endereço no navegador do tablet ou de outro computador **conectado à mesma rede** (Wi-Fi ou cabo). Todos usam o mesmo banco de dados.
3. No tablet, use "Adicionar à tela inicial" para ter um ícone do sistema.

Se o Windows perguntar sobre o Firewall na primeira vez, permita o acesso em **redes privadas**.

### Linux / macOS

```bash
./iniciar.sh
```

---

## Como usar

| Menu | Para que serve |
|---|---|
| **Início** | Indicadores do mês, andamento das OS por situação, atalhos |
| **Nova OS** | Abre uma ordem de serviço nova (o número é automático) |
| **Ordens de serviço** | Lista com busca (nº, cliente, equipamento, série, técnico) e filtro por situação |
| **Clientes** | Pessoas físicas e jurídicas, com consulta automática do CNPJ (também dá para cadastrar de dentro da OS) |
| **Serviços / Peças** | Catálogo com valores. Peças mostram a data da última atualização de preço |
| **Checklist em branco** | Folha A4 para imprimir e preencher à mão |
| **Configurações** | Dados da empresa, textos do orçamento, papel timbrado, itens do checklist, técnicos, e-mail, WhatsApp, endereços na rede e backup |

**Dentro da OS** tudo é salvo automaticamente. A tela é dividida em 5 seções:
1. Identificação do equipamento
2. Checklist funcional
3. Serviços e peças
4. Orçamento e envio
5. Situação

A situação da OS segue este fluxo:

- *Em análise* → *Aguardando aprovação* → *Aprovada* → *Aguardando peça* → *Liberada* → *Entregue*.
- Se o cliente não aprovar, a OS fica *Recusada*.
- Ao enviar o orçamento por WhatsApp ou e-mail, a OS passa sozinha para "Aguardando aprovação".

### Enviar por e-mail

Em **Configurações › E-mail**, informe o servidor SMTP:

- **Gmail**:
  - servidor `smtp.gmail.com`, porta `465` com SSL ligado;
  - use uma *senha de app*, criada em https://myaccount.google.com/apppasswords.
- **Outlook / Hotmail**: servidor `smtp-mail.outlook.com`, porta `587` com SSL desligado.

Use o botão **Testar conexão** para conferir.

### Enviar por WhatsApp

O WhatsApp não permite anexar arquivos por link. Por isso o sistema faz duas coisas:

1. **baixa o PDF**;
2. **abre a conversa** com o cliente, já com a mensagem escrita.

Depois é só arrastar o PDF para a conversa. No tablet/celular, quando o navegador permite, aparece também o botão "Compartilhar PDF…", que envia o arquivo direto.

---

## Onde ficam os dados e como fazer backup

- Todos os dados ficam na pasta **`dados`**, dentro da pasta do sistema, no arquivo `dados/balancas.db`. A porta escolhida fica em `dados/servidor.json`.
- **A cada vez que o sistema é iniciado**, uma cópia automática é salva em `dados/backups` (o sistema guarda as 20 mais recentes).
- Em **Configurações › Backup** dá para baixar um backup completo (`.json`) e restaurá-lo em outro computador.

Para trocar de computador:

1. copie a pasta inteira do sistema, junto com a pasta `dados`;
2. ou restaure o backup `.json` no computador novo.

---

## Conformidade

- **Orçamento (CDC, art. 40)**:
  - mão de obra e peças discriminadas;
  - condições de pagamento;
  - prazo de conclusão;
  - validade (10 dias por padrão).
- **Garantia legal de 90 dias** (CDC, art. 26), com o texto editável em Configurações.
- **Portaria Inmetro 457/2021 (ordem de serviço de permissionária)**: a OS registra:
  - nº de série;
  - PAM (portaria de aprovação de modelo);
  - lacres 1 e 2 encontrados na entrada e aplicados na saída;
  - selo de reparo;
  - técnico, com o documento dele no checklist impresso;
  - dados da empresa.
- Itens opcionais de ensaio (Portaria Inmetro 157/2022), como excentricidade, repetibilidade e retorno ao zero, podem ser adicionados ao checklist em Configurações.

> Confirme com o IPEM-SP os prazos e exigências atuais da sua autorização de permissionária.

---

## Para desenvolvedores

- **Backend**:
  - Node.js 22.13+ com Express;
  - banco SQLite nativo do Node (`node:sqlite`), sem dependências nativas;
  - PDF gerado com [pdfmake](https://pdfmake.github.io/);
  - e-mail enviado com [nodemailer](https://nodemailer.com/).
- **Frontend**:
  - HTML, CSS e JavaScript (ES modules), sem etapa de build;
  - ícones [Lucide](https://lucide.dev) (ISC), gerados em `public/js/icones.js` por `npm run icones`;
  - fonte Inter (OFL), servida localmente para funcionar sem internet.

```
server.js                 inicia o servidor, backup automático, abre a janela
src/instancia.js          porta própria, identidade (/api/identidade) e conflito com outros sistemas
src/janela.js             abre a janela de aplicativo (Edge/Chrome/Brave em modo --app)
src/db.js                 banco, migrações e configurações
src/ordens.js             regras das ordens de serviço (itens, totais, status, histórico)
src/cadastros.js          clientes, serviços e peças
src/api.js                rotas REST (/api/...)
src/pdf/orcamento.js      geração do PDF do orçamento (papel timbrado)
src/email.js, modelos.js  envio de e-mail e mensagens de WhatsApp
public/index.html         layout da aplicação (menu lateral)
public/js/app.js          navegação entre telas (#/rotas)
public/js/paginas/*.js    telas (início, ordens, editor da OS, clientes, catálogo, configurações)
public/imprimir/          checklist A4 para impressão
public/css/               design system (app.css) e estilos das telas
```

Comandos:

```bash
npm install          # instala dependências
npm start            # http://localhost:4980
npm run dev          # reinicia sozinho ao alterar arquivos
```

Variáveis de ambiente opcionais:

| Variável | Para que serve |
|---|---|
| `PORT` | porta fixa do servidor. Sem ela, usa a de `dados/servidor.json` (padrão `4980`) e passa para a próxima livre se outro programa estiver na porta |
| `HOST` | interface de rede (padrão `0.0.0.0`) |
| `DATA_DIR` | pasta dos dados (padrão `./dados`) |
| `NAO_ABRIR_NAVEGADOR=1` | não abre a janela ao iniciar |
| `JANELA=navegador` | abre numa aba do navegador comum em vez da janela própria |
