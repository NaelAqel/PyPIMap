FROM docker.io/library/node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Expose the Vite dev port
EXPOSE 3000

# Streamline the entry point to run the dev server and bind to all hosts
CMD ["npm", "run", "dev", "--", "--host"]