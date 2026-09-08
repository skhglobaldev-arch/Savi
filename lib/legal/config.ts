export type LegalConfiguration = {
  operatorName: string;
  contactEmail: string;
  businessAddress: string;
  governingLaw: string;
  effectiveDate: string;
  operatorDetailsReady: boolean;
};

const REQUIRED_PLACEHOLDERS = {
  operatorName: '[Legal operator name required before launch]',
  contactEmail: '[Privacy contact email required before launch]',
  businessAddress: '[Business address required before launch]',
  governingLaw: '[Governing jurisdiction required before launch]',
  effectiveDate: '[Effective date required before launch]'
} as const;

function configured(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

export function getLegalConfiguration(): LegalConfiguration {
  const operatorName = configured('SAVI_LEGAL_OPERATOR_NAME', REQUIRED_PLACEHOLDERS.operatorName);
  const contactEmail = configured('SAVI_LEGAL_CONTACT_EMAIL', REQUIRED_PLACEHOLDERS.contactEmail);
  const businessAddress = configured('SAVI_LEGAL_BUSINESS_ADDRESS', REQUIRED_PLACEHOLDERS.businessAddress);
  const governingLaw = configured('SAVI_LEGAL_GOVERNING_LAW', REQUIRED_PLACEHOLDERS.governingLaw);
  const effectiveDate = configured('SAVI_LEGAL_EFFECTIVE_DATE', REQUIRED_PLACEHOLDERS.effectiveDate);

  return {
    operatorName,
    contactEmail,
    businessAddress,
    governingLaw,
    effectiveDate,
    operatorDetailsReady: ![operatorName, contactEmail, businessAddress, governingLaw, effectiveDate].some((value) => value.startsWith('['))
  };
}

