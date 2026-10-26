# Anamnese do paciente

## Estado e escopo

Proposta iniciada em 26/10/2026, em conversa com o usuário. **Nenhum código ainda.** Antes, termina o teste das considerações clínicas em rascunho ([clinical-considerations.md](clinical-considerations.md), "Implementação do rascunho").

| Passo | Estado atual |
| --- | --- |
| 1 — Onde fica | Decidido em 26/10/2026: na ficha do paciente, na gestão documental (ver abaixo). |
| 2 — Relação entre gestão e análise | Regra definida em 26/10/2026 (ver abaixo); uma exceção existente a remover. |
| 3 — Campos | Proposta abaixo, pendente de decisão. |
| 4 — Estruturado ou texto livre | Pendente. |
| 5 — Uso pela análise | Proposto: só leitura, pelo código, para escolher fichas; envio à IA só com decisão do usuário. |
| 6 — Modelo de dados, interface e testes | Pendentes. |

Documentos relacionados: [grants.md](grants.md) (FASE 01, documentos e compartilhamento), [profiles.md](profiles.md) (FASE 02, módulos) e [clinical-considerations.md](clinical-considerations.md) (considerações clínicas, que usariam a anamnese).

## O que é

Antecedentes do paciente registrados pelo médico: doenças conhecidas, medicamentos, histórico familiar, hábitos, gestação, alergias. "Anamnese" é a forma usual do termo (a variante "anamnésia" é menos comum); "anaminesia" não existe e não aparece no app.

## Onde fica: gestão documental

O app tem duas camadas:

| | **Gestão documental (base)** | **Módulos de análise** |
| --- | --- | --- |
| Quem usa | Toda conta | Quem tem o módulo liberado pelo `admin` e aceitou os termos |
| Conteúdo | Documentos, pacientes, compartilhamento | Análise de exames, considerações clínicas |
| IA | Não usa | Usa |

A anamnese é informação do paciente, sem IA. Decidido com o usuário em 26/10/2026: ela fica na **ficha do paciente**, na gestão, ao lado de nome, nascimento e sexo. Assim fica disponível para toda conta e não tem custo de IA.

## Relação entre gestão e análise

Regra definida pelo usuário em 26/10/2026: **a gestão conversa com a análise; a análise não conversa com a gestão.**

1. **Análise independente.** A análise funciona só com o laudo. Nada nela exige paciente, cadastro ou anamnese. O médico pode analisar um exame sem organizar pacientes.
2. **Gestão opcional, acima.** Quando existe, a gestão fornece dados à análise: sexo e nascimento do paciente e, no futuro, a anamnese. A análise só lê.
3. **Sem volta.** A análise não altera nada da gestão. Ela guarda os próprios resultados (pontos de atenção, considerações, PDF) no próprio espaço.

**Exceção existente, a remover:** quando o laudo imprime o sexo e o cadastro não tem, a tela da análise oferece completar o cadastro (`fillRecordSex` em [AnalysisScreen.tsx](../src/features/analyses/AnalysisScreen.tsx)). Proposta: trocar por um aviso ("o cadastro não tem o sexo; o laudo informa Masculino") com o botão "Ver paciente", e o médico preenche na ficha. O aviso de possível paciente errado continua, porque só lê.

**Pendente de confirmação:** hoje, para analisar, o médico envia o laudo como documento, o que faz parte da gestão. Falta decidir se basta o paciente ser opcional (como já é) ou se a análise deve ter um envio próprio.

## Privacidade

- Dados de saúde são sensíveis (LGPD). A anamnese fica só com o médico dono do paciente, com o mesmo controle de acesso do cadastro.
- **Compartilhar um documento não compartilha a anamnese**, como já acontece com as análises.
- A anamnese só vai para a IA se o usuário decidir, e nunca com nome ou CPF.

## Campos propostos (versão 1)

- Doenças conhecidas (diabetes, hipertensão, doença renal, doença cardiovascular…)
- Medicamentos em uso
- Histórico familiar (doença cardiovascular precoce, diabetes, colesterol alto)
- Hábitos: tabagismo, álcool, atividade física
- Gestação (para mulheres)
- Alergias
- Observações livres

Campos estruturados (marcar opções) permitem que o código os use; texto livre é mais rápido de preencher. Pendente de decisão.

## Uso pelas considerações clínicas

Sempre como leitura e decisão do código, nunca como diagnóstico:

- **LDL e não-HDL:** a meta da SBC 2025 depende da categoria de risco cardiovascular. O médico informa a categoria (a anamnese dá o contexto); o app usa a meta correspondente. Hoje essas fichas ficam de fora.
- **Eosinofilia:** rinite alérgica ou dermatite atópica na anamnese dão contexto à ficha de causas alérgicas.
- **Leucócitos:** gestação muda a referência; hoje a ficha avisa que o laudo não informa gestação.

Sem anamnese, as considerações continuam como hoje.
