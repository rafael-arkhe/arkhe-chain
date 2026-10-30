# Registro local de credenciais

`/registro` implementa o fluxo de intranet: convite, identificação, chave local
e protocolo de solicitação. `/credenciais` apresenta a credencial ativa e, para
governança, emissão de convites, fila de revisão e ativação assinada.

Convites de autoria ou revisão expiram em 48 horas, usam token de uso único
armazenado somente como hash e vinculam email/papel. O navegador gera Ed25519 ou
importa PKCS8 localmente; a chave privada não é enviada ao servidor. O cadastro
assina uma prova de posse e fica pendente, sem sessão ou privilégio ativo.

A governança assina a identidade, chave, papel e compromisso da credencial de
acesso antes da ativação. O carregamento das contas revalida essa assinatura.
Senha usa scrypt; chaves aprovadas entram na exportação de confiança offline.
Não há autocadastro de governança, SSO, verificação de email, recuperação de senha
ou revogação administrativa de contas nesta versão. A identidade é da aplicação
local e não equivale a admissão no kernel ou no WormGraph.

O fluxo real de cadastro, download local de chave, revisão assinada e login da
conta aprovada foi testado com dados sintéticos. Capturas em
`docs/evidence/local/2026-10-18/credential-registration/`.
