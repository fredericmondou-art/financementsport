/**
 * Logger structuré minimal.
 *
 * Règle du projet : pas de `console.log` en production. On centralise ici
 * tous les points de sortie, sous forme de JSON structuré (niveau, message,
 * contexte, timestamp), pour faciliter l'ingestion par un futur agrégateur
 * de logs (ex: Vercel Log Drains).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function write(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    // eslint-disable-next-line no-console
    console.error(line);
    return;
  }

  // eslint-disable-next-line no-console
  console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext) => write('error', message, context),
};
