# RazenLab

Site público + painel interno de pedidos e precificação para impressão 3D.

| Arquivo | O que é |
|---|---|
| `index.html` | Site para os clientes: vitrine de trabalhos, como funciona e pedido de orçamento pelo WhatsApp |
| `painel.html` | Seu sistema: pedidos, calculadora, vitrine, filamentos, configurações |
| `vitrine.json` | Os trabalhos e contatos que o site mostra. Gerado pelo painel |
| `assets/` | Logo e ícones |
| `manifest.json`, `sw.js` | Permitem instalar o painel no celular como app |
| `.nojekyll` | Arquivo vazio; evita que o GitHub processe o site de outro jeito |

## Publicar pela primeira vez

1. Em github.com, **New repository**. Nome: `razenlab`. **Public**. Criar.
2. Clique em **uploading an existing file**.
3. Abra a pasta `razenlab` no seu computador, selecione **tudo que está dentro dela** (inclusive a pasta `assets`) e arraste para a página. O GitHub mantém as pastas.
4. **Commit changes**.
5. **Settings → Pages**. Em *Source*: **Deploy from a branch**. Branch **main**, pasta **/ (root)**. **Save**.
6. Em 1 a 2 minutos o endereço aparece no topo da página:
   - Site: `https://SEU-USUARIO.github.io/razenlab/`
   - Painel: `https://SEU-USUARIO.github.io/razenlab/painel.html`

> O `.nojekyll` começa com ponto e o Windows às vezes esconde. Se não aparecer, tudo funciona igual sem ele.

## Primeiro uso do painel

1. Abra o endereço do painel no celular e instale: Chrome → menu ⋮ → **Adicionar à tela inicial**.
2. **Configurações → Seu negócio**: preencha WhatsApp, Instagram e cidade. Salve.
3. **Configurações → Custos da oficina**: revise os valores. Salve.
4. **Filamentos**: cadastre os rolos que você tem.

Use sempre pelo mesmo aparelho e pelo endereço do GitHub — é ali que os dados ficam gravados.

## Atualizar o site com trabalhos novos

1. Painel → **Vitrine → Adicionar trabalho** (ou, num pedido entregue, **Mostrar na vitrine**).
2. **Baixar vitrine.json**.
3. GitHub → repositório → **Add file → Upload files** → arraste o `vitrine.json` → **Commit changes**.

O site atualiza em 1 a 2 minutos. Mudou WhatsApp ou Instagram no painel? Mesmo caminho: baixe e suba a vitrine de novo.

## Onde ficam os dados

- **Pedidos, clientes, valores e custos**: só no navegador do aparelho onde você usa o painel. Nunca vão para o GitHub, então nenhum cliente vê.
- **Vitrine**: no navegador e, depois de publicada, no `vitrine.json` do repositório (esse é público).
- Faça **Configurações → Exportar backup** toda semana e guarde o arquivo no Drive. Trocar de celular ou limpar o navegador sem backup apaga os pedidos.

## Mudar a regra de preço

Tudo está na função `precificar()` do `painel.html`, com as fórmulas comentadas.
