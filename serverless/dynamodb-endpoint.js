'use strict';

module.exports = () => {
  // Check if we're running offline/locally
  if (process.env.IS_OFFLINE) {
    return {
      DYNAMODB_ENDPOINT: 'http://localhost:8000'
    };
  }
  // In production, return empty object as we'll use IAM roles
  return {};
}; 