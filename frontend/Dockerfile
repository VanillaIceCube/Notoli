# ---- Build stage ----
FROM node:25 AS build

# Set working directory
WORKDIR /frontend

# Copy package.json and package-lock.json and install Node.js dependencies
COPY package*.json ./
RUN npm install

# Copy your React project code
COPY . .

# Build optimized React app (outputs to /frontend/build)
RUN npm run build

# ---- Run stage (Nginx) ----
FROM nginx:alpine

# Nginx serves files from this directory
WORKDIR /usr/share/nginx/html

# Copy the built static files from the build stage
COPY --from=build /frontend/build .

# Nginx listens on port 80 inside the container
EXPOSE 80

# Run React server
CMD ["nginx", "-g", "daemon off;"]