# RazenLab — guia de instalação

Siga na ordem. As etapas 1 a 6 são obrigatórias e a 10 (segurança) é muito recomendada; 7 (frete automático), 8 (cartão e boleto) e 9 (importar do MakerWorld) são opcionais e podem ser feitas depois.

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

## 9. Importar modelos do MakerWorld

Cole o link de um modelo e o sistema traz tempo, peso, filamento e licença, e preenche o orçamento.

**Publicar a função** (não precisa de nenhum segredo)
1. **Edge Functions → Deploy a new function → Via Editor** → nome `makerworld` → cole `supabase/functions/makerworld/index.ts` → **Deploy**.
2. **Desligue a verificação de JWT**. A função confere sozinha se quem chamou é você, o administrador.

**Usar**
1. Na tela **Orçar** (ou dentro de um pedido), cole o link no campo **Importar do MakerWorld** e toque em **Avaliar**.
2. Aparecem a capa, o autor, a **licença** e os perfis de impressão com peso e tempo.
3. Toque no perfil desejado: peça, peso, tempo e filamento são preenchidos, e o preço aparece na hora.
4. O modelo, o perfil escolhido e a licença ficam gravados no pedido.

**Licença:** muitos modelos do MakerWorld proíbem vender as impressões (licenças "NC" e "Standard Digital File License"). O sistema mostra em **vermelho** quando não é permitido. Para vender, compre a licença comercial do autor ou escolha outro modelo.

**Tempo da sua impressora:** os tempos do MakerWorld são para impressoras Bambu Lab. Em **Configurações → Custos da oficina → Tempo da sua impressora**, informe quanto a sua leva em comparação (100% = igual; 200% = o dobro). Para descobrir: fatie uma peça no seu fatiador e compare com o tempo que o MakerWorld mostra para ela.

## 10. Segurança do login e recuperação da conta

Faça uma vez. Leva uns 5 minutos.

**a) Rodar o arquivo de segurança**
1. No Supabase, abra o **SQL Editor**, cole todo o `supabase/03_seguranca.sql` e clique em **Run**.
2. A tabela que aparece embaixo mostra o seu e-mail e se as duas etapas estão ativas.

**b) Deixar o link de recuperação voltar para o painel**
1. Menu **Authentication → URL Configuration**.
2. Em **Site URL**, coloque `https://brenotorres44-blip.github.io/razenlab/painel.html`.
3. Em **Redirect URLs**, clique em **Add URL** e coloque o mesmo endereço. Salve.

**c) Senhas mais fortes**
1. Menu **Authentication → Sign In / Providers → Email** (em alguns projetos fica em **Settings → Password**).
2. **Minimum password length**: 10. Em **Password requirements**, escolha letras e números.
3. Se aparecer **Prevent use of leaked passwords**, ligue. (Nos planos pagos.)
4. Confira que **Allow new users to sign up** está desligado (etapa 3).

**d) Ativar a verificação em duas etapas**
1. No celular, instale o **Google Authenticator**, **Microsoft Authenticator** ou **Authy**.
2. No painel, vá em **Configurações → Segurança da conta → Verificação em duas etapas → Ativar**.
3. Leia o código QR com o app e digite os 6 números. Pronto: a partir de agora o painel pede a senha **e** o código.
4. **Guarde a chave de texto** que aparece embaixo do QR num lugar seguro (por exemplo, no gerenciador de senhas). É com ela que você recadastra o app se trocar de celular.

**Como fica a recuperação**
- **Esqueceu a senha:** na tela de login, toque em **Esqueci minha senha**. Chega um e-mail com um link válido por 1 hora; ao abrir, o painel pede o código do app (se estiver ativo) e deixa criar uma senha nova. As outras sessões abertas são encerradas.
- **Perdeu o celular do autenticador:** entre no Supabase (com a sua conta do GitHub), abra o **SQL Editor** e rode:
  ```sql
  delete from auth.mfa_factors
  where user_id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
  ```
  Depois entre no painel só com a senha e ative as duas etapas de novo no celular novo. Proteja bem a conta do GitHub/Supabase, porque é ela que guarda essa chave mestra.
- **Desconfia que alguém entrou:** em **Configurações → Segurança da conta**, veja os **Últimos acessos**, use **Sair de todos os aparelhos** e troque a senha.

**O que já está protegendo o painel**
- Só o e-mail liberado no `02_admin.sql` acessa os dados; isso é conferido pelo próprio banco, não só pela tela.
- Com as duas etapas ativas, o banco recusa qualquer acesso que não tenha passado pelo código.
- Depois de 5 senhas ou códigos errados, o painel faz uma pausa crescente (30 s, 1 min, 2 min… até 15 min). O Supabase também limita tentativas do lado dele.
- O painel sai sozinho depois de 30 minutos sem uso (dá para mudar por aparelho em **Segurança da conta**).
- O e-mail de recuperação não revela se um endereço tem conta ou não.

> O e-mail de recuperação sai pelo servidor de testes do Supabase, que manda poucos e-mails por hora. Para o seu uso (uma conta) é suficiente. Se um dia quiser e-mails com o nome da RazenLab, configure um SMTP em **Authentication → Emails → SMTP Settings**.

## 11. Trocar as fotos do site

No painel, abra **Vitrine**:
- **Fotos do site:** troque a **foto de capa** (a grande do topo) e a **logo**. Aparecem no site na hora. **Voltar à original** desfaz.
- **Peças do catálogo:** cada trabalho tem até 4 fotos. Toque em **capa** numa foto para ela ser a principal do cartão. Também dá para mudar título, categoria, selo e preço.
- Enquanto a vitrine estiver vazia, o site mostra a coleção de exemplo. O botão **Trazer a coleção de exemplo para editar** copia os 8 exemplos para a vitrine, para você trocar as fotos pelas das suas peças, ajustar os preços ou excluir os que não quiser.

---

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
- **Avaliar link do MakerWorld diz que a função não foi publicada** → faça a etapa 9.
- **"Não foi possível abrir o pagamento"** no link do cliente → confira se a função `pagamento` foi publicada, o segredo `MP_ACCESS_TOKEN` e se a opção está ligada no painel.
- **Cliente pagou no cartão e o pedido não virou Pago** → confira se a função `mp-webhook` foi publicada **com a verificação de JWT desligada**.
- **"Falta atualizar o banco"** ao marcar "Não fechou" → rode de novo o `01_estrutura.sql`.
- **Mudou algo e o celular mostra a versão antiga** → feche e abra o app, ou recarregue a página.
