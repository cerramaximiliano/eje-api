const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { logger } = require('./pino');

/**
 * Secret compartido del ecosistema. Mismo ARN que usan law-analytics-server,
 * pjsalta-api, pjcatamarca-api y pjmendoza-api.
 */
const DEFAULT_SECRET_ARN = 'arn:aws:secretsmanager:sa-east-1:244807945617:secret:env-8tdon8';

const client = new SecretsManagerClient({ region: 'sa-east-1' });

/**
 * Trae los secretos como string KEY=VALUE (formato .env), igual que
 * law-analytics-server y las APIs hermanas. El caller lo vuelca a `.env` y
 * recarga dotenv con override, de modo que AWS es la fuente de verdad.
 *
 * Fail-closed: si AWS no responde, el proceso NO arranca. Antes esto se
 * tragaba el error y seguía con el .env local, lo que dejaba a eje-api
 * corriendo con credenciales que nadie podía auditar ni rotar centralmente.
 * `ALLOW_LOCAL_ENV=true` es el escape para desarrollo local.
 *
 * @param {string} [secretName] - Override del secret a leer.
 * @returns {Promise<string>} Contenido para el .env, o '' si se permite fallback.
 */
async function retrieveSecrets(secretName) {
  const secretId = secretName || process.env.AWS_SECRET_ARN || DEFAULT_SECRET_ARN;

  try {
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

    if (!response.SecretString) {
      throw new Error('El secret ' + secretId + ' no tiene SecretString');
    }

    const secret = JSON.parse(response.SecretString);
    const claves = Object.keys(secret);

    if (!claves.length) {
      throw new Error('El secret ' + secretId + ' vino vacío');
    }

    logger.info('Credenciales recuperadas de AWS Secrets Manager: ' + claves.length + ' claves');

    return claves.map((key) => `${key}=${secret[key]}`).join('\n');
  } catch (error) {
    logger.error('Error recuperando secretos desde AWS (' + secretId + '): ' + error.message);

    if (process.env.ALLOW_LOCAL_ENV === 'true') {
      logger.warn('ALLOW_LOCAL_ENV=true → se continúa con el .env local');
      return '';
    }

    throw error;
  }
}

module.exports = { retrieveSecrets };
