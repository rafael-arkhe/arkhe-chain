# Adaptador nativo unificado

Modo: trial. Estado: INCOMPLETE. Receipts: 4/22.

sealed=false; runtime_verified=false. Cobertura dinâmica completa do Seccomp e revisão dos filtros herdados permanecem obrigatórias.

- expected exactly 22 ordered receipts
- command failed (1): Traceback (most recent call last):
  File "<string>", line 12, in <module>
    if (root/'exit').exists():exit_code=int((root/'exit').read_text());break
                                        ~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^
ValueError: invalid literal for int() with base 10: ''

