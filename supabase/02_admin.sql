-- ==========================================================================
--  RAZENLAB · liberar seu acesso ao painel
--  1) Troque SEU-EMAIL-AQUI pelo e-mail que você cadastrou em Authentication → Users
--  2) Clique em RUN. A tabela que aparecer embaixo deve mostrar o seu e-mail.
-- ==========================================================================
insert into public.admins (user_id)
select id from auth.users where lower(email) = lower('SEU-EMAIL-AQUI')
on conflict (user_id) do nothing;

select u.email as "administradores do painel"
from public.admins a join auth.users u on u.id = a.user_id;
