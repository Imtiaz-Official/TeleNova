const { Api } = require("telegram");
const Datastore = require("nedb-promises");
const path = require("path");
const fs = require("fs");

class ManifestService {
    constructor(client, userId) {
        this.client = client;
        this.userId = userId;
        this.manifestMessageId = null;
        
        // Ensure data directory exists
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

        // Individual databases for each user
        this.db = {
            folders: Datastore.create({ filename: path.join(dataDir, `folders_${userId}.db`), autoload: true }),
            files: Datastore.create({ filename: path.join(dataDir, `files_${userId}.db`), autoload: true })
        };
    }

    async init() {
        // Initialize root folder if it doesn't exist
        const root = await this.db.folders.findOne({ id: "root" });
        if (!root) {
            await this.db.folders.insert({ id: "root", name: "root", parentId: null });
        }

        // Search for cloud manifest in Saved Messages (for cloud backup/sync)
        const messages = await this.client.getMessages("me", {
            search: "TELENOVA_MANIFEST_V1",
            limit: 1
        });

        if (messages.length > 0) {
            this.manifestMessageId = messages[0].id;
        }
    }

    async saveCloudBackup() {
        // Prepare data for cloud backup
        const folders = await this.db.folders.find({});
        const files = await this.db.files.find({});
        const data = { version: 1, folders, files };
        
        const manifestString = `TELENOVA_MANIFEST_V1\nMANIFEST_DATA:${JSON.stringify(data)}`;
        
        if (this.manifestMessageId) {
            try {
                await this.client.editMessage("me", {
                    message: this.manifestMessageId,
                    text: manifestString
                });
            } catch (e) {
                // If message was deleted, send new one
                const result = await this.client.sendMessage("me", { message: manifestString });
                this.manifestMessageId = result.id;
            }
        } else {
            const result = await this.client.sendMessage("me", { message: manifestString });
            this.manifestMessageId = result.id;
        }
    }

    async sync() {
        const messages = await this.client.getMessages("me", { limit: 100 });
        let addedCount = 0;

        for (const msg of messages) {
            if (msg.media && (msg.media.document || msg.media.video || msg.media.photo)) {
                if (msg.id === this.manifestMessageId) continue;
                
                const exists = await this.db.files.findOne({ messageId: msg.id });
                if (!exists) {
                    let fileName = "Telegram_File_" + msg.id;
                    let fileSize = 0;

                    if (msg.file) {
                        fileName = msg.file.name || fileName;
                        fileSize = msg.file.size || 0;
                    }

                    await this.db.files.insert({
                        id: "tn_" + msg.id,
                        name: fileName,
                        messageId: msg.id,
                        folderId: "root",
                        size: fileSize,
                        createdAt: new Date(),
                        isImported: true
                    });
                    addedCount++;
                }
            }
        }

        if (addedCount > 0) {
            await this.saveCloudBackup();
        }
        return addedCount;
    }

    async createFolder(name, parentId = "root") {
        const id = "f_" + Math.random().toString(36).substr(2, 9);
        const folder = await this.db.folders.insert({ id, name, parentId, createdAt: new Date() });
        await this.saveCloudBackup();
        return folder.id;
    }

    async addFile(name, messageId, folderId = "root", size) {
        await this.db.files.insert({
            id: "tn_" + messageId,
            name,
            messageId,
            folderId,
            size,
            createdAt: new Date()
        });
        await this.saveCloudBackup();
    }

    async getFiles(folderId = "root") {
        const folders = await this.db.folders.find({ parentId: folderId });
        const files = await this.db.files.find({ folderId: folderId });
        return { folders, files };
    }

    async deleteItem(id, type) {
        if (type === 'folder') {
            await this.db.folders.remove({ id });
            await this.db.files.remove({ folderId: id }, { multi: true });
        } else {
            // id here is messageId for files in our current logic
            await this.db.files.remove({ messageId: id });
        }
        await this.saveCloudBackup();
    }
}

module.exports = ManifestService;
