export default [
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                globalThis: "readonly",
                setInterval: "readonly",
                setTimeout: "readonly",
                clearInterval: "readonly",
                clearTimeout: "readonly",
                fetch: "readonly",
                Map: "readonly",
                Set: "readonly",
                Promise: "readonly",
                JSON: "readonly",
                Date: "readonly",
                Error: "readonly",
                BigInt: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
            "no-undef": "off",
            "no-console": "off",
        },
    },
];
//# sourceMappingURL=eslint.config.js.map