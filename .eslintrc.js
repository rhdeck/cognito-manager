module.exports = {
  env: {
    es6: true,
    node: true
  },
  extends: "eslint:recommended",
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly"
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    "babel/semi": 1,
    "require-atomic-updates": 0,
    "no-unused-vars": [2, { varsIgnorePattern: "_", argsIgnorePattern: "_" }],
    "no-case-declarations": 0
  },
  plugins: ["babel"],
  parser: "babel-eslint"
};
