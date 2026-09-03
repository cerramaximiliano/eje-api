const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { logger } = require('./pino');

const client = new SecretsManagerClient({ region: 'sa-east-1' });

/**
 * Secret compartido del ecosistema. Mismo ARN que usan law-analytics-server,
 * pjsalta-api, pjcatamarca-api y pjmendoza-api. Antes acá había un default
 * 'eje-api-secrets' que no existe: cada arranque tiraba un ResourceNotFound
 * al error log de PM2 e inflaba el ratio de error del monitoreo.
 */
const DEFAULT_SECRET_ARN = 'arn:aws:secretsmanager:sa-east-1:244807945617:secret:env-8tdon8';

/**
 * Únicas claves que eje-api toma del secret compartido, derivadas de las
 * process.env que realmente lee el código. El secret trae ~112 claves de todo
 * el ecosistema (Stripe, OpenAI, tokens de Telegram, passwords de rs0...);
 * inyectarlas enteras metería credenciales ajenas en el process.env de una API
 * expuesta a internet sin que ninguna se use. Si el código empieza a leer una
 * variable nueva, agregarla acá.
 */
const CLAVES_RELEVANTES = [
  'API_KEY',
  'AWS_SES_ACCESS_KEY',
  'AWS_SES_KEY_ID',
  'JWT_SECRET',
  'LOG_LEVEL',
  'SEED',
  'UPDATE_THRESHOLD_HOURS',
  'URLDB',
  'URLDB_LOCAL',
];

/**
 * Claves cuya sustitución silenciosa sería peligrosa: si alguna se toma del
 * secret compartido en vez del .env local, eje-api podría terminar hablándole
 * a otra base o validando JWT con otra firma. Se loguean explícitamente.
 */
const CLAVES_CRITICAS = ['URLDB', 'JWT_SECRET', 'SEED', 'API_KEY'];

function resolveSecretId(secretName) {
  return secretName || process.env.AWS_SECRET_ARN || DEFAULT_SECRET_ARN;
}

async function fetchSecret(secretId) {
  const command = new GetSecretValueCommand({ SecretId: secretId });
  const response = await client.send(command);
  return response.SecretString ? JSON.parse(response.SecretString) : null;
}

/**
 * Devuelve los secretos como string KEY=VALUE (formato .env).
 * @param {string} [secretName] - Override del secret a leer.
 * @returns {Promise<string>}
 */
async function getSecrets(secretName) {
  const secretId = resolveSecretId(secretName);
  try {
    const secrets = await fetchSecret(secretId);
    if (!secrets) return '';
    return Object.entries(secrets)
      .filter(([key]) => CLAVES_RELEVANTES.includes(key))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  } catch (error) {
    logger.warn('No se pudieron recuperar secretos de AWS: ' + error.message);
    return '';
  }
}

/**
 * Carga secretos en process.env COMPLETANDO lo que falte.
 *
 * A diferencia de las APIs hermanas (que sobreescriben .env con el contenido
 * del secret), acá el .env local GANA: es la fuente de verdad de eje-api y
 * tiene valores propios (URLDB de causaseje, API_KEY del M2M con el hub) que
 * no necesariamente coinciden con los del secret compartido. AWS solo rellena
 * huecos, y si rellena alguna clave crítica lo avisa.
 *
 * @param {string} [secretName] - Override del secret a leer.
 */
async function loadSecrets(secretName) {
  const secretId = resolveSecretId(secretName);
  try {
    const secrets = await fetchSecret(secretId);
    if (!secrets) {
      logger.warn('El secret ' + secretId + ' no trajo SecretString; se sigue con .env local');
      return;
    }

    const aplicadas = [];
    Object.entries(secrets).forEach(([key, value]) => {
      if (!CLAVES_RELEVANTES.includes(key)) return;
      if (!process.env[key]) {
        process.env[key] = value;
        aplicadas.push(key);
      }
    });

    const criticas = aplicadas.filter((k) => {
      // SEED solo se usa como fallback de JWT_SECRET (auth.js: JWT_SECRET || SEED).
      // Si JWT_SECRET está definido, que SEED venga de AWS es irrelevante.
      if (k === 'SEED') return !process.env.JWT_SECRET;
      return CLAVES_CRITICAS.includes(k);
    });
    if (criticas.length) {
      logger.warn(
        'Claves CRÍTICAS tomadas del secret compartido porque faltan en .env: ' +
        criticas.join(', ') + ' — verificar que apunten al entorno correcto'
      );
    }
    logger.info(
      'Secrets AWS: ' + aplicadas.length + ' de ' + CLAVES_RELEVANTES.length +
      ' clave(s) relevantes completadas desde el secret compartido' +
      (aplicadas.length ? ': ' + aplicadas.join(', ') : ' (el .env local ya cubre todo lo necesario)')
    );
  } catch (error) {
    // No es fatal: eje-api corre enteramente de /var/www/eje-api/.env.
    logger.warn(
      'No se pudieron cargar secretos de AWS (' + secretId + '): ' + error.message +
      '. Se continúa con .env local.'
    );
  }
}

module.exports = { getSecrets, loadSecrets };
