# RazenLab — guia de instalação

Siga na ordem. As etapas 1 a 6 são obrigatórias; 7 e 8 (Telegram e frete automático) são opcionais e podem ser feitas depois.

---

## 1. Criar o projeto no Supabase

1. Entre em **supabase.com** (pode usar a conta do GitHub).
2. **New project** → nome `razenlab` → região **South America (São Paulo)** → crie uma senha forte para o banco e guarde.
3. Espere uns 2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas

1. No menu da esquerda, abra o **SQL Editor**.
2. Abra o arquivo `supabase/01_estrutura.sql`, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer "Success". Pode rodar de novo no futuro sem perder nada.

## 3. Criar o seu acesso ao painel

1. Menu **Authentication → Users → Add user → Create new user**.
2. Coloque seu e-mail e uma senha. Marque a opção de confirmar automaticamente (**Auto Confirm User**).
3. Volte ao **SQL Editor**, abra `supabase/02_admin.sql`, troque `SEU-EMAIL-AQUI` pelo e-mail que você acabou de usar e clique em **Run**. A tabela embaixo deve mostrar o seu e-mail.
4. Em **Authentication → Sign In / Providers** (ou *Settings*), desligue **Allow new users to sign up**. Assim ninguém cria conta sozinho.

## 4. Ligar o site ao banco

1. No Supabase, abra **Project Settings → API** (em alguns projetos aparece como **API Keys**).
2. Copie a **Project URL** e a chave **anon public** (ou **publishable**).
3. Abra o arquivo `config.js` e cole os dois valores no lugar de `COLE-AQUI…`.

> Essas duas informações podem ficar no site: elas só fazem o que as regras do banco permitem. **Nunca** coloque em lugar nenhum do site a chave `service_role` / `secret`.

## 5. Publicar no GitHub

1. Abra o repositório `razenlab` no GitHub → **Add file → Upload files**.
2. Arraste **todo o conteúdo** desta pasta (incluindo `assets` e `supabase`) e clique em **Commit changes**. Os arquivos com o mesmo nome são substituídos.
3. Em 1 a 2 minutos estará no ar:
   - Site: https://brenotorres44-blip.github.io/razenlab/
   - Painel: https://brenotorres44-blip.github.io/razenlab/painel.html

## 6. Primeiro acesso e migração

1. Abra o painel **no celular que você já usava** e entre com o e-mail e a senha da etapa 3.
2. Vai aparecer um aviso: *"Encontrei N pedidos salvos só neste aparelho"*. Clique em **Migrar para a nuvem**. Pedidos, filamentos, trabalhos da vitrine e configurações sobem com os mesmos números.
3. Vá em **Configurações** e preencha:
   - **Seu negócio:** WhatsApp, Instagram, cidade e **CEP de onde você envia**.
   - **Recebimento por Pix:** tipo da chave, a chave, seu nome e cidade como aparecem no banco.
   - **Custos da oficina** e **caixa padrão** (medidas e peso da embalagem que você mais usa).
4. Faça um teste: abra o site em outra aba, peça um orçamento como se fosse cliente e veja chegar no painel.

Pronto: a partir daqui o celular e o computador mostram os mesmos pedidos.

---

## 7. Aviso de pedido no Telegram (opcional, grátis)

**Criar o robô**
1. No Telegram, procure **@BotFather** → envie `/newbot` → escolha um nome (ex.: RazenLab Avisos) e um usuário terminado em `bot`.
2. Ele responde com um **token** parecido com `123456:ABC-...`. Guarde.
3. Abra a conversa com o seu robô novo e mande qualquer mensagem (ex.: "oi").
4. No navegador, abra `https://api.telegram.org/botSEU_TOKEN/getUpdates` (troque `SEU_TOKEN`). Procure `"chat":{"id":` e copie o número que vem depois. Esse é o **chat id**.

**Publicar a função**
1. No Supabase, menu **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `avisar`. Apague o código de exemplo, cole o conteúdo de `supabase/functions/avisar/index.ts` e clique em **Deploy**.
3. Nos detalhes da função, **desligue a verificação de JWT** (opção *Verify JWT* / *Enforce JWT verification*). A própria função confere o pedido.
4. Em **Edge Functions → Secrets**, adicione:
   - `TELEGRAM_BOT_TOKEN` = o token do BotFather
   - `TELEGRAM_CHAT_ID` = o número do chat
   - `PAINEL_URL` = `https://brenotorres44-blip.github.io/razenlab/painel.html`

A partir daí, cada pedido novo e cada comprovante chegam como mensagem no seu Telegram.

## 8. Frete automático pelo Melhor Envio (opcional)

**Gerar o token**
1. Crie uma conta em **melhorenvio.com.br** (é grátis; você só paga as etiquetas que comprar).
2. Na sua conta, procure a área de **Integrações / Permissões de acesso / Tokens** e gere um **token pessoal** com pelo menos a permissão de **cálculo de frete** (`shipping-calculate`). Copie o token (é longo).

**Publicar a função**
1. **Edge Functions → Deploy a new function → Via Editor** → nome `frete` → cole `supabase/functions/frete/index.ts` → **Deploy**.
2. Desligue a verificação de JWT, como na etapa 7. A função confere sozinha se quem chamou é administrador.
3. Em **Secrets**, adicione:
   - `MELHOR_ENVIO_TOKEN` = o token
   - `MELHOR_ENVIO_EMAIL` = seu e-mail

No painel, dentro de um pedido, o botão **Cotar frete pelo CEP** passa a mostrar Correios PAC, SEDEX e outras transportadoras com preço e prazo. Um toque preenche o frete.

---

## Como funciona o dia a dia

1. **Cliente pede pelo site** → chega no painel (e no Telegram) como **Solicitado**.
2. Você preenche peso e tempo, cota o frete e clica **Enviar orçamento no WhatsApp**. O cliente recebe um link só dele.
3. No link, o cliente vê o valor, paga com o **QR Code do Pix** e envia o comprovante → o pedido vira **Comprovante**.
4. Você confere no app do banco e clica **Confirmar pagamento** → **Pago**. Só aqui o valor entra no faturamento.
5. Imprimindo → Pronto → preencha o **código de rastreio** e clique **Marcar como enviado**. O cliente recebe o rastreio no WhatsApp e no link.

## Onde ficam os dados

| O quê | Onde | Quem vê |
|---|---|---|
| Pedidos, clientes, custos, Pix | Supabase | Só você (logado) |
| Cada pedido individual | Supabase, pelo link secreto | Só quem tem o link |
| Vitrine e textos do site | Supabase | Todo mundo |
| Anexos e comprovantes | Supabase (arquivos privados) | Só você |
| Tokens do Telegram e Melhor Envio | Segredos das Edge Functions | Ninguém — nem o site |

Use **Configurações → Exportar cópia** de vez em quando para ter um arquivo extra guardado no Drive.

## Atualizações do sistema

Quando uma atualização mexer no banco, rode de novo o `supabase/01_estrutura.sql` inteiro no SQL Editor. Ele é seguro de repetir: cria só o que falta e não apaga nenhum pedido.

## Análise de orçamentos

- Todo orçamento recebe um número ao ser salvo, e o PDF só é gerado depois de salvar, então nenhum orçamento sai sem número.
- O nome do cliente é obrigatório: é ele que diz para quem foi cada orçamento.
- Quando o cliente não fechar, abra o orçamento, toque em **Não fechou** e escolha o motivo.
- Orçamentos que passaram da validade aparecem como **Vencidos**: cobre o cliente ou marque como "Não fechou".
- A página **Análise** mostra taxa de fechamento, motivos, faixas de preço e tempo para fechar. **Exportar planilha** gera um arquivo que abre no Excel ou no Google Planilhas.

## Se algo der errado

- **"O painel ainda não está ligado ao Supabase"** → o `config.js` não foi preenchido ou não foi enviado ao GitHub.
- **"Esta conta existe, mas ainda não tem acesso"** → falta rodar o `02_admin.sql` com o seu e-mail exato.
- **Cotar frete diz que a função não foi publicada** → faça a etapa 8.
- **Não chega mensagem no Telegram** → confira se você mandou "oi" para o robô antes de pegar o chat id, e os dois segredos.
- **"Falta atualizar o banco"** ao marcar "Não fechou" → rode de novo o `01_estrutura.sql`.
- **Mudou algo e o celular mostra a versão antiga** → feche e abra o app, ou recarregue a página.
