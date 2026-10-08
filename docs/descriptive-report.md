# FASE 05 — Laudos descritivos

## Estado e escopo

Planejamento iniciado em 08/10/2026, em conversa com o usuário. **Nenhum código ainda.** Esta fase começa depois que a comparação de laudos laboratoriais da FASE 04 ([exam-comparison.md](exam-comparison.md)) estiver funcionando.

| Passo | Estado atual |
| --- | --- |
| 1 — Tipos de laudo | Definidos em 08/10/2026 (ver abaixo). |
| 2 — Amostras | Ultrassonografia de abdome total recebida em 08/10/2026 (ver [Amostra 1](#amostra-1--ultrassonografia-de-abdome-total)). |
| 3 — Esquema de extração | Proposto neste documento. |
| 4 — Comparação | Regras propostas neste documento. |
| 5 — Modelo de dados, interface e validação | Pendentes. |

As fases anteriores estão em [authentication.md](authentication.md) (FASE 0), [grants.md](grants.md) (FASE 01), [profiles.md](profiles.md) (FASE 02), [compliance.md](compliance.md) (FASE 03) e [exam-comparison.md](exam-comparison.md) (FASE 04).

## Dois tipos de laudo

Definidos com o usuário em 08/10/2026:

| | **Laboratorial (paramétrico)** | **Descritivo** |
| --- | --- | --- |
| Exemplos | Hemograma, glicose, colesterol | Ultrassom, raio-X, tomografia, ressonância, endoscopia, anatomopatológico |
| Conteúdo | Parâmetro, valor, unidade e referência | Texto do profissional que executou o exame, por estrutura ("Fígado com…") |
| Referência | Impressa pelo laboratório | Não existe; "normal" é julgamento de quem examinou |
| Medidas | Sempre | Às vezes, no meio do texto ("22 x 18 mm"), sem faixa de referência |
| Conclusão | Não tem | Às vezes há impressão ou conclusão |
| Assinatura | Responsável técnico | Médico que executou e laudou o exame |
| Tratado em | FASE 03 e FASE 04 | Esta fase |

O nome da categoria é **descritivo**, e não "imagem", para incluir anatomopatológico, endoscopia e outros laudos escritos pelo profissional (decidido em 08/10/2026).

## Laudo misto e classificação por exame

Decidido em 08/10/2026: **é comum um mesmo PDF trazer exames laboratoriais e descritivos.** O laboratório agora disponibiliza o laudo digital para download, e o resultado completo de um atendimento vem num único arquivo. Por isso a classificação é **por exame, não por documento**.

Proposta:

1. A extração da FASE 03 deixa de recusar o documento inteiro quando encontra um exame que não é laboratorial. Ela transcreve os exames laboratoriais e **lista os demais** (nome impresso, tipo e páginas), sem transcrevê-los. O ajuste no esquema está em [compliance.md](compliance.md#ajuste-por-laudo-misto).
2. Até esta fase ser implementada, os exames descritivos aparecem como "análise ainda não disponível para este tipo", e o documento fica guardado normalmente.
3. Nesta fase, o módulo `descriptive-report` lê somente as páginas listadas como descritivas.

Arquivos que trazem **só imagens** (ex.: a "série de impressão" do ultrassom) não são laudo. São guardados como anexo, sem análise.

## Esquema de extração proposto (`descriptive-report`)

Módulo próprio em `modules/descriptive-report/`, separado do `lab-report`, para que cada um seja testado isoladamente e o laboratorial não mude.

| Campo | Conteúdo |
| --- | --- |
| `exam_name` | Nome como impresso (ex.: "ULTRASSONOGRAFIA DO ABDOME TOTAL"). |
| `modality` | `ultrasound`, `xray`, `ct`, `mri`, `endoscopy`, `pathology`, `other`. |
| `region` | Região como impressa (ex.: "abdome total"); nulo se não houver. |
| `performed_at` | Data do exame impressa no laudo. |
| `laboratory`, `responsible` | Como no `lab-report` (nome e registro). |
| `findings[]` | `{ structure, text, page }`: o trecho do laudo sobre cada estrutura, **copiado literalmente**. |
| `measurements[]` | `{ structure, text, values[], unit, page }`: medidas impressas (ex.: "22 x 18 mm" → `[22, 18]`, `mm`). |
| `conclusion` | Impressão ou conclusão como impressa; nulo se não houver. |

**A IA só recorta e copia.** Ela não resume, não reescreve e não marca nada como "normal" ou "alterado". Classificar um achado já seria interpretar, e isso sai do nível A.

Em PDF com camada de texto, o código confere se cada trecho de `findings` e de `measurements` aparece literalmente na página indicada, como proposto para o laboratorial em [compliance.md](compliance.md#conferência-com-a-camada-de-texto-do-pdf-proposta). Aqui a conferência é ainda mais útil, porque o texto inteiro deve ser cópia literal.

## Comparação (nível A)

Diferente da comparação laboratorial, não há variação calculada nem faixa de referência:

- Os laudos do paciente são agrupados por **tipo de exame** (modalidade + região), não por analito.
- **Lado a lado por estrutura:** "Fígado" em cada data, com o texto de cada laudo, o laboratório e quem assinou.
- **Medidas** aparecem na linha do tempo de cada estrutura, **sem cálculo de variação**. Dizer se uma formação medida hoje é a mesma do exame anterior é julgamento clínico, e aparelho e examinador diferentes também mudam a medida.
- **Estrutura ausente:** "Vesícula biliar descrita em 10/03; não descrita no laudo atual" é um fato sobre o texto e pode ser mostrado.
- Sem pontos de atenção automáticos, porque não há referência impressa para comparar.

## Amostra 1 — ultrassonografia de abdome total

Recebida em 08/10/2026 em `tests/fixtures/private/`: laudo em PDF de 1 página, com camada de texto, e a série de imagens em um PDF separado. Dados pessoais e achados não são reproduzidos aqui.

Observações de estrutura:

1. Cabeçalho com protocolo, nome, nascimento, data e unidade.
2. Texto corrido, um parágrafo por estrutura (fígado, vias biliares, vesícula, pâncreas, veia porta, baço, rins, aorta, bexiga, cavidade peritoneal).
3. Medida no meio do texto, sem referência.
4. Trechos que registram limites do exame ("estudo prejudicado", "não visualizada em toda a sua extensão"). Eles precisam ser preservados na transcrição.
5. Informação relatada pelo paciente dentro do texto.
6. Sem seção de conclusão separada.
7. Assinatura eletrônica do médico, com CRM, e nota padrão do laboratório no rodapé.

A série de imagens não foi aberta nesta análise.

## Decisões

- [x] Dois tipos de laudo: laboratorial (paramétrico) e descritivo (08/10/2026).
- [x] Os laudos descritivos ficam numa fase própria, a FASE 05, depois da comparação laboratorial (08/10/2026).
- [x] Até lá, o app aceita o laudo descritivo, guarda o documento e mostra "análise ainda não disponível para este tipo" (08/10/2026).
- [x] O nome da categoria é "descritivo", não "imagem" (08/10/2026).
- [x] Laudo misto é comum; a classificação é por exame, não por documento (08/10/2026).
- [ ] Esquema de extração e módulo separado (proposta acima).
- [ ] Regras de comparação (proposta acima).
- [ ] Como alinhar estruturas com nomes diferentes entre laboratórios (ex.: "Rins" e "Rim direito / Rim esquerdo"). Adiada pelo usuário (08/10/2026).
- [ ] Tratamento da série de imagens: só anexo, ou exibida junto do laudo. Adiada pelo usuário (08/10/2026).
