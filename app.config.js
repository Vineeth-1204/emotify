module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ||
        config.android?.googleServicesFile ||
        './android/app/google-services.json',
    },
  };
};
