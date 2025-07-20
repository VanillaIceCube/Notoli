FROM node:18

# Set working directory
WORKDIR /frontend

# Copy package.json and package-lock.json (if present)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy your React project code
COPY . .

# Run React server
CMD ["npm", "start"]
