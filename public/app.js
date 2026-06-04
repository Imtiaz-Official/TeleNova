const state = {
    isLoggedIn: false,
    currentPath: "root",
    items: [],
    viewMode: localStorage.getItem("telenova_view_mode") || "list",
    selectedItem: null,
    sortBy: 'name', // name, size, date
    filterBy: 'all', // all, image, video, doc
    folderNames: { 'root': 'Neural Drive' }
};

// --- Modal System Logic ---
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalInputContainer = document.getElementById("modal-input-container");
const modalInput = document.getElementById("modal-input");
const modalOptionsContainer = document.getElementById("modal-options");
const modalCancel = document.getElementById("modal-cancel");
const modalConfirm = document.getElementById("modal-confirm");

function showModal({ title, message, showInput, options, selectedValue, confirmText, cancelText }) {
    return new Promise((resolve) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        
        modalInputContainer.classList.toggle("hidden", !showInput);
        modalOptionsContainer.classList.toggle("hidden", !options);
        modalInput.value = "";
        
        if (options) {
            modalOptionsContainer.innerHTML = "";
            options.forEach(opt => {
                const div = document.createElement("div");
                div.className = `modal-option-item ${selectedValue === opt.value ? 'active' : ''}`;
                div.innerHTML = `<i data-lucide="${opt.icon || 'circle'}"></i> <span>${opt.label}</span>`;
                div.onclick = () => {
                    cleanup();
                    resolve(opt.value);
                };
                modalOptionsContainer.appendChild(div);
            });
            if (window.lucide) lucide.createIcons();
            modalConfirm.classList.add("hidden"); // Hide confirm if using options
        } else {
            modalConfirm.classList.remove("hidden");
        }

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

const dashboardView = document.getElementById("dashboard-view");
const explorerView = document.getElementById("explorer-view");
const recentContainer = document.getElementById("recent-container");

const navHome = document.getElementById("nav-home");
const navFiles = document.getElementById("nav-files");
const navRecent = document.getElementById("nav-recent");
const searchToggleBtn = document.getElementById("search-toggle-btn");
const searchContainer = document.getElementById("search-container");
const toolsToggleBtn = document.getElementById("tools-toggle-btn");
const bottomSheet = document.getElementById("bottom-sheet");
const bottomSheetOverlay = document.getElementById("bottom-sheet-overlay");
const closeSheetBtn = document.getElementById("close-sheet-btn");
const fabMainBtn = document.getElementById("fab-main-btn");
const fabContainer = document.querySelector(".fab-container");
const fabMenu = document.getElementById("fab-menu");

// --- Enterprise UI Logic ---

// 1. Search Toggle
if (searchToggleBtn && searchContainer) {
    searchToggleBtn.onclick = () => {
        const isCollapsed = searchContainer.classList.toggle("collapsed");
        fileContainer.classList.toggle("search-active", !isCollapsed);
        if (!isCollapsed) {
            setTimeout(() => document.querySelector(".search-bar").focus(), 100);
        }
    };
}

// 2. Bottom Sheet Toggle
function toggleBottomSheet(show) {
    if (show) {
        bottomSheet.classList.remove("hidden");
        bottomSheetOverlay.classList.remove("hidden");
    } else {
        bottomSheet.classList.add("hidden");
        bottomSheetOverlay.classList.add("hidden");
    }
}

if (toolsToggleBtn) toolsToggleBtn.onclick = () => toggleBottomSheet(true);
if (closeSheetBtn) closeSheetBtn.onclick = () => toggleBottomSheet(false);
if (bottomSheetOverlay) bottomSheetOverlay.onclick = () => toggleBottomSheet(false);

// 3. Floating Action Button (FAB)
if (fabMainBtn) {
    fabMainBtn.onclick = () => {
        const isActive = fabContainer.classList.toggle("active");
        if (isActive) {
            fabMenu.classList.remove("hidden");
        } else {
            fabMenu.classList.add("hidden");
        }
    };
}

// Close FAB menu when clicking outside
document.addEventListener("click", (e) => {
    if (fabContainer && fabContainer.classList.contains("active") && !fabContainer.contains(e.target)) {
        fabContainer.classList.remove("active");
        fabMenu.classList.add("hidden");
    }
});

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
                
                // Restore State
                const savedView = localStorage.getItem("telenova_active_view") || 'home';
                const savedPath = localStorage.getItem("telenova_current_path") || 'root';
                
                if (savedView === 'explorer') {
                    showView('explorer');
                    loadFiles(savedPath);
                } else {
                    showView('home');
                }
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
        showLogin();
    }
}

function showView(view) {
    localStorage.setItem("telenova_active_view", view);
    
    // Reset all nav highlights
    navHome.classList.remove("active");
    navFiles.classList.remove("active");
    if (navRecent) navRecent.classList.remove("active");
    
    if (view === 'home' || view === 'recent') {
        dashboardView.classList.remove("hidden");
        explorerView.classList.add("hidden");
        
        if (view === 'home') navHome.classList.add("active");
        if (view === 'recent') navRecent.classList.add("active");
        
        loadDashboard().then(() => {
            if (view === 'recent') {
                setTimeout(() => {
                    const recentSection = document.querySelector(".recent-section");
                    if (recentSection) {
                        dashboardView.parentElement.scrollTop = recentSection.offsetTop;
                        dashboardView.parentElement.scrollTo({ top: recentSection.offsetTop, behavior: 'smooth' });
                        // fallback scroll on document body
                        document.querySelector(".main-content").scrollTo({ top: recentSection.offsetTop, behavior: 'smooth' });
                    }
                }, 100);
            }
        });
    } else {
        dashboardView.classList.add("hidden");
        explorerView.classList.remove("hidden");
        navFiles.classList.add("active");
    }
}

async function loadDashboard() {
    updateAuthStatus("FETCHING_NEURAL_STATS...", "PROCESS");
    // Fetch ALL items across all folders for true global stats
    const res = await fetch("/api/files/stats");
    if (res.ok) {
        const data = await res.json();
        
        let totalFiles = 0;
        let totalFolders = 0;
        let totalSize = 0;
        
        data.items.forEach(item => {
            if (item.type === 'folder') {
                if (item.id !== 'root') totalFolders++;
            } else {
                totalFiles++;
                totalSize += (item.size || 0);
            }
        });
        
        document.getElementById("dash-storage").innerText = formatBytes(totalSize);
        document.getElementById("dash-files-count").innerText = totalFiles;
        document.getElementById("dash-folders-count").innerText = totalFolders;
        
        // Update Sidebar Storage Widget too
        updateStorageStats(data.items);

        // Render Recent Activity (Last 6 files across entire drive)
        const sortedRecent = data.items
            .filter(i => i.type !== 'folder')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 6);
            
        renderRecent(sortedRecent);
        updateAuthStatus("DASHBOARD_READY", "READY");
    }
}

function renderRecent(items) {
    recentContainer.innerHTML = "";
    if (items.length === 0) {
        recentContainer.innerHTML = `<div style="padding: 40px; color: var(--text-secondary); text-align: center; width: 100%;">No recent neural activity detected.</div>`;
        return;
    }

    items.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "item-card";
        card.style.animationDelay = `${index * 0.05}s`;
        
        const isImage = ['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(item.name.split('.').pop().toLowerCase());
        const iconName = getFileIcon(item.name);
        const categoryClass = getFileCategory(item.name);
        
        let iconHtml = `<span class="item-icon ${categoryClass}"><i data-lucide="${iconName}"></i></span>`;
        if (isImage && item.messageId) {
            iconHtml = `<div class="item-preview"><img src="/api/files/preview/${item.messageId}" alt="" loading="lazy"></div>`;
        }
        
        card.innerHTML = `
            <div class="hover-glow"></div>
            ${iconHtml}
            <span class="item-name">${item.name}</span>
        `;
        
        card.onclick = () => {
            state.selectedItem = item;
            downloadFile(item.messageId, item.name);
        };
        
        recentContainer.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
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
    localStorage.setItem("telenova_current_path", folderId);
    updateAuthStatus("SYNCING_NEURAL_NODES...", "PROCESS");
    try {
        const res = await fetch(`/api/files/list?folderId=${folderId}`);
        if (!res.ok) throw new Error("Server response error");
        
        const data = await res.json();
        state.items = data.items;

        // Store folder names for breadcrumbs
        data.items.forEach(item => {
            if (item.type === 'folder') state.folderNames[item.id] = item.name;
        });

        renderFiles();
        updateBreadcrumbs(folderId);
        updateAuthStatus("SYSTEM_READY", "READY");
    } catch (e) {
        console.error("VFS Error:", e);
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
    
    // Apply Filtering
    let filteredItems = [...itemsToRender];
    if (state.filterBy !== 'all') {
        filteredItems = filteredItems.filter(item => {
            if (item.type === 'folder') return true; // Always show folders
            const cat = getFileCategory(item.name);
            return cat === `clr-${state.filterBy}`;
        });
    }

    // Apply Sorting
    filteredItems.sort((a, b) => {
        // Folders always come first
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;

        if (state.sortBy === 'name') return a.name.localeCompare(b.name);
        if (state.sortBy === 'size') return (b.size || 0) - (a.size || 0);
        if (state.sortBy === 'date') return new Date(b.createdAt) - new Date(a.createdAt);
        return 0;
    });

    updateStorageStats(filteredItems);

    if (state.viewMode === "grid") {
        fileContainer.className = "file-grid";
        filteredItems.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "item-card";
            card.style.animationDelay = `${index * 0.04}s`;
            
            const isImage = ['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(item.name.split('.').pop().toLowerCase());
            const iconName = item.type === 'folder' ? 'folder' : getFileIcon(item.name);
            const categoryClass = item.type === 'folder' ? 'clr-folder' : getFileCategory(item.name);
            
            let iconHtml = `<span class="item-icon ${categoryClass}"><i data-lucide="${iconName}"></i></span>`;
            if (isImage && item.messageId) {
                iconHtml = `<div class="item-preview"><img src="/api/files/preview/${item.messageId}" alt="" loading="lazy"></div>`;
            }
            
            card.innerHTML = `
                <div class="hover-glow"></div>
                ${iconHtml}
                <span class="item-name">${item.name}</span>
            `;

            // Mouse tracking for hover glow - disabled on touch devices for performance
            if (!('ontouchstart' in window)) {
                card.onmousemove = (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    card.style.setProperty('--mouse-x', `${x}px`);
                    card.style.setProperty('--mouse-y', `${y}px`);
                };
            }
            
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
        header.innerHTML = `<div>Item Details</div><div style="text-align: right;">Size</div>`;
        fileContainer.appendChild(header);

        itemsToRender.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "list-item";
            row.style.animationDelay = `${index * 0.02}s`;
            
            const isImage = ['jpg', 'png', 'gif', 'jpeg', 'webp'].includes(item.name.split('.').pop().toLowerCase());
            const iconName = item.type === 'folder' ? 'folder' : getFileIcon(item.name);
            const categoryClass = item.type === 'folder' ? 'clr-folder' : getFileCategory(item.name);
            
            let iconHtml = `<span class="list-icon ${categoryClass}"><i data-lucide="${iconName}"></i></span>`;
            if (isImage && item.messageId) {
                iconHtml = `<div class="list-preview"><img src="/api/files/preview/${item.messageId}" alt="" loading="lazy"></div>`;
            }

            const size = formatBytes(item.size || 0);
            
            let displayType = 'FILE';
            if (item.type === 'folder') {
                displayType = 'FOLDER';
            } else if (item.name && item.name.includes('.')) {
                const ext = item.name.split('.').pop().toUpperCase();
                const typeMap = {
                    'PPT': 'POWERPOINT', 'PPTX': 'POWERPOINT',
                    'DOC': 'WORD', 'DOCX': 'WORD',
                    'XLS': 'EXCEL', 'XLSX': 'EXCEL',
                    'TXT': 'TEXT', 'MD': 'MARKDOWN',
                    'APK': 'ANDROID APP',
                    'PDF': 'PDF DOCUMENT',
                    'ZIP': 'ARCHIVE', 'RAR': 'ARCHIVE', '7Z': 'ARCHIVE',
                    'MP4': 'VIDEO', 'MKV': 'VIDEO', 'MOV': 'VIDEO',
                    'MP3': 'AUDIO', 'WAV': 'AUDIO', 'FLAC': 'AUDIO',
                    'JPG': 'IMAGE', 'PNG': 'IMAGE', 'WEBP': 'IMAGE', 'JPEG': 'IMAGE',
                    'EXE': 'EXECUTABLE', 'MSI': 'INSTALLER', 'APP': 'MACOS APP',
                    'DMG': 'DISK IMAGE', 'ISO': 'DISK IMAGE',
                    'JS': 'JAVASCRIPT', 'TS': 'TYPESCRIPT', 'PY': 'PYTHON',
                    'C': 'C SOURCE', 'CPP': 'C++ SOURCE', 'GO': 'GO SOURCE',
                    'HTML': 'HTML DOCUMENT', 'CSS': 'STYLESHEET', 'JSON': 'JSON DATA'
                };
                displayType = typeMap[ext] || (ext.length > 0 ? ext : 'FILE');
            }

            row.innerHTML = `
                <div class="list-main">
                    ${iconHtml}
                    <div class="list-info">
                        <span class="list-name">${item.name}</span>
                        <span class="list-details">${displayType}</span>
                    </div>
                </div>
                <div class="list-meta">
                    <span class="list-size">${size}</span>
                </div>
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
    document.getElementById("menu-share").classList.toggle("hidden", item.type === 'folder');
    document.getElementById("menu-open").classList.toggle("hidden", item.type !== 'folder');
}

document.onclick = () => contextMenu.classList.add("hidden");
window.onscroll = () => contextMenu.classList.add("hidden");
document.addEventListener('scroll', () => contextMenu.classList.add("hidden"), true);

document.getElementById("menu-download").onclick = () => {
    if (state.selectedItem) downloadFile(state.selectedItem.messageId, state.selectedItem.name);
};

document.getElementById("menu-share").onclick = async () => {
    if (!state.selectedItem) return;
    
    updateAuthStatus("GENERATING_SHARE_TOKEN...", "PROCESS");
    const res = await fetch("/api/files/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: state.selectedItem.messageId, name: state.selectedItem.name })
    });

    if (res.ok) {
        const data = await res.json();
        updateAuthStatus("SHARE_LINK_READY", "READY");
        showModal({
            title: "Neural Share Link",
            message: `Public download link generated:\n\n${data.shareUrl}`,
            confirmText: "Close"
        });
    } else {
        updateAuthStatus("SHARE_FAILED", "ERROR");
    }
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
        'psd': 'image', 'ai': 'image', 'eps': 'image',

        // Video
        'mp4': 'video', 'mkv': 'video', 'mov': 'video', 'webm': 'video', 'avi': 'video',
        'flv': 'video', 'wmv': 'video', 'm4v': 'video', '3gp': 'video', 'ts': 'video',

        // Music
        'mp3': 'music', 'wav': 'music', 'ogg': 'music', 'm4a': 'music', 'flac': 'music',
        'aac': 'music', 'wma': 'music', 'opus': 'music', 'mid': 'music',

        // Documents
        'pdf': 'file-text', 'doc': 'file-text', 'docx': 'file-text', 'txt': 'file-text',
        'md': 'file-text', 'rtf': 'file-text', 'odt': 'file-text', 'xls': 'file-text',
        'xlsx': 'file-text', 'ppt': 'presentation', 'pptx': 'presentation', 'csv': 'file-text',
        'epub': 'book', 'mobi': 'book', 'azw3': 'book',

        // Archives
        'zip': 'archive', 'rar': 'archive', '7z': 'archive', 'tar': 'archive', 'gz': 'archive',
        'bz2': 'archive', 'xz': 'archive', 'iso': 'archive', 'deb': 'archive', 'rpm': 'archive',

        // Code
        'js': 'code', 'ts': 'code', 'html': 'code', 'css': 'code', 'json': 'code',
        'py': 'code', 'java': 'code', 'cpp': 'code', 'c': 'code', 'go': 'code',
        'php': 'code', 'rb': 'code', 'sh': 'code', 'sql': 'code', 'rs': 'code',
        'vue': 'code', 'jsx': 'code', 'tsx': 'code', 'xml': 'code', 'yaml': 'code', 'yml': 'code',

        // Executables
        'exe': 'cpu', 'msi': 'cpu', 'apk': 'cpu', 'app': 'cpu', 'dmg': 'cpu', 'bin': 'cpu',
        'bat': 'terminal', 'cmd': 'terminal'
    };
    return iconMap[ext] || 'file';
}

function getFileCategory(name) {
    if (!name) return 'clr-default';
    const ext = name.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext)) return 'clr-image';
    if (['mp4', 'mkv', 'mov', 'webm', 'avi', 'ts'].includes(ext)) return 'clr-video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'].includes(ext)) return 'clr-audio';
    if (['pdf', 'doc', 'docx', 'txt', 'md', 'epub', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext)) return 'clr-doc';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(ext)) return 'clr-archive';
    if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'html', 'css', 'json', 'rs', 'vue', 'xml'].includes(ext)) return 'clr-code';
    if (['exe', 'msi', 'apk', 'dmg', 'bin', 'bat', 'cmd'].includes(ext)) return 'clr-code'; // Grouped with code for now
    
    return 'clr-default';
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
        const displayName = state.folderNames[folderId] || folderId;
        breadcrumbs.innerHTML += ` <span style="margin: 0 12px; opacity: 0.3;">/</span> <span style="color: var(--accent); font-weight: 700;">${displayName}</span>`;
    }
}

function updateAuthStatus(text, type) {
    if(authStatus) {
        authStatus.innerText = text;
        authStatus.style.color = type === "ERROR" ? "var(--danger)" : "var(--accent)";
        authStatus.classList.toggle("status-pulse", type === "PROCESS");
    }
}

// --- Event Listeners ---
if (navHome) navHome.onclick = () => showView('home');
if (navRecent) navRecent.onclick = () => showView('recent');
if (navFiles) navFiles.onclick = () => {
    showView('explorer');
    loadFiles('root');
};

document.getElementById("init-btn").onclick = initializeSystem;
document.getElementById("send-code-btn").onclick = sendCode;
document.getElementById("login-btn").onclick = login;
document.getElementById("sort-btn").onclick = async () => {
    const sortValue = await showModal({
        title: "Neural Sort Priority",
        message: "Choose how you want to organize your nodes:",
        selectedValue: state.sortBy,
        options: [
            { label: "Alphabetical (A-Z)", value: 'name', icon: 'type' },
            { label: "Neural Size (Largest)", value: 'size', icon: 'database' },
            { label: "Temporal Order (Newest)", value: 'date', icon: 'clock' }
        ]
    });

    if (sortValue) {
        state.sortBy = sortValue;
        updateAuthStatus(`SORT_BY:_${sortValue.toUpperCase()}`, "READY");
        renderFiles();
    }
};

document.getElementById("filter-btn").onclick = async () => {
    const filterValue = await showModal({
        title: "Category Filter",
        message: "Isolate specific data streams:",
        selectedValue: state.filterBy,
        options: [
            { label: "All Data Streams", value: 'all', icon: 'layers' },
            { label: "Visual (Images)", value: 'image', icon: 'image' },
            { label: "Dynamic (Videos)", value: 'video', icon: 'video' },
            { label: "Neural Code", value: 'code', icon: 'code' },
            { label: "Documents", value: 'doc', icon: 'file-text' },
            { label: "Audio Transmissions", value: 'audio', icon: 'music' },
            { label: "Archives", value: 'archive', icon: 'archive' }
        ]
    });

    if (filterValue) {
        state.filterBy = filterValue;
        updateAuthStatus(`FILTER_MODE:_${filterValue.toUpperCase()}`, "READY");
        renderFiles();
    }
};

document.getElementById("sync-btn").onclick = async () => {
    const btn = document.getElementById("sync-btn");
    const originalHtml = btn.innerHTML;
    
    // UI Loading State
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="status-pulse"></i> <span>Syncing...</span>`;
    if (window.lucide) lucide.createIcons();
    
    updateAuthStatus("SYNCING_CLOUD_INDEX..._SCANNING_TELEGRAM", "PROCESS");
    
    try {
        const res = await fetch("/api/files/sync", { method: "POST" });
        const data = await res.json();
        
        if (data.success) {
            updateAuthStatus(`SYNC_COMPLETE:_${data.addedCount}_ITEMS_PROCESSED`, "READY");
            loadFiles(state.currentPath);
        } else {
            updateAuthStatus("SYNC_FAILED", "ERROR");
        }
    } catch (e) {
        updateAuthStatus("NETWORK_ERROR_DURING_SYNC", "ERROR");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        if (window.lucide) lucide.createIcons();
    }
};

document.getElementById("remote-save-btn").onclick = async () => {
    const link = await showModal({
        title: "Remote Neural Save",
        message: "Paste a Telegram message link to save it directly to your drive:",
        showInput: true,
        confirmText: "Save to Drive"
    });

    if (!link) return;

    updateAuthStatus("FETCHING_REMOTE_NODE...", "PROCESS");
    try {
        const res = await fetch("/api/files/save-from-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ link, folderId: state.currentPath })
        });

        if (res.ok) {
            const data = await res.json();
            updateAuthStatus(`SAVED:_${data.fileName.toUpperCase()}`, "READY");
            loadFiles(state.currentPath);
        } else {
            const err = await res.json();
            updateAuthStatus("REMOTE_SAVE_FAILED", "ERROR");
            showModal({ title: "Fetch Error", message: err.error || "Could not retrieve the file from this link." });
        }
    } catch (e) {
        updateAuthStatus("NETWORK_ERROR", "ERROR");
    }
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
    
    const startTime = Date.now();
    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = event.loaded / elapsed;
            const speedText = formatBytes(speed) + "/s";
            updateAuthStatus(`UPLOADING_${file.name.toUpperCase()}..._${percent}%_(${speedText})`, "PROCESS");
        }
    };
    
    xhr.onload = () => {
        if (xhr.status === 200) {
            updateAuthStatus(`UPLOAD_COMPLETE:_${file.name.toUpperCase()}`, "READY");
            loadFiles(state.currentPath);
        } else {
            updateAuthStatus("UPLOAD_FAILED", "ERROR");
        }
    };
    
    xhr.onerror = () => updateAuthStatus("NETWORK_ERROR_DURING_UPLOAD", "ERROR");
    
    xhr.open("POST", "/api/files/upload");
    xhr.send(formData);
};
document.getElementById("logout-btn").onclick = async () => {
    try {
        await fetch("/api/auth/logout", { method: "POST" });
        location.reload();
    } catch (error) {
        console.error("Logout error:", error);
        location.reload();
    }
};

function updateStorageStats(items) {
    const totalSize = items.reduce((acc, item) => acc + (item.size || 0), 0);
    const usedText = document.getElementById("storage-used");
    const progress = document.getElementById("storage-progress");
    const percentageText = document.getElementById("storage-percentage");

    if (usedText && progress && percentageText) {
        usedText.innerText = formatBytes(totalSize);
        // Using an arbitrary 10GB as a "Neural Capacity" limit for visual effect
        const limit = 10 * 1024 * 1024 * 1024; 
        const percentage = Math.min(100, Math.round((totalSize / limit) * 100));
        progress.style.width = `${percentage}%`;
        percentageText.innerText = `${percentage}%`;
    }
}

// Initial Run
checkSession();
if (window.lucide) lucide.createIcons();
