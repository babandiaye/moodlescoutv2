import pino from 'pino'

/**
 * Logger structuré JSON pour la production.
 * En dev, formate avec pino-pretty pour la lisibilité.
 *
 * Usage :
 *   logger.info({ userId, action: 'audit_start' }, 'Audit lancé')
 *   logger.error({ err, sessionKey }, 'Échec analyse cours')
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  ...(process.env.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
  }),
  base: { app: 'moodlescoutv2' },
  // Champs sensibles toujours masqués dans les logs
  redact: [
    'req.headers.cookie',
    'req.headers.authorization',
    '*.password',
    '*.token',
    '*.tokenEnc',
    '*.apiKey',
    '*.apiKeyEnc',
    '*.secret',
    '*.client_secret',
  ],
})
