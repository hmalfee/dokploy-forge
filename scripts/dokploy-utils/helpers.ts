export interface Schema {
  domain?: string;
  [k: string]: any;
}

export function processValue(
  value: string,
  variables: Record<string, string>,
  schema: Schema = {},
): string {
  if (!value) return value;

  let processedValue = value.replace(/\${([^}]+)}/g, (match, varName) => {
    if (varName === "domain") return schema.domain || "app-random.example.com";
    if (varName === "randomPort") return "8080";
    if (varName === "password") return "password123";
    if (varName.startsWith("password:")) return "password123";
    if (varName === "base64") return "base64string==";
    if (varName.startsWith("base64:")) return "base64string==";
    if (varName === "hash") return "hash123";
    if (varName.startsWith("hash:")) return "hash123";
    if (varName === "uuid") return "00000000-0000-0000-0000-000000000000";
    if (varName === "timestamp" || varName === "timestampms")
      return "1234567890";
    if (varName === "timestamps") return "123456";
    if (varName === "jwt") return "eyJ.eyJ.signature";
    if (varName.startsWith("jwt:")) return "eyJ.eyJ.signature";

    return variables[varName] || match;
  });

  processedValue = processedValue.replace(/\${([^}]+)}/g, (match, varName) => {
    return variables[varName] || match;
  });

  return processedValue;
}

export function processVariables(
  variables: Record<string, string>,
  schema: Schema = {},
): Record<string, string> {
  const processed: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value !== "string") continue;
    if (value === "${domain}") {
      processed[key] = schema.domain || "app-random.example.com";
    } else {
      processed[key] = value; // Real implementation handles generating hashes, base64 etc. initially, but for validation this is enough.
    }
  }

  for (const [key, value] of Object.entries(processed)) {
    processed[key] = processValue(value, processed, schema);
  }

  return processed;
}
