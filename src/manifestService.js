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

        // Try to load manifest from cloud (either new file-based or old text-based)
        await this.loadCloudIndex();
    }

    async loadCloudIndex() {
        // 1. Search for new file-based manifest
        const fileMessages = await this.client.getMessages("me", {
            search: "TELENOVA_MANIFEST_FILE_V1",
            limit: 1
        });

        if (fileMessages.length > 0 && fileMessages[0].media) {
            try {
                this.manifestMessageId = fileMessages[0].id;
                const buffer = await this.client.downloadMedia(fileMessages[0], {});
                const data = JSON.parse(buffer.toString());
                
                await this.db.folders.remove({}, { multi: true });
                await this.db.files.remove({}, { multi: true });
                
                if (data.folders) await this.db.folders.insert(data.folders);
                if (data.files) await this.db.files.insert(data.files);
                console.log("Manifest recovered from cloud file.");
                return;
            } catch (e) {
                console.error("Failed to parse cloud manifest file:", e);
            }
        }

        // 2. Fallback to old text-based manifest
        const textMessages = await this.client.getMessages("me", {
            search: "TELENOVA_MANIFEST_V1",
            limit: 1
        });

        if (textMessages.length > 0 && textMessages[0].text) {
            try {
                this.manifestMessageId = textMessages[0].id;
                const text = textMessages[0].text;
                if (text.includes("MANIFEST_DATA:")) {
                    const dataStr = text.split("MANIFEST_DATA:")[1];
                    const data = JSON.parse(dataStr);
                    
                    await this.db.folders.remove({}, { multi: true });
                    await this.db.files.remove({}, { multi: true });

                    if (data.folders) await this.db.folders.insert(data.folders);
                    if (data.files) await this.db.files.insert(data.files);
                    console.log("Manifest recovered from legacy text backup.");
                }
            } catch (e) {
                console.error("Failed to parse legacy manifest:", e);
            }
        }
    }

    async saveCloudBackup() {
        try {
            // Prepare data for cloud backup
            const folders = await this.db.folders.find({});
            const files = await this.db.files.find({});
            const data = { version: 1, folders, files, timestamp: new Date() };
            
            const manifestBuffer = Buffer.from(JSON.stringify(data));
            
            // Send as a file to bypass message length limits
            const result = await this.client.sendFile("me", {
                file: manifestBuffer,
                caption: "TELENOVA_MANIFEST_FILE_V1",
                forceDocument: true,
                attributes: [new Api.DocumentAttributeFilename({ fileName: "manifest.json" })]
            });

            // Delete old manifest if it exists
            if (this.manifestMessageId) {
                try {
                    await this.client.deleteMessages("me", [this.manifestMessageId], { revoke: true });
                } catch (e) { /* ignore */ }
            }
            
            this.manifestMessageId = result.id;
        } catch (error) {
            console.error("Cloud Backup Error:", error);
        }
    }

    async sync() {
        const messages = await this.client.getMessages("me", { limit: 200 });
        let addedCount = 0;

        for (const msg of messages) {
            if (msg.media) {
                if (msg.id === this.manifestMessageId) continue;
                
                const currentMsgId = Number(msg.id);
                let fileName = `File_${currentMsgId}`;
                let fileSize = 0;

                if (msg.file) {
                    fileName = msg.file.name || fileName;
                    fileSize = Number(msg.file.size || 0);
                } else if (msg.media.document) {
                    const doc = msg.media.document;
                    fileSize = Number(doc.size || 0);
                    const attr = doc.attributes.find(a => a instanceof Api.DocumentAttributeFilename);
                    if (attr) fileName = attr.fileName;
                } else if (msg.media.photo) {
                    fileName = `Photo_${currentMsgId}.jpg`;
                    const photo = msg.media.photo;
                    if (photo.sizes && photo.sizes.length > 0) {
                        const largest = photo.sizes[photo.sizes.length - 1];
                        fileSize = Number(largest.size || 0);
                    }
                }

                if (fileSize === 0 && fileName.startsWith('File_')) continue;

                const exists = await this.db.files.findOne({ messageId: currentMsgId });
                
                if (!exists) {
                    await this.db.files.insert({
                        id: "tn_" + currentMsgId,
                        name: fileName,
                        messageId: currentMsgId,
                        folderId: "root",
                        size: fileSize,
                        createdAt: new Date(),
                        isImported: true
                    });
                    addedCount++;
                } else {
                    const needsRepair = 
                        !exists.size || 
                        Number(exists.size) === 0 || 
                        typeof exists.size !== 'number' ||
                        exists.name.startsWith('File_') ||
                        typeof exists.messageId !== 'number';

                    if (needsRepair) {
                        await this.db.files.update(
                            { _id: exists._id }, 
                            { $set: { size: Number(fileSize), name: fileName, messageId: currentMsgId } }
                        );
                        addedCount++;
                    }
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
            id: "tn_" + Number(messageId),
            name,
            messageId: Number(messageId),
            folderId,
            size: Number(size || 0),
            createdAt: new Date()
        });
        await this.saveCloudBackup();
    }

    async getFiles(folderId = "root") {
        const folders = await this.db.folders.find({ parentId: folderId });
        const files = await this.db.files.find({ folderId: folderId });

        // Calculate sizes for each folder in the list
        const foldersWithSizes = [];
        for (const f of folders) {
            try {
                const totalSize = await this.getFolderSize(f.id);
                // Create a clean object to avoid NeDB internal property issues
                foldersWithSizes.push({
                    id: f.id,
                    name: f.name,
                    parentId: f.parentId,
                    createdAt: f.createdAt,
                    size: totalSize,
                    type: 'folder'
                });
            } catch (e) {
                console.error(`Error sizing folder ${f.id}:`, e);
                foldersWithSizes.push({ ...f, size: 0, type: 'folder' });
            }
        }

        return { folders: foldersWithSizes, files };
    }

    async getAllItems() {
        const folders = await this.db.folders.find({});
        const files = await this.db.files.find({});
        return { folders, files };
    }

    async getFolderSize(folderId) {
        let totalSize = 0;
        
        try {
            // Sum files in this folder
            const files = await this.db.files.find({ folderId });
            if (files && files.length > 0) {
                totalSize += files.reduce((acc, file) => {
                    const s = Number(file.size);
                    return acc + (isNaN(s) ? 0 : s);
                }, 0);
            }
            
            // Sum subfolders recursively
            const subfolders = await this.db.folders.find({ parentId: folderId });
            if (subfolders && subfolders.length > 0) {
                for (const sub of subfolders) {
                    totalSize += await this.getFolderSize(sub.id);
                }
            }
        } catch (error) {
            console.error("getFolderSize Error:", error);
        }
        
        return totalSize;
    }

    async deleteItem(id, type) {
        if (type === 'folder') {
            await this.db.folders.remove({ id });
            await this.db.files.remove({ folderId: id }, { multi: true });
        } else {
            await this.db.files.remove({ messageId: id });
        }
        await this.saveCloudBackup();
    }
}

module.exports = ManifestService;
