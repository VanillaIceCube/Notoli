module.exports = {
  roots: ['<rootDir>/src'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  moduleNameMapper: { '\\.(css|less|scss|sass)$': '<rootDir>/src/test-support/styleMock.js' },
  testTimeout: 15000,
  clearMocks: true,
};
