// Deliberately limited profile: a flat object of string/integer/number fields.
// Unknown schema keywords fail closed instead of being silently ignored.
export function matchesOutputSchema(value, schema) {
  if (!schema || schema.type !== 'object' || schema.additionalProperties !== false ||
      !Array.isArray(schema.required) || !schema.properties ||
      Object.keys(schema).some(key => !['type', 'required', 'properties', 'additionalProperties'].includes(key))) return false;
  const properties = schema.properties;
  if (typeof properties !== 'object' || Array.isArray(properties)) return false;
  for (const rule of Object.values(properties)) {
    if (!rule || !['string', 'integer', 'number'].includes(rule.type) ||
        Object.keys(rule).some(key => !['type', 'minimum'].includes(key)) ||
        (Object.hasOwn(rule, 'minimum') &&
          (rule.type === 'string' || !Number.isFinite(rule.minimum) ||
            (rule.type === 'integer' && !Number.isSafeInteger(rule.minimum))))) return false;
  }
  if (!schema.required.every(key => typeof key === 'string' && Object.hasOwn(properties, key))) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!schema.required.every(key => Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !Object.hasOwn(properties, key))) return false;
  return Object.entries(properties).every(([key, rule]) => {
    if (!Object.hasOwn(value, key)) return true;
    if (rule.type === 'string') return typeof value[key] === 'string';
    if (rule.type === 'number') return Number.isFinite(value[key]) &&
      (!Object.hasOwn(rule, 'minimum') || value[key] >= rule.minimum);
    return Number.isSafeInteger(value[key]) && (!Object.hasOwn(rule, 'minimum') || value[key] >= rule.minimum);
  });
}
