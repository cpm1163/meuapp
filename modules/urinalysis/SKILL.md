---
name: exame-de-urina
description: Regras para transcrever exames de urina de laudos laboratoriais brasileiros no esquema lab-report - urina tipo 1, EAS, exame de urina de rotina, sedimento, relação albumina/creatinina (albuminúria) e dosagens em urina isolada ou de 24 horas. Use sempre que o documento tiver exame de urina.
---

# Exame de urina

Complementa as instruções gerais de transcrição. Continue só transcrevendo: não classifique e não converta. Todos os parâmetros de urina ficam com `code` null.

## Exame físico e químico (urina tipo 1, EAS, rotina)

- Parâmetros em palavras (cor, aspecto, proteína, glicose, corpos cetônicos, bilirrubina, urobilinogênio, nitrito, hemoglobina, leucócito-esterase): `value_kind` "qualitative", `value_number` null, `value_text` exatamente como impresso.
- Resultados em cruzes ou traços ("+", "++", "+++", "Traços", "1+"): também "qualitative", transcritos como impressos.
- Referência em palavras: `kind` "qualitative", com os valores esperados em `expected`.
  - Um valor só ("Ausente", "Negativo"): `expected` = ["Ausente"].
  - Uma faixa de palavras ("Límpido a Ligeiramente Turva", "Amarelo Claro ao Amarelo"): `expected` com **as duas pontas**, como impressas: ["Límpido", "Ligeiramente Turva"]. Não liste palavras intermediárias que não estão impressas.
- Resultado que é número com unidade de tira reagente ("Proteína 30 mg/dL", "Glicose 100 mg/dL"): "numeric".

## Densidade e pH

- **Densidade é decimal, mesmo escrita com ponto.** "1.022" = 1.022 (um vírgula zero vinte e dois), nunca 1022. O mesmo vale para a referência: "1.010 a 1.025" → low 1.01, high 1.025. Esta é a exceção à regra brasileira do ponto como milhar.
- pH: "5,0" = 5.0; referência "5,0 a 7,0" → range.

## Sedimento

- Contagens automatizadas ("8 /µL", "8 µL", "8/mL") e contagens por campo ("3 a 5 por campo", "raros", "numerosos") são formas diferentes. Transcreva como impressas e não converta uma na outra.
- Contagem com número: "numeric", com a unidade impressa (mesmo que sem a barra, como "µL"). Contagem por faixa ("3 a 5 por campo"): "qualitative", com `value_text` como impresso.
- Elementos em palavras (cilindros, cristais, bactérias, muco, leveduras: "Ausente", "Raros", "Presentes"): "qualitative".
- Referência por sexo, mesmo indicada como "confira na tabela abaixo" (ex.: hemácias "Masculino: 0 a 16; Feminino: 0 a 27"): `kind` "table_by_demographics", com uma linha por sexo em `rows`. Não escolha a linha do paciente.

## Relação albumina/creatinina e dosagens urinárias

- A relação albumina/creatinina costuma vir com tabela por categoria (A1, A2, A3 ou "normal", "moderadamente aumentada", "severamente aumentada"): `kind` "table_by_clinical_category", com uma linha por categoria em `rows`, respeitando "inferior a" e "superior a" em `low_inclusive` e `high_inclusive`.
- Albumina e creatinina urinárias que aparecem como componentes do cálculo, sem referência: parâmetros com `kind` "none".
- "Intervalo de referência não estabelecido na literatura": `kind` "none", com o texto em `text`.
- **A mesma dosagem pode aparecer duas vezes, em unidades diferentes** (ex.: creatinina urinária "1,95 g/L" dentro da albuminúria e "195,00 mg/dL" como exame próprio). Transcreva as duas, cada uma no seu exame, como impressas. Não junte nem escolha uma.
- Urina de 24 horas: transcreva também o volume urinário, se impresso, como parâmetro próprio.

## Material e método

- Material como impresso, incluindo o tipo de coleta: "Urina - jato médio", "Urina - amostra isolada", "Urina de 24 horas".
- Métodos impressos para o exame inteiro (ex.: "Elementos Anormais - Leitura Automatizada de Tiras Reagentes. Sedimento - Automatizado por Citometria de Fluxo") vão em `method`.

## Marcação do laboratório (`lab_flag`)

- Conta como marcação um sinal que indique a situação: ícone, seta, asterisco ou palavra. Alguns laboratórios põem o ícone de "dentro" também em resultados em palavras: nesse caso, "within".
- Cor sozinha, sem ícone, não conta: `lab_flag` "none".

## Notas e bibliografia

- Notas técnicas vão em `lab_notes` (ex.: mudança de unidade, variação da concentração ao longo do dia, nota sobre a nova nomenclatura de albuminúria).
- Referências bibliográficas (ex.: diretriz KDIGO citada pelo laboratório) não entram em `lab_notes`.
- Urocultura e antibiograma ainda não são cobertos por esta skill.
