import Langfuse from 'langfuse';

let _instance: Langfuse | null = null;

export function isLangfuseEnabled(): boolean {
  return process.env.LANGFUSE_ENABLED === 'true';
}

export function getLangfuse(): Langfuse {
  if (!_instance) {
    _instance = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
      enabled: isLangfuseEnabled(),
    });
  }
  return _instance;
}
