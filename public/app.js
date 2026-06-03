const state = {
    isLoggedIn: false,
    currentPath: "root",
    items: [],
    viewMode: localStorage.getItem("telenova_view_mode") || "grid",
    selectedItem: null
};

// --- DOM Elements ---
const authOverlay = document.getElementById("auth-overlay");
const fileContainer = document.getElementById("file-container");
const breadcrumbs = document.getElementById("breadcrumbs");
const viewToggleBtn = document.getElementById("view-toggle-btn");
const contextMenu = document.getElementById("context-menu");
const authStatus = document.getElementById("auth-status");

// --- Initialization & Session Check ---
async function checkSession() {
    try {
        const res = await fetch("/api/files/list");
        if (res.ok) {
            const data = await res.json();
            state.isLoggedIn = true;
            authOverlay.classList.add("hidden");
            state.items = data.items;
            renderFiles();
        }
    } catch (e) {
        console.log("No active session found.");
    }
}

// --- Auth Functions ---
async function initializeSystem() {
    const apiId = document.getElementById("api-id-input").value;
    const apiHash = document.getElementById("api-hash-input").value;
    if(!apiId || !apiHash) return alert("API_ID and API_HASH required.");
    
    updateAuthStatus("SYNCING_CREDENTIALS...", "PROCESS");
    const res = await fetch("/api/config/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiId, apiHash })
    });
    
    if (res.ok) {
        document.getElementById("step-init").classList.add("hidden");
        document.getElementById("step-phone").classList.remove("hidden");
        updateAuthStatus("SYSTEM_INITIALIZED", "READY");
    }
}

async function sendCode() {
    const phoneNumber = document.getElementById("phone-input").value;
    if(!phoneNumber) return alert("Phone number required.");
    updateAuthStatus("SENDING_SIGNAL...", "PROCESS");
    
    const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber })
    });
    
    if (res.ok) {
        document.getElementById("step-phone").classList.add("hidden");
        document.getElementById("step-verify").classList.remove("hidden");
        updateAuthStatus("CODE_SENT", "READY");
    }
}

async function login() {
    const code = document.getElementById("code-input").value;
    const password = document.getElementById("password-input").value;
    updateAuthStatus("ESTABLISHING_UPLINK...", "PROCESS");

    const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password })
    });
    const data = await res.json();

    if (data.success) {
        if (data.requiresPassword) {
            updateAuthStatus("2FA_PASSWORD_REQUIRED", "READY");
            document.getElementById("password-input").style.borderColor = "var(--accent)";
        } else {
            state.isLoggedIn = true;
            authOverlay.classList.add("hidden");
            loadFiles("root");
        }
    } else {
        updateAuthStatus(data.error === "INVALID_PASSWORD" ? "WRONG_PASSWORD" : "UPLINK_FAILED", "ERROR");
        if(data.error === "INVALID_PASSWORD") alert("WRONG 2FA PASSWORD!");
    }
}

// --- File Operations ---
async function loadFiles(folderId = "root") {
    state.currentPath = folderId;
    const res = await fetch(`/api/files/list?folderId=${folderId}`);
    const data = await res.json();
    state.items = data.items;
    renderFiles();
    updateBreadcrumbs(folderId);
}

function renderFiles() {
    fileContainer.innerHTML = "";
    updateViewBtn();

    if (state.viewMode === "grid") {
        fileContainer.className = "file-grid";
        state.items.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "item-card";
            card.style.animationDelay = `${index * 0.05}s`;
            
            const isImage = ['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(item.name.split('.').pop().toLowerCase());
            const iconName = item.type === 'folder' ? 'folder' : getFileIcon(item.name);
            
            let iconHtml = `<span class="item-icon"><i data-lucide="${iconName}"></i></span>`;
            if (isImage && item.messageId) {
                iconHtml = `<div class="item-preview"><img src="/api/files/preview/${item.messageId}" alt="" loading="lazy"></div>`;
            }
            
            card.innerHTML = `
                ${iconHtml}
                <span class="item-name">${item.name}</span>
            `;
            
            card.onclick = (e) => handleItemClick(e, item);
            card.oncontextmenu = (e) => handleContextMenu(e, item);
            fileContainer.appendChild(card);
        });
    } else {
        fileContainer.className = "file-list-view";
        const header = document.createElement("div");
        header.className = "list-header";
        header.innerHTML = `<div>Name</div><div>Size</div><div>Type</div><div>ID</div>`;
        fileContainer.appendChild(header);

        state.items.forEach(item => {
            const row = document.createElement("div");
            row.className = "list-item";
            
            const isImage = ['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(item.name.split('.').pop().toLowerCase());
            const iconName = item.type === 'folder' ? 'folder' : getFileIcon(item.name);
            
            let iconHtml = `<span class="list-icon"><i data-lucide="${iconName}"></i></span>`;
            if (isImage && item.messageId) {
                iconHtml = `<div class="list-preview"><img src="/api/files/preview/${item.messageId}" alt="" loading="lazy"></div>`;
            }

            const size = item.type === 'folder' ? '--' : formatBytes(item.size);
            
            row.innerHTML = `
                <div class="list-name">${iconHtml} ${item.name}</div>
                <div>${size}</div>
                <div>${item.type.toUpperCase()}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary)">${item.messageId || 'DIR'}</div>
            `;
            
            row.onclick = (e) => handleItemClick(e, item);
            row.oncontextmenu = (e) => handleContextMenu(e, item);
            fileContainer.appendChild(row);
        });
    }
    
    if (window.lucide) lucide.createIcons();
}

function handleItemClick(e, item) {
    if (item.type === 'folder') {
        loadFiles(item.id);
    } else {
        downloadFile(item.messageId, item.name);
    }
}

async function downloadFile(messageId, fileName) {
    if (!messageId) return;
    updateAuthStatus(`DOWNLOADING_${fileName.toUpperCase()}...`, "PROCESS");
    window.location.href = `/api/files/download/${messageId}`;
    setTimeout(() => updateAuthStatus("SYSTEM_READY", "READY"), 3000);
}

// --- View Toggling ---
function updateViewBtn() {
    const isGrid = state.viewMode === "grid";
    viewToggleBtn.innerHTML = `<i data-lucide="${isGrid ? 'layout-list' : 'layout-grid'}"></i> <span>${isGrid ? 'List View' : 'Grid View'}</span>`;
    if (window.lucide) lucide.createIcons();
}

viewToggleBtn.onclick = () => {
    state.viewMode = state.viewMode === "grid" ? "list" : "grid";
    localStorage.setItem("telenova_view_mode", state.viewMode);
    renderFiles();
};

// --- Context Menu ---
function handleContextMenu(e, item) {
    e.preventDefault();
    state.selectedItem = item;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.classList.remove("hidden");
    
    document.getElementById("menu-download").classList.toggle("hidden", item.type === 'folder');
}

document.onclick = () => contextMenu.classList.add("hidden");

document.getElementById("menu-download").onclick = () => {
    if (state.selectedItem) downloadFile(state.selectedItem.messageId, state.selectedItem.name);
};

document.getElementById("menu-open").onclick = () => {
    if (state.selectedItem && state.selectedItem.type === 'folder') loadFiles(state.selectedItem.id);
};

document.getElementById("menu-delete").onclick = async () => {
    if (!state.selectedItem) return;
    const confirmDelete = confirm(`Are you sure you want to delete ${state.selectedItem.name}?`);
    if (!confirmDelete) return;

    const id = state.selectedItem.type === 'folder' ? state.selectedItem.id : state.selectedItem.messageId;
    const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: state.selectedItem.type })
    });
    
    if (res.ok) {
        loadFiles(state.currentPath);
    } else {
        alert("Delete failed.");
    }
};

// --- Utils ---
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'mkv', 'mov', 'webm'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'music';
    if (['pdf'].includes(ext)) return 'file-text';
    if (['doc', 'docx', 'txt', 'md'].includes(ext)) return 'file-text';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    return 'file';
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateBreadcrumbs(folderId) {
    breadcrumbs.innerHTML = `<span onclick="loadFiles('root')">My Drive</span>`;
    if (folderId !== 'root') {
        breadcrumbs.innerHTML += ` <span style="margin: 0 8px; color: var(--text-secondary);">/</span> <span>${folderId}</span>`;
    }
}

function updateAuthStatus(text, type) {
    if(authStatus) {
        authStatus.innerText = text;
        authStatus.style.color = type === "ERROR" ? "var(--danger)" : "var(--accent)";
    }
}

// --- Event Listeners ---
document.getElementById("init-btn").onclick = initializeSystem;
document.getElementById("send-code-btn").onclick = sendCode;
document.getElementById("login-btn").onclick = login;
document.getElementById("sync-btn").onclick = async () => {
    const btn = document.getElementById("sync-btn");
    btn.innerHTML = `<i data-lucide="loader-2" class="status-pulse"></i> <span>Syncing...</span>`;
    lucide.createIcons();
    const res = await fetch("/api/files/sync", { method: "POST" });
    const data = await res.json();
    if (data.success) {
        alert(`Sync Complete: ${data.addedCount} items added.`);
        loadFiles(state.currentPath);
    }
    btn.innerHTML = `<i data-lucide="refresh-cw"></i> <span>Sync TG</span>`;
    lucide.createIcons();
};
document.getElementById("new-folder-btn").onclick = async () => {
    const name = prompt("Enter folder name:");
    if (!name) return;
    await fetch("/api/files/create-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: state.currentPath })
    });
    loadFiles(state.currentPath);
};
document.getElementById("file-upload").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folderId", state.currentPath);
    updateAuthStatus(`UPLOADING_${file.name.toUpperCase()}...`, "PROCESS");
    const res = await fetch("/api/files/upload", { method: "POST", body: formData });
    if (res.ok) loadFiles(state.currentPath);
};
document.getElementById("logout-btn").onclick = () => location.reload();

// Initial Run
checkSession();
if (window.lucide) lucide.createIcons();
