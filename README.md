# Coinple 🪙💕

**Coin + Couple** — finanças a dois, com amor. 
Uma aplicação web elegante, estilizada em tons de ouro 💛 e rosa 💗, para casais registarem e controlarem as suas despesas em conjunto. Toda a informação é guardada diretamente numa planilha do Google Sheets partilhada entre os dois, funcionando como uma base de dados 100% gratuita, privada e sob o vosso controlo.

---

## 🚀 Como funciona

1. **Autenticação**: Cada pessoa entra na aplicação usando a sua própria conta Google 🔐.
2. **Criação da Planilha**: Uma das pessoas do casal cria a planilha diretamente pela aplicação. O Coinple cria automaticamente um Google Sheets denominado `"Coinple 🪙💕 Finanças do Casal"` no Google Drive dela.
3. **Partilha**: Copia o link gerado pela app e partilha-o com o teu par. No Google Sheets, clica em **Partilhar** e dá permissões de **Edição** ao e-mail do teu par.
4. **Sincronização**: O teu par entra com a conta Google dele, introduz o link da planilha partilhada e... as contas ficam ligadas! 💛💗
5. **Colaboração**: Despesas, orçamentos, fotos de perfil e dados são sincronizados em tempo real diretamente da planilha. Qualquer alteração reflete-se instantaneamente nos dispositivos de ambos.
6. **Backup Local**: Nas definições da aplicação, há um botão **⬇️ Baixar Excel** para descarregar o ficheiro `Coinple.xlsx` localmente a qualquer momento.
## 🛠️ Configurar o Google OAuth (Passo a Passo)

Como a aplicação corre 100% no cliente (browser) sem servidor intermediário, precisas de criar um **OAuth Client ID** grátis para que a aplicação possa falar com a API do Google Sheets:

1. Acede a [console.cloud.google.com](https://console.cloud.google.com) e cria um projeto (ex: "Coinple").
2. Vai a **APIs e Serviços → Biblioteca**, pesquisa por **Google Sheets API** e clica em **Ativar**.
3. Vai a **APIs e Serviços → Ecrã de consentimento OAuth**:
   * Escolhe o tipo **Externo**.
   * Dá o nome "Coinple" à aplicação.
   * Adiciona o teu e-mail e o do teu par em **Utilizadores de teste** (enquanto a aplicação estiver em modo de teste, apenas estes e-mails poderão fazer login).
4. Vai a **APIs e Serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   * Tipo de aplicação: **Aplicação Web**.
   * **Origens JavaScript autorizadas**: Adiciona `http://localhost:3457` (para desenvolvimento local) e a URL de produção onde alojares a aplicação (ex: `https://coinple.vercel.app`).
   * Clica em criar.
5. Copia o **Client ID** gerado (termina em `.apps.googleusercontent.com`).
6. Cola-o no ficheiro `js/config.js` na propriedade `GOOGLE_CLIENT_ID`.

---

## 💻 Executar Localmente

Corre o servidor local usando o comando abaixo para que a aplicação fique disponível exatamente na porta autorizada (`3457`):

```bash
npx serve -l 3457 .
```

Depois, abre [http://localhost:3457](http://localhost:3457) no teu browser.

---

## 🧠 Leitura de Recibos com IA ✨

Nas Definições da aplicação podes inserir uma API Key da **Anthropic** (Claude). Ao tirares uma fotografia a um recibo físico ou de supermercado pela câmara do telemóvel, a IA analisa a imagem e preenche automaticamente o **valor**, a **descrição (estabelecimento)** e a **categoria** sugerida. A chave da API fica guardada de forma 100% segura e local no `localStorage` do teu browser.
