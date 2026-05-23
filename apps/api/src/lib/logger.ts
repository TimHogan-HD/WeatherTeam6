import pino from 'pino';

const envLevel = process.env.LOG_LEVEL;
const level =
  envLevel !== undefined && envLevel !== ''
    ? envLevel
    : process.env.NODE_ENV === 'production'
      ? 'info'
      : 'debug';

export const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.apiKey',
      'req.body.api_key',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
});
