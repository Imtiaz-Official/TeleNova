const state = {
    isLoggedIn: false,
    currentPath: "root",
    items: [],
    viewMode: localStorage.getItem("telenova_view_mode") || "grid",
    selectedItem: null
};

// --- Modal System Logic ---
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalInputContainer = document.getElementById("modal-input-container");
const modalInput = document.getElementById("modal-input");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");

function showModal({ title, message, showInput, confirmText, cancelText }) {
    return new Promise((resolve) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        modalInputContainer.classList.toggle("hidden", !showInput);
        modalInput.value = "";
        modalConfirm.innerText = confirmText || "Confirm";
        modalCancel.innerText = cancelText || "Cancel";
        modalOverlay.classList.remove("hidden");

        const cleanup = () => {
            modalOverlay.classList.add("hidden");
            modalConfirm.onclick = null;
            modalCancel.onclick = null;
        };

        modalConfirm.onclick = () => {
            const val = showInput ? modalInput.value : true;
            cleanup();
            resolve(val);
        };
        modalCancel.onclick = () => {
            cleanup();
            resolve(null);
        };
    });
}

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
        const res = await fetch("/api/auth/status");
        if (res.ok) {
            const data = await res.json();
            if (data.isLoggedIn) {
                state.isLoggedIn = true;
                authOverlay.classList.add("hidden");
                document.querySelector(".sidebar").classList.remove("hidden");
                document.querySelector(".main-content").classList.remove("hidden");
                loadFiles("root");
            } else if (data.hasConfig) {
                // System configured but not logged in, show phone step
                document.getElementById("step-init").classList.add("hidden");
                document.getElementById("step-phone").classList.remove("hidden");
                updateProgress(2);
                showLogin();
            } else {
                showLogin();
            }
        } else {
            showLogin();
        }
    } catch (e) {
        console.error("Session check failed:", e);
        // On fatal error, show login as fallback
        showLogin();
    }
}

function showLogin() {
    state.isLoggedIn = false;
    authOverlay.classList.remove("hidden");
    document.querySelector(".sidebar").classList.add("hidden");
    document.querySelector(".main-content").classList.add("hidden");
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
        updateProgress(2);
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
        updateProgress(3);
        updateAuthStatus("CODE_SENT", "READY");
    }
}

function updateProgress(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`p-step-${i}`);
        if (i < step) {
            el.classList.add("complete");
            el.classList.remove("active");
            el.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
        } else if (i === step) {
            el.classList.add("active");
            el.classList.remove("complete");
            el.innerText = i;
        } else {
            el.classList.remove("active", "complete");
            el.innerText = i;
        }
    }
    if (window.lucide) lucide.createIcons();
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
            document.querySelector(".sidebar").classList.remove("hidden");
            document.querySelector(".main-content").classList.remove("hidden");
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
    updateAuthStatus(`LOADING_NODE_${folderId.toUpperCase()}...`, "PROCESS");
    try {
        const res = await fetch(`/api/files?folderId=${folderId}`);
        // Fallback for previous API structure
        const endpoint = res.ok ? `/api/files?folderId=${folderId}` : `/api/files/list?folderId=${folderId}`;
        const finalRes = await fetch(endpoint);
        const data = await finalRes.json();
        state.items = data.items;
        renderFiles();
        updateBreadcrumbs(folderId);
        updateAuthStatus("SYSTEM_READY", "READY");
    } catch (e) {
        updateAuthStatus("VFS_IO_ERROR", "ERROR");
    }
}

// --- Search Implementation ---
document.querySelector(".search-bar").oninput = (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = state.items.filter(item => item.name.toLowerCase().includes(query));
    renderFiles(filtered);
};

function renderFiles(itemsToRender = state.items) {
    fileContainer.innerHTML = "";
    updateViewBtn();

    if (state.viewMode === "grid") {
        fileContainer.className = "file-grid";
        itemsToRender.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "item-card";
            card.style.animationDelay = `${index * 0.03}s`;
            
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
            
            card.onclick = (e) => {
                handleItemClick(e, item);
            };
            card.oncontextmenu = (e) => handleContextMenu(e, item);
            fileContainer.appendChild(card);
        });
    } else {
        fileContainer.className = "file-list-view";
        const header = document.createElement("div");
        header.className = "list-header";
        header.innerHTML = `<div>Name</div><div>Size</div><div>Type</div><div>ID</div><div></div>`;
        fileContainer.appendChild(header);

        itemsToRender.forEach(item => {
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
                <div class="list-name">${iconHtml} <span>${item.name}</span></div>
                <div>${size}</div>
                <div>${(item.type || 'file').toUpperCase()}</div>
                <div style="font-size: 0.7rem; color: var(--text-secondary)">${item.messageId || 'DIR'}</div>
                <div></div>
            `;
            
            row.onclick = (e) => {
                handleItemClick(e, item);
            };
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
    
    contextMenu.classList.remove("hidden");
    
    // Smart Positioning
    let x = e.clientX;
    let y = e.clientY;
    
    const menuWidth = contextMenu.offsetWidth || 180;
    const menuHeight = contextMenu.offsetHeight || 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    if (x + menuWidth > windowWidth) x = windowWidth - menuWidth - 10;
    if (y + menuHeight > windowHeight) y = windowHeight - menuHeight - 10;
    
    // Prevent negative values
    x = Math.max(10, x);
    y = Math.max(10, y);

    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;
    
    document.getElementById("menu-download").classList.toggle("hidden", item.type === 'folder');
    document.getElementById("menu-open").classList.toggle("hidden", item.type !== 'folder');
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
    const confirmed = await showModal({
        title: "Delete Item",
        message: `Are you sure you want to permanently delete "${state.selectedItem.name}"? This cannot be undone.`,
        confirmText: "Delete",
        cancelText: "Keep it"
    });
    if (!confirmed) return;

    const id = state.selectedItem.type === 'folder' ? state.selectedItem.id : state.selectedItem.messageId;
    const res = await fetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type: state.selectedItem.type })
    });
    
    if (res.ok) {
        loadFiles(state.currentPath);
    } else {
        showModal({ title: "Operation Failed", message: "System could not delete the selected item." });
    }
};

// --- Utils ---
function getFileIcon(name) {
    if (!name) return 'file';
    const ext = name.split('.').pop().toLowerCase();
    
    const iconMap = {
        // Images
        'jpg': 'image', 'jpeg': 'image', 'png': 'image', 'gif': 'image', 'webp': 'image', 
        'svg': 'image', 'bmp': 'image', 'ico': 'image', 'tiff': 'image', 'heic': 'image',
        
        // Video
        'mp4': 'video', 'mkv': 'video', 'mov': 'video', 'webm': 'video', 'avi': 'video', 
        'flv': 'video', 'wmv': 'video', 'm4v': 'video', '3gp': 'video',
        
        // Music
        'mp3': 'music', 'wav': 'music', 'ogg': 'music', 'm4a': 'music', 'flac': 'music', 
        'aac': 'music', 'wma': 'music', 'opus': 'music',
        
        // Documents
        'pdf': 'file-text', 'doc': 'file-text', 'docx': 'file-text', 'txt': 'file-text', 
        'md': 'file-text', 'rtf': 'file-text', 'odt': 'file-text', 'xls': 'file-text', 
        'xlsx': 'file-text', 'ppt': 'file-text', 'pptx': 'file-text', 'csv': 'file-text',
        
        // Archives
        'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 'gz': 'archive', 
        'bz2': 'archive', 'xz': 'archive', 'iso': 'archive',
        
        // Code
        'js': 'code', 'ts': 'code', 'html': 'code', 'css': 'code', 'json': 'code', 
        'py': 'code', 'java': 'code', 'cpp': 'code', 'c': 'code', 'go': 'code', 
        'php': 'code', 'rb': 'code', 'sh': 'code', 'sql': 'code',
        
        // Executables
        'exe': 'cpu', 'msi': 'cpu', 'apk': 'cpu', 'app': 'cpu', 'dmg': 'cpu', 'bin': 'cpu'
    };

    return iconMap[ext] || 'file';
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    if (!bytes || isNaN(bytes)) return 'Unknown Size';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    if (i < 0) return bytes + ' Bytes';
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function updateBreadcrumbs(folderId) {
    breadcrumbs.innerHTML = `<span onclick="loadFiles('root')">Neural Drive</span>`;
    if (folderId !== 'root') {
        const displayName = folderId.startsWith('f_') ? "Subfolder" : folderId;
        breadcrumbs.innerHTML += ` <span style="margin: 0 12px; opacity: 0.3;">/</span> <span style="color: var(--accent); font-weight: 700;">${displayName}</span>`;
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
    const name = await showModal({
        title: "New Neural Node",
        message: "Enter a name for your new folder:",
        showInput: true,
        confirmText: "Create Node"
    });
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
