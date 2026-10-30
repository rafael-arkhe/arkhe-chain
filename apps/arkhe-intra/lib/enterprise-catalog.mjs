// Product proposals, not legal claims or enforced runtime policies.
const sectorRows = [
  ['generic', 'Genérico / Não classificado', [], 'A definir', 'A definir', 'A definir', 'Fluxo documental existente', null, []],
  ['finance', 'Financeiro / Bancário', ['64', '66'], '10 anos', 'HSM dedicado + e-CNPJ', '5 min', 'Acima de R$ 50 mil', 500, ['e_cnpj', 'bacen_audit', 'reconciliation', 'aml_check']],
  ['health', 'Saúde', ['86', '87', '88'], '20 anos', 'HSM + e-CPF profissional', '15 min', 'Todo documento clínico', 200, ['professional_review', 'patient_consent', 'anvisa_registration']],
  ['legal', 'Jurídico', ['69'], 'Processo + 5 anos', 'e-CPF', '15 min', 'Obrigatória', 100, ['oab_registration', 'e_cpf', 'professional_review', 'privilege_mark']],
  ['agribusiness', 'Agronegócio', ['01', '02', '03'], '10 anos', 'KMS + e-CNPJ', '1 hora', 'Exportação para a UE', 300, ['origin_certificate', 'eudr_compliance', 'mappa_registration']],
  ['manufacturing', 'Manufatura / Indústria', ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'], '5 anos', 'KMS compartilhado', '1 hora', 'Opcional', 1000, ['lot_traceability', 'iso_9001_record', 'quality_check']],
  ['government', 'Governo', ['84'], '10 anos', 'HSM dedicado + e-CNPJ', '5 min', 'Obrigatória', null, ['tcu_audit', 'lai_disclosure', 'licitacao_record']],
  ['technology', 'Tecnologia', ['62', '63'], '5 anos', 'KMS + e-CPF para PI', '1 hora', 'Opcional', 500, ['inventorship_attestation', 'copyright_disclosure', 'sbom_hash']],
  ['energy', 'Energia', ['35'], '10 anos', 'HSM dedicado', '15 min', 'Obrigatória', 5000, ['aneel_registration', 'credit_traceability', 'carbon_certificate']],
  ['construction', 'Construção', ['41', '42', '43'], '10 anos', 'e-CPF do engenheiro', '1 hora', 'Obrigatória', 200, ['crea_art', 'technical_responsibility', 'site_evidence']],
  ['education', 'Educação', ['85'], 'Permanente', 'KMS + e-CNPJ', '1 hora', 'Obrigatória', 2000, ['mec_diploma', 'academic_record', 'institutional_consent']],
  ['insurance', 'Seguros', ['65'], '10 anos', 'HSM dedicado', '5 min', 'Sinistros acima de R$ 10 mil', 5000, ['susep_policy', 'claim_evidence', 'underwriting_record']],
  ['retail', 'Varejo', ['47'], '5 anos', 'KMS compartilhado', '1 hora', 'Opcional', 1000, ['cdc_record', 'fiscal_invoice', 'product_traceability']],
];
export const sectors = sectorRows.map(([id, name, cnaePrefixes, retention, keys, batch, review, documentsPerMonth, evidence]) => ({ id, name, version: '0.2.0', cnaePrefixes, retention, keys, batch, review, documentsPerMonth, evidence, anchors: id === 'generic' ? 'A definir' : id === 'government' ? 'RBB' : 'RBB + Rekor', status: 'proposal' }));
const personaRows = [
  ['legal', 'Jurídico', 'Cadeia de custódia e dossiês', 'Selo de integridade', 'Cadeia de custódia', 'Impressão digital do documento', ['Ações pendentes', 'Dossiês publicados', 'Documentos disponíveis'], ['pdf', 'json']],
  ['finance', 'Financeiro', 'Reconciliação e fechamento', 'Raiz de reconciliação', 'Prova de reconciliação', 'Identificador de integridade', ['Pendências do período', 'Registros publicados', 'Documentos do período'], ['csv', 'xlsx']],
  ['compliance', 'Compliance', 'Políticas e evidências', 'Compromisso de integridade', 'Prova de inclusão', 'Hash da evidência', ['Ações pendentes', 'Evidências publicadas', 'Documentos disponíveis'], ['pdf', 'json']],
  ['engineering', 'Engenharia', 'Artefatos e execução', 'MMR root', 'MMR inclusion proof', 'Artifact digest', ['Ações pendentes', 'Registros publicados', 'Documentos disponíveis'], ['json', 'sarif']],
  ['ops', 'Operações', 'Pendências e continuidade', 'Checkpoint de integridade', 'Prova do registro', 'Digest do registro', ['Ações pendentes', 'Registros publicados', 'Registros operacionais'], ['json', 'csv']],
  ['executive', 'Executivo', 'Visão de governança', 'Compromisso de integridade', 'Evidência de inclusão', 'Identificador da evidência', ['Decisões pendentes', 'Documentos publicados', 'Base documental'], ['pdf', 'pptx']],
  ['audit', 'Auditoria', 'Testes e rastreabilidade', 'Raiz de integridade', 'Prova de inclusão', 'Hash do documento', ['Ações pendentes', 'Evidências publicadas', 'Documentos disponíveis'], ['pdf', 'xlsx']],
  ['legal-hr', 'RH / PI', 'Contribuições e autoria', 'Selo de integridade', 'Cadeia de contribuição', 'Impressão digital da contribuição', ['Ações pendentes', 'Registros publicados', 'Documentos disponíveis'], ['pdf', 'json']],
];
export const personas = personaRows.map(([id, name, description, root, proof, hash, widgets, preferredExports]) => ({ id, name, description, widgets, preferredExports, vocabulary: { 'mmr.root': root, 'mmr.proof': proof, 'evidence.hash': hash, 'anchor.rbb': 'Registro na RBB', 'anchor.rekor': 'Registro no log de transparência', 'operation.pending': 'Em processamento', 'operation.verified': 'Verificado' } }));
export const integrations = [{ id: 'sso', name: 'SSO corporativo' }, { id: 'sap', name: 'SAP / ERP' }, { id: 'oracle', name: 'Oracle' }, { id: 'teams', name: 'Microsoft Teams' }, { id: 'slack', name: 'Slack' }, { id: 'webhook', name: 'Webhook' }];
// Ordered contract: first matching prefix wins, independently of catalog display order.
export const CNAE_PRIORITY = Object.freeze([
  ['65', 'insurance'], ['64', 'finance'], ['66', 'finance'],
  ['86', 'health'], ['87', 'health'], ['88', 'health'], ['69', 'legal'],
  ['01', 'agribusiness'], ['02', 'agribusiness'], ['03', 'agribusiness'],
  ['10', 'manufacturing'], ['11', 'manufacturing'], ['12', 'manufacturing'],
  ['13', 'manufacturing'], ['14', 'manufacturing'], ['15', 'manufacturing'],
  ['16', 'manufacturing'], ['17', 'manufacturing'], ['18', 'manufacturing'],
  ['19', 'manufacturing'], ['20', 'manufacturing'], ['21', 'manufacturing'],
  ['22', 'manufacturing'], ['23', 'manufacturing'], ['24', 'manufacturing'],
  ['25', 'manufacturing'], ['26', 'manufacturing'], ['27', 'manufacturing'],
  ['28', 'manufacturing'], ['29', 'manufacturing'], ['30', 'manufacturing'],
  ['31', 'manufacturing'], ['32', 'manufacturing'], ['33', 'manufacturing'],
  ['84', 'government'], ['62', 'technology'], ['63', 'technology'], ['35', 'energy'],
  ['41', 'construction'], ['42', 'construction'], ['43', 'construction'],
  ['85', 'education'], ['47', 'retail'],
].map(([prefix, sectorId]) => Object.freeze({ prefix, sectorId })));
export function resolveSector(cnae, rules) {
  const digits = String(cnae || '').replace(/\D/g, '');
  return rules.find(rule => digits.startsWith(rule.prefix))?.sectorId || 'generic';
}
export function suggestSector(cnae) { return resolveSector(cnae, CNAE_PRIORITY); }
