# E01 C01 — pré-voo de ambiente em 21/10/2026

Estado: inventário parcial do host. Não constitui instalação limpa, revisão
humana, seleção de VM, criação de snapshot ou ensaio dentro de convidado.

## Observações coletadas

| Item | Resultado |
| --- | --- |
| Sistema do host | Microsoft Windows 11 Home Single Language, 10.0.26300, x64. |
| Memória física | Aproximadamente 31,8 GiB. |
| Processadores lógicos | 12. |
| Win32_ComputerSystem.HypervisorPresent | true. Não identifica produto, VM ou isolamento. |
| Indicadores CIM do processador | VirtualizationFirmwareEnabled=false e VMMonitorModeExtensions=false. Esses indicadores isolados não determinam disponibilidade real de virtualização quando há hipervisor ativo. |
| Comandos no PATH | Get-VM, VBoxManage, vmrun e WindowsSandbox não retornaram comandos. |
| Caminhos padrão consultados | VBoxManage.exe, vmrun.exe, WindowsSandbox.exe e módulo PowerShell Hyper-V não encontrados nos caminhos abaixo. |
| Imagens na raiz de Downloads | Nenhum arquivo com extensão ISO, VHD, VHDX, OVA, OVF, VDI ou VMX retornado. Busca não recursiva. |
| Integridade do kit C01 | SHA-256 corresponde ao valor congelado. |

Caminhos consultados:

```text
C:/Program Files/Oracle/VirtualBox/VBoxManage.exe
C:/Program Files/VMware/VMware Workstation/vmrun.exe
C:/Windows/System32/WindowsSandbox.exe
C:/Windows/System32/WindowsPowerShell/v1.0/Modules/Hyper-V
```

Kit conferido: `dist/Arkhe-E01-Verifier-0.1.0-windows-x64.zip`.
SHA-256: `1484bbad22f04b50caa508343fd7cabe765e3d4f654c80cd62f67aafed55d2ea`.
O hash comprova correspondência dos bytes; não é assinatura de editor.

## Configuração candidata para planejamento

Proposta técnica, não provisionada: VM dedicada Windows x64 com 4 vCPUs,
8 GiB de RAM e disco virtual de 80 GiB. Compatibilidade e recursos disponíveis
devem ser conferidos no hipervisor escolhido; esses números não são resultado
de benchmark ou requisito mínimo comprovado do kit.

Hipervisor, versão, imagem de origem, edição/build do convidado, licença e
identificador da VM permanecem não informados. Não reutilizar a build do host
como se fosse a build observada de uma VM limpa. Não instalar Ollama ou SDKs
como pré-requisito de C01.

Após selecionar o ambiente, ONB04 deverá observar conta exclusiva, inventário
inicial, rede desconectada, clipboard e compartilhamentos desabilitados e
snapshot criado/verificado. O nome planejado S0 não demonstra sua existência.

## Continuidade

- ONB02: aguardando confirmação humana de leitura, decisão, data/hora e notas.
- ONB03: aguardando identificação de VM/hipervisor e imagem Windows x64 disponível.
- ONB04 e ONB05: NOT_RUN, sem antecipar dependências.

Não foi instalado hipervisor, baixada imagem, alterada rede do host ou iniciado
ensaio fora da VM para representá-lo como instalação limpa. O backlog permanece
inalterado. A ausência nos caminhos consultados não prova ausência de instalações
em outros locais ou de recursos geridos por outro mecanismo.
