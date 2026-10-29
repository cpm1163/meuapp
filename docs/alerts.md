# Alertas

Decidido em 29/10/2026, junto com a navegação centrada no paciente (mapa mental "Médico" no Whimsical).

## O que é

Alertas mostram o que precisa da atenção do médico. Ficam na home (os 3 mais recentes) e na tela **Alertas** (`/alerts`), aberta por "Ver todos".

## Regras

- **O banco cria o alerta** quando o evento acontece, por gatilho (`supabase/migrations/20261029000100_alerts.sql`).
- **O alerta some sozinho** quando a pendência é resolvida.
- **O médico pode excluir** um alerta, vários selecionados ou todos ("Marcar todos"). Excluir um alerta nunca apaga o documento.
- **Visualizar** marca o alerta como lido e abre a aba da Caixa de entrada onde o documento está.
- Um alerta excluído não volta quando a análise do documento muda de status. Só volta se acontecer um evento novo, como o documento perder o paciente.

## Tipos

| Tipo | Quando nasce | Quando some sozinho |
|---|---|---|
| Documento sem paciente | O documento fica disponível sem paciente, ou é desvinculado do paciente. Só para quem já teve o módulo de pacientes. | O documento é vinculado a um paciente, ou começa a ser excluído. |
| Documento compartilhado com você | Outro médico compartilha um documento. | O acesso é revogado, ou o documento começa a ser excluído. |

Tipos futuros (por exemplo, análise aguardando aprovação) entram como novo valor em `alerts.kind`, com gatilho próprio.
