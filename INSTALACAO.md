# RazenLab — guia de instalação

Siga na ordem. As etapas 1 a 6 são obrigatórias; 7 (frete automático) e 8 (cartão e boleto) são opcionais e podem ser feitas depois.

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

## 7. Frete automático pelo Melhor Envio

**Gerar o token**
1. Crie uma conta em **melhorenvio.com.br** (é grátis; você só paga as etiquetas que comprar).
2. Na sua conta, procure a área de **Integrações / Permissões de acesso / Tokens** e gere um **token pessoal** com a permissão de **cálculo de frete** (`shipping-calculate`). Copie o token (é longo).

**Publicar a função**
1. No Supabase: **Edge Functions → Deploy a new function → Via Editor**.
2. Nome: `frete`. Apague o código de exemplo, cole o conteúdo de `supabase/functions/frete/index.ts` e clique em **Deploy**.
3. Nos detalhes da função, **desligue a verificação de JWT** (*Verify JWT* / *Enforce JWT verification*). A função confere sozinha se quem chamou é administrador.
4. Em **Edge Functions → Secrets**, adicione:
   - `MELHOR_ENVIO_TOKEN` = o token
   - `MELHOR_ENVIO_EMAIL` = seu e-mail

**Usar**
1. No painel, **Configurações → Seu negócio**: preencha o **CEP de onde você envia**.
2. Em **Custos da oficina**, ajuste a **caixa padrão** (medidas e peso da embalagem que você mais usa).
3. Dentro de um pedido, toque em **Cotar frete pelo CEP**. Aparecem Correios PAC, SEDEX e outras transportadoras com preço e prazo. Um toque preenche o frete.

## 8. Cartão e boleto pelo Mercado Pago

O cliente continua podendo pagar por Pix sem taxa. Com isto ligado, ganha a opção de cartão de crédito (parcelado), débito ou boleto, e o pedido vira **Pago** sozinho quando o Mercado Pago aprova.

**Pegar a credencial**
1. Entre em **mercadopago.com.br/developers** com a sua conta do Mercado Pago.
2. **Suas integrações → Criar aplicação**. Nome: `RazenLab`. Escolha pagamentos online com **Checkout Pro**.
3. Abra a aplicação → **Credenciais de produção**. Copie o **Access Token** (começa com `APP_USR-`).
   - Se o Mercado Pago pedir para ativar as credenciais de produção, preencha os dados do negócio que ele solicitar.
   - **Nunca** coloque esse token no site nem mande para ninguém: ele movimenta a sua conta.

**Publicar as duas funções**
1. **Edge Functions → Deploy a new function → Via Editor** → nome `pagamento` → cole `supabase/functions/pagamento/index.ts` → **Deploy**.
2. Repita com o nome `mp-webhook` e o arquivo `supabase/functions/mp-webhook/index.ts`.
3. Nas duas, **desligue a verificação de JWT**. O Mercado Pago não envia login, e a função confirma cada pagamento direto na API dele.
4. Em **Edge Functions → Secrets**, adicione:
   - `MP_ACCESS_TOKEN` = o Access Token de produção

**Ligar no painel**
1. **Configurações → Cartão e boleto (Mercado Pago)**: marque **Oferecer cartão e boleto no link do cliente**.
2. Defina o **acréscimo** (%) para cobrir a taxa do Mercado Pago. Confira as tarifas na sua conta, porque elas mudam conforme o prazo de recebimento que você escolhe lá.
3. Defina o número máximo de **parcelas**. Os juros do parcelamento ficam com o cliente.
4. Salve. Faça um pedido de teste de valor baixo e pague com o seu próprio cartão para ver o ciclo completo.

**Opcional: assinatura dos avisos**
Na sua aplicação do Mercado Pago, em **Webhooks**, você pode ver a **assinatura secreta**. Cadastre-a como o segredo `MP_WEBHOOK_SECRET`: a partir daí, a função recusa qualquer aviso que não venha do Mercado Pago. Sem ela o sistema já é seguro, porque todo pagamento é conferido direto na API.

## Como funciona o dia a dia

1. **Cliente pede pelo site** → chega no painel como **Solicitado**.
2. Você preenche peso e tempo, cota o frete e clica **Enviar orçamento no WhatsApp**. O cliente recebe um link só dele.
3. No link, o cliente escolhe:
   - **Pix (sem taxa):** paga pelo QR Code e envia o comprovante → **Comprovante**. Você confere no app do banco e clica **Confirmar pagamento** → **Pago**.
   - **Cartão ou boleto:** paga no Mercado Pago → o pedido vira **Pago** sozinho quando for aprovado.
4. Só quando vira **Pago** o valor entra no faturamento.
5. Imprimindo → Pronto → preencha o **código de rastreio** e clique **Marcar como enviado**. O cliente recebe o rastreio no WhatsApp e no link.

## Onde ficam os dados

| O quê | Onde | Quem vê |
|---|---|---|
| Pedidos, clientes, custos, Pix | Supabase | Só você (logado) |
| Cada pedido individual | Supabase, pelo link secreto | Só quem tem o link |
| Vitrine e textos do site | Supabase | Todo mundo |
| Anexos e comprovantes | Supabase (arquivos privados) | Só você |
| Tokens do Melhor Envio e do Mercado Pago | Segredos das Edge Functions | Ninguém — nem o site |

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
- **Cotar frete diz que a função não foi publicada** → faça a etapa 7.
- **"Não foi possível abrir o pagamento"** no link do cliente → confira se a função `pagamento` foi publicada, o segredo `MP_ACCESS_TOKEN` e se a opção está ligada no painel.
- **Cliente pagou no cartão e o pedido não virou Pago** → confira se a função `mp-webhook` foi publicada **com a verificação de JWT desligada**.
- **"Falta atualizar o banco"** ao marcar "Não fechou" → rode de novo o `01_estrutura.sql`.
- **Mudou algo e o celular mostra a versão antiga** → feche e abra o app, ou recarregue a página.
