const REDACTED = '[REDACTED]';

// Lightweight, best-effort masking. Goal: reduce accidental leakage to logs/storage,
// not perfect validation.
const apiKeyPatterns: RegExp[] = [
  // OpenAI-style keys
  /\bsk-[A-Za-z0-9]{32,}\b/g,
  // GitHub classic/pat tokens (common prefixes)
  /\bghp_[A-Za-z0-9]{36,}\b/g,
  /\bgho_[A-Za-z0-9]{36,}\b/g,
  /\bghs_[A-Za-z0-9]{36,}\b/g,
  /\bghu_[A-Za-z0-9]{36,}\b/g,
  /\bghr_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
];

const secretishKeyFragments = ['password', 'passwd', 'secret', 'token', 'api_key', 'apikey', 'api-key'] as const;

// Heuristic "KEY=VALUE" or "key: value" masking. We match broadly, then decide in callback
// whether the key is secret-ish to avoid brittle regex backtracking.
const assignmentPattern =
  /(^|\n)(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*([:=]\s*)(['"]?)([^\n'"]+)\5(?=\s*(?:\n|$))/gi;

// JSON/YAML-ish quoted keys: "token": "value"
const quotedSecretKeyPattern =
  /(["'](?:password|passwd|secret|token|api[_-]?key)["']\s*:\s*)(["'])([^"'\n\r]+)\2/gi;

export function maskSensitiveData(text: unknown): string {
  let input: string;

  if (typeof text === 'string') {
    input = text;
  } else {
    try {
      input = JSON.stringify(text);
    } catch {
      return String(text);
    }
  }

  let out = input;

  for (const re of apiKeyPatterns) {
    out = out.replace(re, REDACTED);
  }

  out = out.replace(
    quotedSecretKeyPattern,
    (_m: string, p1: string, p2: string) => `${p1}${p2}${REDACTED}${p2}`,
  );

  out = out.replace(
    assignmentPattern,
    (
      match: string,
      p1: string,
      p2: string,
      key: string,
      sep: string,
      quote: string,
      _value: string,
    ) => {
      const k = key.toLowerCase();
      const isSecretish = secretishKeyFragments.some((frag) => k.includes(frag.replace('-', '_')));
      if (!isSecretish) {
        return match;
      }
      return `${p1}${p2}${key}${sep}${quote}${REDACTED}${quote}`;
    },
  );

  return out;
}

