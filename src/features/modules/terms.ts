// Provisional text. The final terms need legal review (health data of third parties, AI provider).
// The accepted version is always the module's terms_version stored in the database.
export const MODULE_TERMS_DRAFT: Record<string, string[]> = {
  'lab-report': [
    'RASCUNHO — texto provisório, sujeito a revisão jurídica.',
    'Os documentos enviados para análise são transmitidos a um provedor de inteligência artificial externo para extração dos dados.',
    'A análise organiza informações já presentes no laudo e não contém interpretação clínica, diagnóstico ou recomendação de conduta.',
    'Você é responsável por ter base legal para tratar os dados de saúde de terceiros que carregar no app.',
    'As análises ficam visíveis apenas para você. Compartilhá-las com outras pessoas é uma decisão sua.',
  ],
  'patient-records': [
    'RASCUNHO — texto provisório, sujeito a revisão jurídica.',
    'Você cadastra pacientes e vincula a eles os documentos que enviar. O cadastro guarda nome e, se você quiser, CPF, data de nascimento e sexo.',
    'Os cadastros ficam visíveis apenas para você. Quem recebe um documento compartilhado não vê o paciente a que ele está vinculado.',
    'Você é responsável por ter base legal para tratar os dados pessoais e de saúde dos pacientes que cadastrar.',
    'Se a liberação vencer, você continua vendo, corrigindo e excluindo os cadastros, mas não cria pacientes novos nem vincula documentos.',
  ],
};
