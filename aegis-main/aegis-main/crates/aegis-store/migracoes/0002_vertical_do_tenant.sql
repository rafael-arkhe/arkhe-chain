-- 0002: o tenant sabe QUE VERTICAL o possui.
--
-- 🔴 Porquê. A seed da portaria, no núcleo anterior, gastava 1.015 linhas a
-- fazer meia coisa que não é dela: **aposar as páginas da vertical
-- anterior**. E fazia isso importando as outras seeds
-- (`slugs_de_outras_verticais()`), com o comentário *"deriving beats
-- listing"* — e a derivação **era** o import.
--
-- Isso viola a regra de "um vertical é dado, nunca código": um produto que
-- lê o código de outro produto deixa de ser um vertical, passa a ser um
-- grafo de dependências entre produtos. Trocar a ordem de instalação muda o
-- resultado, e ninguém descobre até a tela aparecer errada.
--
-- A correção é dizer de quem é a culpa: **isso é da instalação, não do
-- produto.** Uma ilha corre UM produto, e portanto instalar um aposar o
-- anterior é uma propriedade de *quem instala*. Para o instalador saber o
-- que está a aposar, o tenant tem de saber **qual** o vertical que o possui.
--
-- E o que fica no manifesto passa a ser só o que é do produto: as suas
-- páginas, o seu menu, a sua cópia. Nada de "e tire as do outro".

alter table aegis_tenant
    add column if not exists vertical text;

comment on column aegis_tenant.vertical is
    'Slug do vertical que possui este tenant. NULL numa ilha sem produto instalado. E o que permite a instalacao aposar o produto anterior sem o produto saber que ele existia.';
