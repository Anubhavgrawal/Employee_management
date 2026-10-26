
/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: [
    "**/integration/*.test.ts",
    "**/middlewares/auth/*.test.ts",
  ],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFiles: ["<rootDir>/tests/config/jest.setup.ts"],
  clearMocks: true,
};
