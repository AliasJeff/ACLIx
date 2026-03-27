export class AclixError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConfigError extends AclixError {
  constructor(message: string) {
    super('CONFIG_ERROR', message);
  }
}

export class LLMError extends AclixError {
  constructor(message: string) {
    super('LLM_ERROR', message);
  }
}

export class SecurityError extends AclixError {
  constructor(message: string) {
    super('SECURITY_ERROR', message);
  }
}
