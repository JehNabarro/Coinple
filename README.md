# Coinple 🪙💕

**Coin + Couple** — finanças a dois, com amor. App em ouro 💛 e rosa 💗 para casais registarem as despesas em conjunto, com login Google e tudo gravado numa planilha (Excel online) partilhada pelos dois.

## Como funciona

1. **Cada pessoa entra com a sua conta Google** 🔐
2. **Uma pessoa cria a planilha do casal** — a Coinple cria um Google Sheets ("Coinple 🪙💕 Finanças do Casal") na conta dela
3. **Partilha com o par**: copia o link na app, e na planilha clica em **Partilhar** dando acesso de edição ao e-mail do par
4. **O par entra com Google** e cola o link → as duas contas ficam juntas 💛💗
5. Todas as despesas, fotinhos e orçamentos ficam gravados na planilha — os dois veem tudo, em qualquer aparelho
6. Nas Definições há um botão **⬇️ Baixar Excel** para descarregar um `Coinple.xlsx` a qualquer momento

> Sem vontade de configurar o Google? Toca em **"Experimentar sem conta (modo demo)"** — funciona só nesse aparelho, sem partilha.

## Configurar o login Google (uma vez só, grátis)

O login Google precisa de um **Client ID** (gratuito):

1. Vai a [console.cloud.google.com](https://console.cloud.google.com) e cria um projeto (ex.: "Coinple")
2. Em **APIs e serviços → Biblioteca**, ativa a **Google Sheets API**
3. Em **APIs e serviços → Tela de permissão OAuth**, configura como **Externo**, dá o nome "Coinple" e adiciona os e-mails do casal como **utilizadores de teste**
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - Origens JavaScript autorizadas: `http://localhost:3457` (e o endereço onde publicares a app, ex.: `https://coinple.vercel.app`)
5. Copia o Client ID (termina em `.apps.googleusercontent.com`)
6. Na app, no ecrã de login, toca em **⚙️ Configurar Google Client ID** e cola-o
   (ou edita `js/config.js` e preenche `GOOGLE_CLIENT_ID`)

## Correr localmente

```bash
npx serve -l 3457 .
```

Abre `http://localhost:3457`.

## Estrutura da planilha do casal

| Aba | Conteúdo |
|---|---|
| **Despesas** | ID, Data, Descrição, Categoria, Valor, EmailPagador, NomePagador, CriadoEm |
| **Casal** | Email, Nome, Foto (fotinho de cada um 📸) |
| **Orçamentos** | Categoria, Orçamento mensal |

## Extra: leitura de recibos com IA ✨

Nas Definições podes colar uma API Key da Anthropic — ao fotografares um recibo, a IA preenche o valor, a descrição e a categoria automaticamente.
