# Resolução CNAE v1

Contrato executável: `apps/arkhe-intra/lib/enterprise-catalog.mjs`, constante imutável `CNAE_PRIORITY`. A UI importa a mesma função do servidor.

Depois de validar o formato do CNAE no onboarding, a resolução remove pontuação e percorre a lista em ordem. **O primeiro prefixo que corresponde vence**. Não existe regra implícita de maior prefixo ou proximidade numérica. A seleção manual do setor prevalece sobre a sugestão, inclusive quando a sugestão é `generic`.

| Ordem | Prefixos, nesta ordem | Setor |
| --- | --- | --- |
| 1 | 65 | insurance |
| 2 | 64, 66 | finance |
| 3 | 86, 87, 88 | health |
| 4 | 69 | legal |
| 5 | 01, 02, 03 | agribusiness |
| 6 | 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33 | manufacturing |
| 7 | 84 | government |
| 8 | 62, 63 | technology |
| 9 | 35 | energy |
| 10 | 41, 42, 43 | construction |
| 11 | 85 | education |
| 12 | 47 | retail |
| fallback | nenhum match | generic |

Os prefixos atuais têm dois dígitos e não se sobrepõem: um mesmo CNAE não pode começar simultaneamente com 64, 65 e 66. A regra first-match permanece explícita para futuras sobreposições. O teste usa três regras sobrepostas (`6`, `64`, `649`) para fixar esse comportamento e inverte a ordem para conferir o resultado.

Casos congelados: `6499-9/99` → finance; `6511-1/01` → insurance; `6619-3/99` → finance; `9999-9/99` → generic. Entrada vazia resolve generic no helper, mas não passa pela validação do formulário/API.

O catálogo contém doze setores e um perfil genérico neutro. Generic não inventa retenção, chave, quotas, evidências ou âncoras regulatórias: estes campos ficam a definir. A sugestão é heurística de produto; não atesta classificação oficial nem compliance.
