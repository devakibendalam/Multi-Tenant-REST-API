FROM node:24-alpine

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for development)
RUN npm install

# Copy prisma schema so we can generate the client
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the source code
# In development, this layer is overridden by the volume mount
COPY . .

# Copy and set permissions for entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Use entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]

# Default command for development (uses nodemon for hot reload)
CMD ["npm", "run", "dev"]