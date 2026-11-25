# ---- Build stage ----
FROM node:26@sha256:e18c3ccdf7d71619990b0e85639f506e2028a95410999cab24cc373cbd10e0ac AS build

# Set working directory
WORKDIR /frontend

# Copy package.json and package-lock.json and install Node.js dependencies
COPY package*.json ./
RUN npm ci

# Copy your React project code
COPY . .

# Build-time API and connector settings, explicitly exposed by Vite.
ARG VITE_MCP_ENABLED=1
ENV VITE_MCP_ENABLED=$VITE_MCP_ENABLED
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build optimized React app (Vite outputs to /frontend/dist)
RUN npm run build

# ---- Run stage (Nginx) ----
FROM nginx:alpine

# Nginx serves files from this directory
WORKDIR /usr/share/nginx/html

# Serve the SPA at its supported application routes.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static files from the build stage
COPY --from=build /frontend/dist .

# Nginx listens on port 80 inside the container
EXPOSE 80

# Run React server
CMD ["nginx", "-g", "daemon off;"]
