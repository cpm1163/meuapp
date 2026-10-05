// Validates a value against the JSON Schema subset accepted by structured outputs
// (type, enum, const, properties, required, additionalProperties: false, items, $ref to #/$defs, anyOf).
// Self-contained so it runs unchanged in the Edge Function (Deno) and in the Node tests.

export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  [keyword: string]: unknown;
};

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

const matchesType = (value: unknown, type: string) =>
  typeOf(value) === type || (type === 'number' && typeOf(value) === 'integer');

export function validateSchema(root: JsonSchema, value: unknown): string[] {
  const errors: string[] = [];
  const visit = (schema: JsonSchema, current: unknown, path: string) => {
    if (errors.length >= 20) return;
    if (schema.$ref) {
      const name = schema.$ref.replace('#/$defs/', '');
      const target = root.$defs?.[name];
      if (!target) { errors.push(`${path}: unknown $ref ${schema.$ref}`); return; }
      visit(target, current, path);
      return;
    }
    if (schema.anyOf) {
      if (!schema.anyOf.some(option => validateSchema({...root, ...option}, current).length === 0)) {
        errors.push(`${path}: no anyOf option matches`);
      }
      return;
    }
    if ('const' in schema && current !== schema.const) { errors.push(`${path}: expected ${JSON.stringify(schema.const)}`); return; }
    if (schema.enum && !schema.enum.includes(current)) { errors.push(`${path}: value not in enum`); return; }
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(type => matchesType(current, type))) { errors.push(`${path}: expected ${types.join('|')}`); return; }
    }
    if (typeOf(current) === 'object' && schema.properties) {
      const object = current as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in object)) errors.push(`${path}.${key}: required`);
      for (const key of Object.keys(object)) {
        const property = schema.properties[key];
        if (property) visit(property, object[key], `${path}.${key}`);
        else if (schema.additionalProperties === false) errors.push(`${path}.${key}: not allowed`);
      }
    }
    if (Array.isArray(current) && schema.items) current.forEach((item, index) => visit(schema.items as JsonSchema, item, `${path}[${index}]`));
  };
  visit(root, value, '$');
  return errors;
}
