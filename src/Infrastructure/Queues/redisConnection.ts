// eslint-disable-next-line @typescript-eslint/no-var-requires
const IORedis = require('ioredis');

let connection: any | null = null;

export function getRedisConnection(): any {
    if (connection) return connection;

    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD;

    if (!host) {
        throw new Error('REDIS_HOST is required');
    }

    // IMPORTANT:
    // Do NOT auto-enable TLS based on hostname. Some managed Redis providers expose
    // different ports for TLS vs non-TLS; forcing TLS on the wrong port causes:
    // ERR_SSL_WRONG_VERSION_NUMBER
    const useTls = String(process.env.REDIS_TLS || '').toLowerCase() === 'true';

    connection = new IORedis({
        host,
        port,
        password: password || undefined,
        tls: useTls ? { servername: host } : undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: true
    });

    return connection;
}

