---
name: hemograma
description: Regras para transcrever hemograma (eritrograma, leucograma e plaquetas) de laudos laboratoriais brasileiros no esquema lab-report. Use sempre que o documento tiver hemograma, hemograma completo, eritrograma, leucograma ou contagem de plaquetas.
---

# Hemograma

Complementa as instruções gerais de transcrição. Continue só transcrevendo: não calcule, não classifique e não corrija valores. As contas de consistência (VCM, HCM, CHCM, soma do diferencial e absolutos) são feitas depois, pelo código, a partir do que você transcrever. Por isso cada número precisa sair exatamente como impresso.

## Códigos (`code`)

Preencha `code` só com estes valores. Qualquer outro parâmetro do hemograma fica com `code` null.

| Impresso como (exemplos) | `code` |
| --- | --- |
| Eritrócitos, Hemácias, Glóbulos vermelhos | `rbc` |
| Hemoglobina | `hemoglobin` |
| Hematócrito | `hematocrit` |
| VCM, Volume corpuscular médio | `mcv` |
| HCM, Hemoglobina corpuscular média | `mch` |
| CHCM, Concentração de hemoglobina corpuscular média | `mchc` |
| RDW | `rdw` |
| Leucócitos, Glóbulos brancos (contagem total) | `wbc` |
| Neutrófilos (total) | `neutrophils_pct` / `neutrophils_abs` |
| Linfócitos | `lymphocytes_pct` / `lymphocytes_abs` |
| Monócitos | `monocytes_pct` / `monocytes_abs` |
| Eosinófilos | `eosinophils_pct` / `eosinophils_abs` |
| Basófilos | `basophils_pct` / `basophils_abs` |
| Plaquetas, Contagem de plaquetas | `platelets` |

Ficam com `code` null, entre outros: VPM, PDW, plaquetócrito, bastonetes, segmentados, metamielócitos, mielócitos, promielócitos, blastos, linfócitos atípicos, eritroblastos e reticulócitos.

## Diferencial leucocitário

- Percentual e absoluto são **dois parâmetros separados**, cada um com seu valor, unidade, referência e marcação.
- Use `neutrophils_*` só para a linha de **neutrófilos totais**. Se o laudo mostrar bastonetes e segmentados com uma linha de neutrófilos, transcreva os três: o total com `code`, os outros dois com `code` null. Se mostrar só bastonetes e segmentados, sem total, os dois ficam com `code` null. Não some.
- Linha de leucócitos com "100 %" (e referência "100 %"): não é parâmetro. Transcreva só a contagem total, com `code` `wbc`.

## Números e unidades

- Formato brasileiro: ponto separa milhar e vírgula separa decimal. "10.810 /µL" = 10810; "258.000 /µL" = 258000; "5,44" = 5.44.
- Contagens escritas em potência ou milhares: transcreva o número como impresso e a unidade como impressa. "5,44 10^6/µL" → 5.44 com unidade "10^6/µL"; "7,8 mil/mm³" → 7.8 com unidade "mil/mm³". Não converta unidades.
- `/mm³` e `/µL` são a mesma grandeza, mas transcreva a unidade exatamente como impressa.

## Marcação do laboratório (`lab_flag`)

- Conta como marcação um sinal que indique a direção: ícone, seta, asterisco ou a palavra "alto"/"baixo".
- Cor sozinha, sem ícone, não indica direção: `lab_flag` "none".
- Muitos laudos marcam o absoluto e deixam o percentual só colorido. Cada um recebe a sua própria marcação.

## Referências

- Hemograma pediátrico e de adultos costuma trazer tabelas por idade e sexo: use `table_by_demographics` e transcreva todas as linhas, sem escolher a do paciente.
- Referência dupla na mesma linha (percentual e absoluto): cada uma vai para o seu parâmetro.

## Notas e bibliografia

- Notas técnicas do hemograma vão em `lab_notes` (ex.: "diferencial liberado por automação", "confirmado em lâmina", "amostra lipêmica").
- Listas de "Fontes" ou referências bibliográficas não entram em `lab_notes`.
- Comentários morfológicos ("anisocitose discreta", "plaquetas gigantes") são notas do laboratório: vão em `lab_notes`, como impressos.
