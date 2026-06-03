const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const express = require("express");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const ManifestService = require("./manifestService");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(bodyParser.json());
app.use(express.static("public"));
app.use(session({
    store: new FileStore({
        path: "./sessions",
        retries: 0
    }),
    secret: process.env.SESSION_SECRET || "telenova-neural-secret-2026",
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    }
}));

const apiId = parseInt(process.env.API_ID) || 0;
const apiHash = process.env.API_HASH || "";

const clients = {}; 
const pendingLogins = {}; // Store resolvers for multi-step auth

// --- Config Routes ---

app.post("/api/config/init", (req, res) => {
    const { apiId, apiHash } = req.body;
    if (!apiId || !apiHash) return res.status(400).json({ error: "Missing credentials" });
    
    req.session.apiId = parseInt(apiId);
    req.session.apiHash = apiHash;
    res.json({ success: true });
});

// Helper to get or create client and manifest
async function getClientContext(sessionId, sessionString, sessionData) {
    if (!clients[sessionId]) {
        const client = new TelegramClient(new StringSession(sessionString), sessionData.apiId, sessionData.apiHash, {
            connectionRetries: 5,
        });
        await client.connect();
        
        const me = await client.getMe();
        const manifest = new ManifestService(client, me.id.toString());
        await manifest.init();
        
        clients[sessionId] = { client, manifest };
    }
    return clients[sessionId];
}

// --- Auth Routes ---

app.post("/api/auth/send-code", async (req, res) => {
    const { phoneNumber } = req.body;
    const { apiId, apiHash } = req.session;

    if (!apiId || !apiHash) return res.status(400).json({ error: "System not initialized" });

    try {
        const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
            connectionRetries: 5,
        });
        await client.connect();
        
        // Start the login flow in the background
        const loginPromise = client.start({
            phoneNumber: async () => phoneNumber,
            phoneCode: async () => {
                if (!pendingLogins[req.sessionID]) pendingLogins[req.sessionID] = {};
                pendingLogins[req.sessionID].isWaitingForCode = true;
                return new Promise((resolve) => {
                    pendingLogins[req.sessionID].resolveCode = resolve;
                });
            },
            password: async () => {
                if (!pendingLogins[req.sessionID]) pendingLogins[req.sessionID] = {};
                pendingLogins[req.sessionID].isWaitingForPassword = true;
                return new Promise((resolve) => {
                    pendingLogins[req.sessionID].resolvePassword = resolve;
                });
            },
            onError: (err) => {
                console.error("Client Start Error:", err);
            }
        });

        clients[req.sessionID] = { client, loginPromise };
        
        // Wait a bit to ensure the code is sent
        setTimeout(() => {
            res.json({ success: true });
        }, 2000);

    } catch (error) {
        console.error("Send Code Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    const { code, password } = req.body;
    const ctx = clients[req.sessionID];
    let pending = pendingLogins[req.sessionID];

    if (!ctx || !ctx.client) return res.status(400).json({ error: "Session not found" });

    try {
        if (code && pending && pending.resolveCode) {
            pending.resolveCode(code);
            pending.isWaitingForCode = false;
        }
        
        // Wait a bit to see if it moves to password step or finishes
        await new Promise(r => setTimeout(r, 2000));
        pending = pendingLogins[req.sessionID]; // Refresh pending state

        if (pending && pending.isWaitingForPassword && !password) {
            return res.json({ success: true, requiresPassword: true });
        }
        
        if (password && pending && pending.resolvePassword) {
            pending.resolvePassword(password);
            pending.isWaitingForPassword = false;
        }

        try {
            await ctx.loginPromise;
            
            const me = await ctx.client.getMe();
            req.session.sessionString = ctx.client.session.save();
            req.session.isLoggedIn = true;
            req.session.userId = me.id.toString();

            const manifest = new ManifestService(ctx.client, me.id.toString());
            await manifest.init();
            clients[req.sessionID].manifest = manifest;

            delete pendingLogins[req.sessionID];
            res.json({ success: true });
        } catch (err) {
            if (err.errorMessage === 'PASSWORD_HASH_INVALID') {
                if (pendingLogins[req.sessionID]) {
                    pendingLogins[req.sessionID].isWaitingForPassword = true;
                }
                return res.status(400).json({ success: false, error: "INVALID_PASSWORD", message: "Wrong 2FA password." });
            }
            throw err;
        }
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- File System Routes ---

app.get("/api/files/list", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const folderId = req.query.folderId || "root";

    try {
        const { manifest } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        const { folders, files } = manifest.getFiles(folderId);
        
        res.json({
            currentPath: folderId,
            items: [
                ...folders.map(f => ({ ...f, type: "folder" })),
                ...files.map(f => ({ ...f, type: "file" }))
            ]
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/files/upload", upload.single("file"), async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const { folderId } = req.body;
    const file = req.file;

    try {
        const { client, manifest } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        
        const result = await client.sendFile("me", {
            file: file.path,
            caption: `CYBERDRIVE_FILE:${file.originalname}`
        });

        await manifest.addFile(file.originalname, result.id, folderId || "root", file.size);
        
        // Clean up temp file
        fs.unlinkSync(file.path);

        res.json({ success: true });
    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/files/create-folder", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const { name, parentId } = req.body;

    try {
        const { manifest } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        const folderId = await manifest.createFolder(name, parentId || "root");
        res.json({ success: true, folderId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/files/delete", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const { id, type } = req.body;

    try {
        const { manifest } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        await manifest.deleteItem(id, type);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/files/sync", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });

    try {
        const { manifest } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        const addedCount = await manifest.sync();
        res.json({ success: true, addedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/files/download/:messageId", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const { messageId } = req.params;

    try {
        const { client } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        const messages = await client.getMessages("me", { ids: [parseInt(messageId)] });
        if (!messages || messages.length === 0) throw new Error("File not found");
        
        const msg = messages[0];
        const buffer = await client.downloadMedia(msg, {});
        
        let fileName = "file";
        if (msg.file) fileName = msg.file.name || "file";

        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/files/preview/:messageId", async (req, res) => {
    if (!req.session.isLoggedIn) return res.status(401).json({ error: "Unauthorized" });
    const { messageId } = req.params;

    try {
        const { client } = await getClientContext(req.sessionID, req.session.sessionString, req.session);
        const messages = await client.getMessages("me", { ids: [parseInt(messageId)] });
        if (!messages || messages.length === 0) throw new Error("Preview not found");

        const msg = messages[0];
        // Download as thumbnail if it's a large file, or full if it's a small photo
        const buffer = await client.downloadMedia(msg, {
            thumbSize: 0 // Smallest available thumb
        });

        res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
        res.setHeader("Content-Type", "image/jpeg"); // Telegram thumbs are usually JPEGs
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`TeleNova Server running on http://localhost:${PORT}`);
});
