import { Router } from "express";
import { join } from "node:path";
import { validateSession } from "../services/session.js";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function page(file) {
    return (req, res) => res.sendFile(file, { root: PUBLIC_DIR });
}

// Public landing + login. No authentication required here; /login sends
// already-authenticated users straight to server selection.
export function createPublicRouter() {
    const router = Router();

    router.get("/", page("index.html"));

    router.get("/login", async (req, res) => {
        const token = req.signedCookies?.session_token;
        if (token) {
            const session = await validateSession(token).catch(() => null);
            if (session) return res.redirect("/select-server");
        }
        res.sendFile("login.html", { root: PUBLIC_DIR });
    });

    return router;
}
