const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: 'sa-east-1' });

/**
 * Retrieves secrets from AWS Secrets Manager
 * @param {string} secretName - Name of the secret to retrieve
 * @returns {Promise<string>} - Environment variables as formatted string
 */
async function getSecrets(secretName = 'eje-api-secrets') {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      return Object.entries(secrets)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    }

    return '';
  } catch (error) {
    console.error('Error retrieving secrets from AWS:', error.message);
    return '';
  }
}

/**
 * Load secrets into process.env
 * @param {string} secretName - Name of the secret to retrieve
 */
async function loadSecrets(secretName = 'eje-api-secrets') {
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      Object.entries(secrets).forEach(([key, value]) => {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
    }
  } catch (error) {
    console.error('Error loading secrets from AWS:', error.message);
  }
}

module.exports = { getSecrets, loadSecrets };
