#!/bin/sh
set -eu

envsubst '$VITE_AWS_REGION $VITE_COGNITO_DOMAIN $VITE_COGNITO_CLIENT_ID $VITE_COGNITO_USER_POOL_ID $VITE_COGNITO_REDIRECT_URI $VITE_COGNITO_LOGOUT_URI' \
  < /usr/share/nginx/html/config.template.js \
  > /usr/share/nginx/html/config.js

exec nginx -g 'daemon off;'
