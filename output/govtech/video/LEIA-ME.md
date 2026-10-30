# Demonstração Arkhe GovTech

- Vídeo final: `arkhe-govtech-demonstracao-completa.mp4`.
- Duração: aproximadamente 7min15s.
- Formato: 1920 × 1080, 24 fps, H.264, áudio AAC estéreo.
- Narração: voz sintetizada em português brasileiro (Microsoft Maria Desktop), com aceleração de 1,25× preservando o tom.
- Legendas: faixa opcional no MP4 e arquivo `arkhe-govtech-legendas.srt`.
- Navegação: 19 capítulos no MP4; roteiro em `roteiro.md`; tempos em `timeline.json`.

O vídeo é uma montagem com capturas reais do aplicativo e narração. Não é gravação contínua das interações. As capturas foram realizadas pela interface do app, incluindo cadastro, revisão assinada por segunda conta, confirmação e execução local, inspeção, políticas, emergência, exportação/verificação, integrações e plano de piloto. A voz e os dados são sintéticos. Não há pagamento, contratação ou ato público real.

As capturas possuem a qualidade fornecida pelo navegador; a resolução do arquivo final não implica que o texto fino da interface tenha sido capturado nativamente em 1080p. Use o aplicativo ou pause o vídeo para inspecionar os campos.

## Ampliação implementada

Três telas adicionais: Aprovações, Execuções e Plano do piloto. Modais de dossiê, execução, política, parada/retomada e edição do plano; revisão assinada já existente com mensagem de erro melhorada. Plano persistente, controle de revisão concorrente e exigência de evidência para o estado documentado.

Validação do app: build de produção, TypeScript e 88 testes aprovados. Fluxo principal e plano conferidos no navegador. As limitações anteriores de integração e o gate global de arquitetura permanecem documentados em `docs/GOVTECH-APP.md` e no relatório da entrega anterior.

## Verificação do vídeo

FFprobe confirmou vídeo 1920 × 1080, áudio, legenda e 19 capítulos. Decodificação integral pelo FFmpeg terminou sem erros. A duração foi comparada ao roteiro temporizado. Quadros de execução e piloto foram extraídos para inspeção. Áudio de origem não é silencioso e seu pico medido ficou abaixo de 0 dBFS.

## Reprodução da montagem

As capturas, narrações e descrições de cena estão preservadas em `scenes/`, `audio/` e `scenes.json`. Execute `scripts/render_govtech_demo.py` a partir do workspace com Python/Pillow e FFmpeg disponíveis. A edição gera quadros, segmentos, MP4, legendas, capítulos e metadados de validação. Arquivos de contas e chaves privadas não fazem parte deste diretório.

O checkpoint usado no caminho positivo do vídeo veio do próprio pacote sintético para demonstrar o mecanismo. Em auditoria real, é necessário checkpoint retido por canal independente. O vídeo e o app não declaram ICP-Brasil, MMR/PCO Rust ou conectores estatais qualificados.
