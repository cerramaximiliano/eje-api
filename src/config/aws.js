const { SESClient } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_SES_KEY_ID,
    secretAccessKey: process.env.AWS_SES_ACCESS_KEY
  }
});

module.exports = { sesClient };
