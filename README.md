# RazenLab

Impressão 3D sob encomenda: site para clientes, página de acompanhamento do pedido e painel de gestão.

| Arquivo | O que é |
|---|---|
| `index.html` | Site: vitrine de trabalhos e pedido de orçamento |
| `pedido.html` | Página do cliente: orçamento, Pix com QR Code, comprovante e rastreio |
| `painel.html` | Seu sistema: pedidos, orçamento, clientes, estoque, financeiro, vitrine |
| `privacidade.html` | Política de privacidade (LGPD) e termos de encomenda |
| `404.html` | Página de endereço não encontrado |
| `config.js` | Endereço e chave pública do Supabase — **preencher** |
| `supabase/01_estrutura.sql` | Tabelas, regras de segurança e funções do banco |
| `supabase/02_admin.sql` | Libera o seu e-mail como administrador |
| `supabase/functions/frete` | Cotação de frete pelo Melhor Envio (opcional) |
| `supabase/functions/avisar` | Aviso de pedido e comprovante no Telegram (opcional) |
| `assets/`, `manifest.json`, `sw.js` | Logo, ícones e instalação do painel como app |
| `vitrine.json` | Reserva usada só se o Supabase não estiver configurado |

**Para colocar no ar, siga o [INSTALACAO.md](INSTALACAO.md).**

A regra de preço está na função `precificar()` do `painel.html`.
