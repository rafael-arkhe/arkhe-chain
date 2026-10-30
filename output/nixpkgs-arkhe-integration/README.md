# Integração Arkhe validada

A série contém dois commits contra origin/master do fork rafael-arkhe/nixpkgs-arkhe.

Aplique em checkout limpo dessa base:

```bash
git am --keep-cr arkhe-complete.patch
```

`--keep-cr` preserva os bytes CRLF originais do snapshot, conferidos pelo manifesto SHA-256. Alternativa: aplicar os patches individuais em validated-series/ na ordem numérica. A série foi aplicada a um índice temporário da base; o tree resultante coincidiu exatamente com o HEAD preparado. O snapshot versionado também foi conferido contra o manifesto (593 arquivos).

Resultados: dez outputs construídos no host e em VM QEMU/KVM com store próprio; derivações e hashes NAR idênticos. Veja arkhe/docs/INTEGRATION-REVIEW.md no checkout preparado.
