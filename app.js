let currentDir = "";
let allFiles = []; 
let searchTimeout;
let isUserTyping = false;

// --- UTILITY: Clean Minecraft Color Codes ---
function stripColors(text) {
    if (!text) return "";
    // Removes standard §a and HEX §x§F§F§F § colors
    return text.replace(/§[0-9a-fk-orx]/gi, '').replace(/§x[0-9a-f]{6}/gi, '');
}

// --- TAB NAVIGATION ---
function showTab(tabId, el) {
    document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    if (tabId === 'tab-files') loadFiles();
}

// --- CONSOLE LOGIC ---
async function sendCommand(cmd) {
    const input = document.getElementById('consoleInput');
    let command = cmd || input.value;
    if(!command) return;

    // Auto-strip leading slash (RCON fails with slashes)
    if (command.startsWith('/')) command = command.substring(1);

    const logBox = document.getElementById('consoleLog');
    
    // UI: Show user command
    const userLine = document.createElement('div');
    userLine.style.color = "#22c55e";
    userLine.style.marginTop = "8px";
    userLine.innerHTML = `<strong>> ${command}</strong>`;
    logBox.appendChild(userLine);
    logBox.scrollTop = logBox.scrollHeight;

    if (!cmd) input.value = ""; 

    try {
        const res = await fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: command })
        });
        const data = await res.json();
        
        // UI: Show clean RCON Response
        const responseLine = document.createElement('div');
        responseLine.style.color = "#cbd5e1";
        responseLine.style.paddingLeft = "15px";
        responseLine.style.borderLeft = "2px solid #3b82f6";
        responseLine.innerText = stripColors(data.output);
        logBox.appendChild(responseLine);
        logBox.scrollTop = logBox.scrollHeight;
    } catch (e) {
        console.error("Command send failed.");
    }
}

// --- DASHBOARD UPDATER ---
async function updateDashboard() {
    try {
        const sRes = await fetch('/api/stats');
        const sData = await sRes.json();
        document.getElementById('cpuBar').style.width = sData.cpu + "%";
        document.getElementById('ramBar').style.width = sData.ram + "%";
        document.getElementById('cpuVal').innerText = sData.cpu + "%";
        document.getElementById('ramVal').innerText = sData.ram + "%";
        document.getElementById('playerCount').innerText = sData.players;

        // Prevent update while typing to stop log "jumping"
        if (!isUserTyping) {
            const lRes = await fetch('/api/logs');
            const lData = await lRes.json();
            const logBox = document.getElementById('consoleLog');
            if(logBox && lData.logs) {
                if(logBox.innerText.trim() !== lData.logs.trim()) {
                    logBox.innerText = lData.logs;
                    logBox.scrollTop = logBox.scrollHeight;
                }
            }
        }
    } catch (e) {}
}

// --- FILE SYSTEM (Search/Edit/Delete) ---
async function loadFiles(path = "") {
    currentDir = path;
    const breadcrumb = document.getElementById('currentPathDisplay');
    if (breadcrumb) breadcrumb.innerText = "Files: /" + path;
    try {
        const res = await fetch(`/api/files/list?path=${encodeURIComponent(path)}`);
        allFiles = await res.json();
        renderFileList(allFiles);
    } catch (e) { console.error("Explorer Error"); }
}

function renderFileList(files) {
    const list = document.getElementById('fileList');
    const query = document.getElementById('fileSearch').value.toLowerCase();
    list.innerHTML = "";

    if (currentDir) {
        const back = document.createElement('div');
        back.className = "file-item back-link";
        back.innerHTML = `<span>📁 .. (Go Back)</span>`;
        back.onclick = () => {
            const parts = currentDir.split('/');
            parts.pop();
            loadFiles(parts.join('/'));
        };
        list.appendChild(back);
    }

    files.forEach(file => {
        const div = document.createElement('div');
        div.className = "file-item";
        let displayName = file.name;
        if (query && displayName.toLowerCase().includes(query)) {
            const reg = new RegExp(`(${query})`, "gi");
            displayName = displayName.replace(reg, `<mark class="search-highlight">$1</mark>`);
        }
        div.innerHTML = `
            <div class="file-info">
                <span>${file.isDir ? '📁' : '📄'}</span>
                <span>${displayName}</span>
            </div>
            <div class="file-ops">
                <button class="btn-icon danger" onclick="deleteItem('${file.relPath}')">🗑️</button>
            </div>
        `;
        div.ondblclick = () => {
            if (file.isDir) loadFiles(file.relPath);
            else openEditor(file.relPath);
        };
        list.appendChild(div);
    });
}

function filterFiles() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = document.getElementById('fileSearch').value.toLowerCase();
        const filtered = allFiles.filter(f => f.name.toLowerCase().includes(query));
        renderFileList(filtered);
    }, 150);
}

async function openEditor(path) {
    const res = await fetch(`/api/files/read?path=${encodeURIComponent(path)}`);
    const data = await res.json();
    document.getElementById('fileEditorArea').value = data.content;
    document.getElementById('editorTitle').innerText = `Editing: ${path}`;
    document.getElementById('fileEditorContainer').setAttribute('data-current-file', path);
    document.getElementById('fileEditorContainer').style.display = 'flex';
}

async function saveFile() {
    const path = document.getElementById('fileEditorContainer').getAttribute('data-current-file');
    const content = document.getElementById('fileEditorArea').value;
    await fetch('/api/files/save', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ path, content }) 
    });
    document.getElementById('fileEditorContainer').style.display = 'none';
    loadFiles(currentDir);
}

async function deleteItem(path) {
    if (!confirm(`Delete ${path}?`)) return;
    await fetch('/api/files/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
    loadFiles(currentDir);
}

async function createNew(type) {
    const name = prompt(`Enter ${type} name:`); if (!name) return;
    const fullPath = currentDir ? `${currentDir}/${name}` : name;
    const endpoint = type === 'file' ? '/api/files/save' : '/api/files/mkdir';
    await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fullPath, content: "" }) });
    loadFiles(currentDir);
}

async function importFile(input) {
    if (!input.files.length) return;
    const formData = new FormData();
    formData.append("file", input.files[0]);
    await fetch(`/api/files/upload?path=${encodeURIComponent(currentDir)}`, { method: 'POST', body: formData });
    loadFiles(currentDir);
}

function closeEditor() { document.getElementById('fileEditorContainer').style.display = 'none'; }

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    const consoleInput = document.getElementById('consoleInput');
    
    if(consoleInput) {
        consoleInput.addEventListener("focus", () => isUserTyping = true);
        consoleInput.addEventListener("blur", () => isUserTyping = false);

        consoleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendCommand();
            }
        });
    }

    setInterval(updateDashboard, 2500); // 2.5 seconds for better stability
    updateDashboard();
});