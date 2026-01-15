import { EnvironmentConfig } from '../Config/EnvironmentConfig';
import fs from 'fs';

type Environment = 'development' | 'test' | 'production';

interface SSLConfig {
  rejectUnauthorized: boolean;
  ca?: string;
  key?: string;
  cert?: string;
  sslmode?: string;
}

interface DatabaseConfig {
  connectionString?: string;
  user: string;
  password: string;
  host: string;
  port: number;
  database: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number; 
  ssl: SSLConfig | boolean; 
}

const getSSLConfig = (env: Environment, isRemote: boolean = false): SSLConfig | boolean => {
  console.log("getSSLConfig called with env: ", env, "isRemote: ", isRemote);
  switch (env) {
    case 'production':
      return {
        rejectUnauthorized: false,
        sslmode: 'require',
        // rejectUnauthorized: true,
        // sslmode: 'verify-full',
        ca: EnvironmentConfig.get('SSL_CA') ? fs.readFileSync(EnvironmentConfig.get('SSL_CA')).toString() : undefined,
        key: EnvironmentConfig.get('SSL_KEY') ? fs.readFileSync(EnvironmentConfig.get('SSL_KEY')).toString() : undefined,
        cert: EnvironmentConfig.get('SSL_CERT') ? fs.readFileSync(EnvironmentConfig.get('SSL_CERT')).toString() : undefined,
      };
    case 'test':
      // Enable SSL for remote databases in test environment too
      if (isRemote) { 
        return {
          rejectUnauthorized: false
        };
      }
      return false;
    case 'development':
      // Enable SSL for remote databases (like Supabase)
      if (isRemote) {
        return {
          rejectUnauthorized: false
        };
      }
      return false;
    default:
      return false;
  }
}; 

export const getDatabaseConfig = (): DatabaseConfig => {
  const nodeEnv = (EnvironmentConfig.get('NODE_ENV', 'test')) as Environment;
  
  // Check if DATABASE_URL is provided
  const databaseUrl = EnvironmentConfig.get('DATABASE_URL'); 
  
  if (databaseUrl) {
    // Parse the connection string
    const url = new URL(databaseUrl);
    const isRemote = url.hostname !== 'localhost' && !url.hostname.includes('127.0.0.1');
    
    // Remove any existing sslmode from URL - we'll use SSL config object instead
    // This ensures rejectUnauthorized: false is properly applied
    // Reconstruct connection string without sslmode parameter
    const password = url.password ? `:${url.password}` : '';
    const userPart = url.username ? `${url.username}${password}@` : '';
    const portPart = url.port ? `:${url.port}` : '';
    const dbName = url.pathname.slice(1) || 'postgres';
    const connectionString = `postgresql://${userPart}${url.hostname}${portPart}/${dbName}`;
    
    const config: DatabaseConfig = {
      connectionString: connectionString,
      user: url.username || 'postgres',
      password: url.password || '',
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      database: dbName,
      max: EnvironmentConfig.getNumber('DB_POOL_MAX', 5),
      idleTimeoutMillis: EnvironmentConfig.getNumber('DB_IDLE_TIMEOUT', 20000),
      connectionTimeoutMillis: EnvironmentConfig.getNumber('DB_CONNECTION_TIMEOUT', 8000),
      ssl: getSSLConfig(nodeEnv, isRemote)
    };
    
    console.log("DatabaseConfig: Using DATABASE_URL connection string");
    console.log("DatabaseConfig: Hostname:", url.hostname);
    console.log("DatabaseConfig: SSL config:", JSON.stringify(config.ssl));
    console.log("DatabaseConfig: Connection string (masked):", connectionString.replace(/:[^:@]+@/, ':****@'));
    return config;
  }
  
  // Fallback to individual environment variables
  const dbHost = EnvironmentConfig.get('DB_HOST');
  const isRemote = !!(dbHost && dbHost !== 'localhost' && !dbHost.includes('127.0.0.1'));
  
  console.log("DatabaseConfig nodeEnv: ", nodeEnv);
  const config: DatabaseConfig = {
    user: EnvironmentConfig.get('DB_USER', 'postgres'),
    password: EnvironmentConfig.get('DB_PASSWORD', ''),
    host: (!dbHost && nodeEnv === 'development')
      ? 'localhost'
      : (dbHost || ''),
    port: EnvironmentConfig.getNumber('DB_PORT', 5432),
    database: EnvironmentConfig.get('DB_NAME', 'postgres'),
    max: EnvironmentConfig.getNumber('DB_POOL_MAX', 5), // Conservative pool size for free-tier RDS
    idleTimeoutMillis: EnvironmentConfig.getNumber('DB_IDLE_TIMEOUT', 20000), // 10 seconds idle timeout
    connectionTimeoutMillis: EnvironmentConfig.getNumber('DB_CONNECTION_TIMEOUT', 8000), // 8 seconds connection timeout
    ssl: getSSLConfig(nodeEnv, isRemote)
  };

  // Build connection string for non-local environments
  if (nodeEnv !== 'development' || isRemote) {
    const sslMode = nodeEnv === 'production' ? 'verify-full' : 'prefer';
    console.log("sslMode: ", sslMode);
    config.connectionString = `postgresql://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;
    // ?sslmode=${sslMode}`;
  }

  return config;
};