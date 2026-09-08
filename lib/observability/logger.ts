type OperationalLevel = 'info' | 'warn' | 'error';
type OperationalValue = string | number | boolean | null | undefined;
type OperationalFields = Record<string, OperationalValue>;

/** Logs only explicitly supplied operational metadata; never serialize errors, tokens, or request bodies. */
export function logOperational(level: OperationalLevel, event: string, fields: OperationalFields = {}) {
  const payload = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  const line = JSON.stringify({ timestamp: new Date().toISOString(), service: 'savi', level, event, ...payload });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
