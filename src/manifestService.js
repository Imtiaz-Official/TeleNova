const { Api } = require("telegram");
const fs = require("fs");

class ManifestService {
    constructor(client) {
        this.client = client;
        this.manifestMessageId = null;
        this.data = {
            version: 1,
            folders: [
                { id: "root", name: "root", parentId: null }
            ],
            files: []
        };
    }

    async init() {
        // Search for existing manifest in Saved Messages
        const messages = await this.client.getMessages("me", {
            search: "TELENOVA_MANIFEST_V1",
            limit: 1
        });

        if (messages.length > 0) {
            const msg = messages[0];
            this.manifestMessageId = msg.id;
            try {
                // Assuming the manifest is stored as a text message or a small file
                const content = msg.message.split("MANIFEST_DATA:")[1];
                if (content) {
                    this.data = JSON.parse(content);
                }
            } catch (e) {
                console.error("Failed to parse manifest:", e);
            }
        } else {
            await this.save();
        }
    }

    async save() {
        const manifestString = `TELENOVA_MANIFEST_V1\nMANIFEST_DATA:${JSON.stringify(this.data)}`;
        if (this.manifestMessageId) {
            await this.client.editMessage("me", {
                message: this.manifestMessageId,
                text: manifestString
            });
        } else {
            const result = await this.client.sendMessage("me", { message: manifestString });
            this.manifestMessageId = result.id;
        }
    }

    async sync() {
        // Fetch last 100 messages from Saved Messages
        const messages = await this.client.getMessages("me", { limit: 100 });
        let addedCount = 0;

        for (const msg of messages) {
            // Check if it's a document and not our manifest
            if (msg.media && (msg.media.document || msg.media.video || msg.media.photo)) {
                if (msg.id === this.manifestMessageId) continue;
                
                // Check if already indexed
                const exists = this.data.files.some(f => f.messageId === msg.id);
                if (!exists) {
                    let fileName = "Telegram_File_" + msg.id;
                    let fileSize = 0;

                    if (msg.file) {
                        fileName = msg.file.name || fileName;
                        fileSize = msg.file.size || 0;
                    }

                    this.data.files.push({
                        id: "tn_" + msg.id,
                        name: fileName,
                        messageId: msg.id,
                        folderId: "root",
                        size: fileSize,
                        isImported: true
                    });
                    addedCount++;
                }
            }
        }

        if (addedCount > 0) {
            await this.save();
        }
        return addedCount;
    }

    async createFolder(name, parentId = "root") {
        const id = "f_" + Math.random().toString(36).substr(2, 9);
        this.data.folders.push({ id, name, parentId });
        await this.save();
        return id;
    }

    async addFile(name, messageId, folderId = "root", size) {
        this.data.files.push({ name, messageId, folderId, size });
        await this.save();
    }

    getFiles(folderId = "root") {
        const folders = this.data.folders.filter(f => f.parentId === folderId);
        const files = this.data.files.filter(f => f.folderId === folderId);
        return { folders, files };
    }

    async deleteItem(id, type) {
        if (type === 'folder') {
            this.data.folders = this.data.folders.filter(f => f.id !== id);
            // Also delete files inside the folder (optional but cleaner)
            this.data.files = this.data.files.filter(f => f.folderId !== id);
        } else {
            // Note: In our current VFS, 'id' for files is a bit loose, 
            // but we can use name or messageId. Let's use messageId if available.
            this.data.files = this.data.files.filter(f => f.messageId !== id);
        }
        await this.save();
    }
}

module.exports = ManifestService;
