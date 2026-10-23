-- Clinical considerations (level B, docs/clinical-considerations.md): built in the app from the stored extraction and the
-- curated statements, no new AI call. 'testing' shows them only to accounts with an active grant and accepted terms.
insert into public.analysis_modules(id, name, description, level, terms_version, status) values
  ('clinical-considerations', 'Considerações clínicas',
   'Compara os valores do laudo com diretrizes selecionadas, pela idade e pelo sexo, citando a fonte. Em teste; bibliografia ainda não validada por médico.',
   'B', '2026-10-23-draft', 'testing');
