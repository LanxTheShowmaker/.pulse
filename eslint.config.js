export default [
    {
        // Server + bot source: modern ESM.
        files: ["**/*.js", "**/*.mjs"],
        ignores: ["node_modules/**", "dashboard/node_modules/**", "dashboard/public/**"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
        },
        rules: {
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    // ignoreRestSiblings: `const { a, b, ...rest } = obj` intentionally
                    // binds a/b purely to drop them from `rest`.
                    ignoreRestSiblings: true,
                    // `catch (e) {}` with an unused binding is an intentional,
                    // documented "handled here" marker throughout the codebase.
                    caughtErrors: "none",
                },
            ],
            "no-undef": "off",
            "no-console": "off",
        },
    },
    {
        // Browser code: classic scripts (no modules), browser globals only.
        files: ["dashboard/public/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                window: "readonly",
                document: "readonly",
                console: "readonly",
                fetch: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                localStorage: "readonly",
                sessionStorage: "readonly",
                location: "readonly",
                navigator: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                Event: "readonly",
                CustomEvent: "readonly",
                FormData: "readonly",
                AbortController: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", ignoreRestSiblings: true, caughtErrors: "none" }],
            "no-undef": "off",
            "no-console": "off",
        },
    },
];