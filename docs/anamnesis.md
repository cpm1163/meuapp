# Anamnese do paciente

## Estado e escopo

Proposta iniciada em 26/10/2026, em conversa com o usuário. **Nenhum código ainda.** Antes, termina o teste das considerações clínicas em rascunho ([clinical-considerations.md](clinical-considerations.md), "Implementação do rascunho").

| Passo | Estado atual |
| --- | --- |
| 1 — Onde fica | Decidido em 26/10/2026: na ficha do paciente, na gestão documental (ver abaixo). |
| 2 — Relação entre gestão e análise | Regra definida em 26/10/2026 (ver abaixo); uma exceção existente a remover. |
| 3 — Campos | Decidido em 27/10/2026: sem campos clínicos; a ficha é dados pessoais + anotações (ver "A ficha"). |
| 4 — Estruturado ou texto livre | Decidido em 27/10/2026: texto livre. |
| 5 — Uso pela análise | Por ora, nenhum: as anotações são texto livre (ver "Uso pelas considerações clínicas"). |
| 6 — Modelo de dados, interface e testes | Layout decidido em 27/10/2026 (ver "Layout"); modelo de dados e testes pendentes. |

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

## A ficha (decidido em 27/10/2026)

O usuário quer a mesma experiência do médico com a ficha de papel: ele pega a ficha do paciente, anota à mão durante a conversa e consulta as anotações anteriores. A tela do paciente vira essa ficha, com duas partes:

1. **Dados pessoais:** nome, nascimento e sexo, como hoje. Por ora é suficiente.
2. **Anotações (texto livre):** uma lista única, por data e hora de entrada, a mais recente primeiro. Não há separação entre "situação atual" e "histórico": a anotação de hoje, depois de gravada, passa a fazer parte da ficha como as outras. No mesmo dia pode haver nenhuma, uma ou várias anotações. Peso, alergias, medicamentos e o resto entram no texto das anotações.

Regras das anotações:

- O médico **pode corrigir qualquer anotação, a qualquer momento**, a de hoje ou as antigas. Vale só a versão corrigida: a anterior **não é guardada**.
- Nenhuma anotação é apagada.
- Não há registro automático de mudanças.

### Entrada por voz (decidido em 27/10/2026)

As anotações de consulta podem ser ditadas pelo **ditado do teclado do sistema** (botão de microfone do teclado no iOS e no Android), que transcreve a fala direto no campo da anotação. O médico revisa e salva.

- **Compatível com o Expo Go**, decisão do usuário: sem biblioteca nativa e sem novo build. No app basta um campo de texto grande, com várias linhas, para a anotação.
- **Sem custo:** a transcrição é do sistema do celular. Cabe na gestão, que não usa IA.
- **Privacidade:** o app não controla onde o teclado transcreve. Dependendo do aparelho e da configuração, o áudio pode ir aos servidores da Apple ou do Google. Nada de áudio é guardado pelo app.
- **Ditado, não gravação da consulta:** o médico fala o que quer registrar.
- **Descartado por ora:** botão de microfone próprio do app (`expo-speech-recognition`, biblioteca nativa, não roda no Expo Go; permitiria exigir reconhecimento local) e transcrição na nuvem (paga). O Expo não tem módulo de fala para texto (`expo-speech` só lê texto em voz alta).

### Layout (decidido em 27/10/2026)

Visual de fichas (cards), como os pontos de atenção da análise. A tela do paciente ganha duas abas abaixo do cabeçalho (nome, idade, sexo): **Ficha**, que abre primeiro, e **Documentos**, com a lista de hoje.

Aba Ficha: botão "+ Nova anotação" no topo (campo grande, com ditado do teclado) e, abaixo, um card por anotação, a mais recente primeiro, com data e hora no topo do card. Tocar no card abre para corrigir. Sem anotações, a aba mostra "Nenhuma anotação ainda".

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

## Assuntos das anotações

Não há campos: tudo vai no texto livre das anotações (decidido em 27/10/2026). Assuntos que o médico costuma registrar, que podem servir de dica no campo vazio: doenças conhecidas, medicamentos em uso, alergias, histórico familiar, hábitos (tabagismo, álcool, atividade física), gestação, peso.

## Uso pelas considerações clínicas

Sempre como leitura e decisão do código, nunca como diagnóstico:

- **LDL e não-HDL:** a meta da SBC 2025 depende da categoria de risco cardiovascular. O médico informa a categoria (a anamnese dá o contexto); o app usa a meta correspondente. Hoje essas fichas ficam de fora.
- **Eosinofilia:** rinite alérgica ou dermatite atópica na anamnese dão contexto à ficha de causas alérgicas.
- **Leucócitos:** gestação muda a referência; hoje a ficha avisa que o laudo não informa gestação.

Sem anamnese, as considerações continuam como hoje.

**Efeito do texto livre (27/10/2026):** o código não lê texto livre com segurança, então, por ora, as anotações não alimentam as considerações. Os usos acima ficam para o futuro (por exemplo, uma marcação só de gestação, ou envio das anotações à IA com decisão do usuário).
