FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache gettext
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY public-config.template.js /usr/share/nginx/html/config.template.js
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["/docker-entrypoint.sh"]
