# Receitas

## Estado e escopo

Proposta definida em 28/10/2026, em conversa com o usuário. **Implementada em 28/10/2026 (branch dev23)**, falta o teste no celular.

| Passo | Estado atual |
| --- | --- |
| 1 — Escopo da primeira versão | Decidido em 28/10/2026: receita simples, sem IA (ver abaixo). |
| 2 — Dados do médico | Decidido em 28/10/2026 (ver "Perfil do médico"). |
| 3 — Tela e abas | Decidido em 28/10/2026 (ver "Layout"). |
| 4 — Modelo de dados, interface e testes | Feito em 28/10/2026 (ver "Implementação"); falta o teste no celular. |
| 5 — Alergias e cruzamento | Para depois (ver "Próximos passos"). |

Documentos relacionados: [anamnesis.md](anamnesis.md) (ficha do paciente) e [grants.md](grants.md) (documentos).

## Onde fica: gestão documental

A receita é feita pelo médico, sem IA. Fica na **gestão documental**, ao lado da ficha e dos documentos do paciente. Não tem custo de IA.

## Primeira versão (decidido em 28/10/2026)

Receita de **medicamento comum**, gerada em **PDF**, que o médico imprime e assina à mão ou compartilha para impressão.

Fora da primeira versão:

- Medicamentos controlados (receita azul e amarela, Portaria 344/98), que têm formulário e regras próprios.
- Assinatura digital (certificado ICP-Brasil), que tem custo.
- Cruzamento com alergias e lista de medicamentos em uso.

Antes de usar com pacientes, as regras da receita precisam ser confirmadas com o médico parceiro. Elas mudam e podem variar por estado.

## Perfil do médico

Cadastrado uma vez: nome, CRM e UF, endereço, telefone, e-mail, especialidade e RQE.

O médico escolhe quais dados saem na receita, um por um. **Nome e CRM/UF saem sempre**, porque sem eles a receita não é aceita na farmácia. Os outros dados ficam a critério dele.

## A receita

Cada receita tem:

- **Itens**, um por medicamento: medicamento (texto livre, por exemplo "Amoxicilina 500 mg"), posologia (por exemplo "1 cápsula de 8/8 h por 7 dias") e quantidade (por exemplo "21 cápsulas").
- **Observações** (opcional).
- **Data**, preenchida automaticamente.
- Cabeçalho com os dados escolhidos do médico e o nome do paciente.

O PDF usa `expo-print` e `expo-sharing`, como o relatório da análise. Funciona no Expo Go, sem novo build.

**Repetir receita:** a partir de uma receita antiga, abre uma nova já preenchida com os mesmos itens, para o médico revisar e gerar.

## Layout

A tela do paciente passa a ter três abas: **Ficha | Documentos | Receitas**.

Aba Receitas: botão "+ Nova receita" no topo e, abaixo, um card por receita (data e medicamentos), a mais recente primeiro. Tocar no card abre o PDF e as opções "Repetir" e "Compartilhar". Sem receitas, a aba mostra "Nenhuma receita ainda".

## Implementação (28/10/2026)

- **Banco:** migração `20261028000100`. A tabela `doctor_profiles` tem uma linha por médico, e o campo `printed` lista os dados opcionais que saem na receita. A tabela `prescriptions` guarda os itens, as observações, o nome do paciente e uma cópia do cabeçalho (`prescriber`) feita na hora da emissão: se o médico mudar o endereço depois, a receita antiga sai igual. Leitura só do dono (RLS).
- **Escrita só por função:** `save_doctor_profile` não exige o módulo, porque são dados do próprio médico. `create_prescription` exige o módulo `patient-records` e o perfil cadastrado. Ela também limpa os itens: de 1 a 20, com medicamento e posologia obrigatórios. Não há como alterar nem excluir uma receita; para mudar, usa-se "Repetir".
- **Paciente com receitas não pode ser excluído** (`patient_has_prescriptions`), como acontece com documentos e anotações.
- **Nenhum PDF é guardado:** a receita é impressa de novo, a partir dos dados salvos, toda vez que o médico abre, imprime ou compartilha.
- **App:** a aba Receitas fica em [patient.tsx](../src/app/patient.tsx) e é implementada em [Prescriptions.tsx](../src/features/prescriptions/Prescriptions.tsx), que tem a lista, o editor e a tela com Imprimir, Compartilhar PDF e Repetir. [DoctorProfileForm.tsx](../src/features/prescriptions/DoctorProfileForm.tsx) tem um botão "Sair na receita" para cada dado opcional. Na primeira receita, o app pede antes os dados do médico. O PDF sai em A4.
- **Testes:** 22 em `supabase/tests/prescriptions_rls.test.sql` e 4 em `tests/prescriptions.test.cjs`.

## Próximos passos (para depois)

Discutidos em 28/10/2026, ainda sem decisão:

- **Bloco fixo no topo da ficha** com alergias e medicamentos em uso. Isso muda a decisão de 27/10/2026 em [anamnesis.md](anamnesis.md) de não ter campos clínicos. Fica em aberto se um medicamento suspenso é apagado ou marcado como "suspenso" com a data.
- **Alergias estruturadas:** substância (princípio ativo, escolhido da lista DCB), reação (texto livre) e gravidade, além de "Nega alergias".
- **Cruzamento por regra, sem IA:** alerta quando o medicamento da receita tem a mesma substância ou a mesma família de uma alergia anotada. A tabela de famílias precisa ser revisada por um médico. O alerta ajuda, mas não garante: "sem alerta" não quer dizer "seguro".
- **Conferência com IA usando a bula da ANVISA** (contraindicações e interações). Ficaria no módulo de análise, com custo por receita, e só seria ligada com a confirmação do usuário.
