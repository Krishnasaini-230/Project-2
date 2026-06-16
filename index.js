// ==========================================
// 1. THEME ENGINE 
// ==========================================
const themeCheckbox = document.getElementById('theme-toggle');

function initTheme() {
    const root = document.documentElement;
    if (localStorage.getItem('theme') === 'dark') {
        root.setAttribute('data-theme', 'dark');
        themeCheckbox.checked = true;
    } else {
        themeCheckbox.checked = false;
    }
}

themeCheckbox.addEventListener('change', (e) => {
    const root = document.documentElement;
    if (e.target.checked) {
        root.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        root.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
});

// ==========================================
// 2. STATE ARCHITECTURE (With WIP Limits)
// ==========================================
let boardState = [
  { id: "col-todo", title: "To Do", wipLimit: null, cards: [{ id: "c-1", text: "Wireframe UI", blockedBy: [] }] },
  { id: "col-in-progress", title: "In Progress", wipLimit: 3, cards: [{ id: "c-2", text: "Build Drag Logic", blockedBy: ["c-1"] }] },
  { id: "col-review", title: "Review", wipLimit: null, cards: [] },
  { id: "col-done", title: "Done", wipLimit: null, cards: [] }
];

function initBoard() {
    const hash = window.location.hash;
    
    if (hash.startsWith('#state=')) {
        try {
            const base64 = hash.replace('#state=', '');
            const jsonString = decodeURIComponent(escape(atob(base64)));
            const sharedData = JSON.parse(jsonString);
            
            if (Array.isArray(sharedData) && sharedData[0].hasOwnProperty('cards')) {
                boardState = sharedData;
                saveBoard(); 
                history.replaceState(null, null, window.location.pathname);
                showToast("Shared board loaded successfully!", "success");
            }
        } catch (error) {
            showToast("Invalid or corrupted share link.", "error");
            history.replaceState(null, null, window.location.pathname);
        }
    } else {
        const saved = localStorage.getItem("kanbanState");
        if (saved) boardState = JSON.parse(saved);
    }
    
    renderBoard(); 
}

function saveBoard() { localStorage.setItem("kanbanState", JSON.stringify(boardState)); }
function generateId() { return 'card-' + Math.random().toString(36).substr(2, 9); }

function findCardInState(cardId) {
    for (let col of boardState) {
        if (!col.cards) continue;
        const card = col.cards.find(c => c.id === cardId);
        if (card) return card;
    }
    return null;
}

// ==========================================
// 3. TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// 4. THE DEPENDENCY ENGINE (FIXED CYCLE CRASH)
// ==========================================
let isLinkingMode = false;
let linkingSourceId = null;

function createsCycle(targetId, sourceId, visited = new Set()) {
    if (targetId === sourceId) return true; 
    if (visited.has(targetId)) return false; 
    
    visited.add(targetId);
    
    const targetCard = findCardInState(targetId);
    if (!targetCard || !targetCard.blockedBy) return false;
    
    for (let blockerId of targetCard.blockedBy) {
        if (createsCycle(blockerId, sourceId, visited)) return true;
    }
    return false;
}

function startLinkingMode(sourceId) {
    isLinkingMode = true; linkingSourceId = sourceId;
    document.body.classList.add('linking-mode');
    document.getElementById('link-overlay').classList.remove('hidden');
    renderBoard(); 
}

function cancelLinkingMode() {
    isLinkingMode = false; linkingSourceId = null;
    document.body.classList.remove('linking-mode');
    document.getElementById('link-overlay').classList.add('hidden');
    renderBoard();
}

function finalizeLink(targetId) {
    if (targetId === linkingSourceId) { showToast("Cannot depend on itself.", "error"); cancelLinkingMode(); return; }
    if (createsCycle(targetId, linkingSourceId)) { showToast("Dependency loop detected!", "error"); cancelLinkingMode(); return; }

    const sourceCard = findCardInState(linkingSourceId);
    if (!sourceCard.blockedBy) sourceCard.blockedBy = [];
    
    if (!sourceCard.blockedBy.includes(targetId)) {
        sourceCard.blockedBy.push(targetId);
        showToast("Dependency established.", "success"); saveBoard();
    } else { showToast("Dependency already exists.", "error"); }
    cancelLinkingMode();
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isLinkingMode) cancelLinkingMode(); });

// ==========================================
// 5. CRASH-PROOF DRAG & DROP PHYSICS
// ==========================================
let draggedCardId = null;
let sourceColumnId = null;

function isCardBlocked(card) {
    if (!card || !card.blockedBy || card.blockedBy.length === 0) return false;
    const doneCol = boardState.find(col => col.id === 'col-done');
    if (!doneCol) return false;
    for (let blockerId of card.blockedBy) {
        const isFinished = doneCol.cards.some(c => c.id === blockerId);
        if (!isFinished) return true;
    }
    return false;
}

function triggerCardError(cardId) {
    const el = document.querySelector(`[data-id="${cardId}"]`);
    if(el) {
        el.classList.add('shake-error');
        setTimeout(() => { el.classList.remove('shake-error'); renderBoard(); }, 400);
    }
}

function setupDragEvents() {
    const cards = document.querySelectorAll('.card');
    const columns = document.querySelectorAll('.card-list');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            if(isLinkingMode) { e.preventDefault(); return; }
            draggedCardId = card.dataset.id;
            sourceColumnId = card.closest('.card-list').dataset.columnId;
            card.classList.add('is-dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            columns.forEach(col => col.parentElement.classList.remove('drag-over'));
            renderBoard();
        });
    });

    columns.forEach(list => {
        list.addEventListener('dragover', e => {
            if(isLinkingMode) return;
            e.preventDefault(); 
            list.parentElement.classList.add('drag-over');
            
            const afterElement = getDragAfterElement(list, e.clientY);
            const draggable = document.querySelector('.is-dragging');
            if (draggable) {
                if (afterElement == null) { list.appendChild(draggable); } 
                else { list.insertBefore(draggable, afterElement); }
            }
        });

        list.addEventListener('dragleave', () => { list.parentElement.classList.remove('drag-over'); });

        list.addEventListener('drop', e => {
            if(isLinkingMode) return;
            e.preventDefault(); 
            list.parentElement.classList.remove('drag-over');
            
            const targetColumnId = list.dataset.columnId;
            const cardObject = findCardInState(draggedCardId);
            const targetColObject = boardState.find(c => c.id === targetColumnId);
            
            if (!cardObject || !targetColObject) { renderBoard(); return; }

            if (sourceColumnId !== targetColumnId) {
                if (targetColObject.wipLimit !== null && targetColObject.cards.length >= targetColObject.wipLimit) {
                    triggerCardError(draggedCardId);
                    showToast(`WIP Limit Reached for ${targetColObject.title}`, "error");
                    return;
                }

                // AGILE WORKFLOW: Only block entry into Terminal Columns
                const strictColumns = ['col-review', 'col-done'];
                if (strictColumns.includes(targetColumnId) && isCardBlocked(cardObject)) {
                    triggerCardError(draggedCardId);
                    showToast("Clear dependencies before review/completion.", "error");
                    return; 
                }
            }

            const domCards = [...list.querySelectorAll('.card')];
            const newDomIndex = domCards.findIndex(c => c.dataset.id === draggedCardId);

            updateStateAfterDrop(draggedCardId, sourceColumnId, targetColumnId, newDomIndex);
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.card:not(.is-dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
        else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateStateAfterDrop(cardId, sourceColId, targetColId, newDomIndex) {
    const sourceCol = boardState.find(c => c.id === sourceColId);
    const targetCol = boardState.find(c => c.id === targetColId);
    
    if (!sourceCol || !targetCol) return;

    const cardIndex = sourceCol.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) { renderBoard(); return; }

    const [movedCard] = sourceCol.cards.splice(cardIndex, 1);
    if (!movedCard) return; 
    
    if (newDomIndex !== undefined && newDomIndex >= 0 && newDomIndex <= targetCol.cards.length) {
        targetCol.cards.splice(newDomIndex, 0, movedCard);
    } else {
        targetCol.cards.push(movedCard);
    }
    
    saveBoard(); 
    renderBoard(); 
}

// ==========================================
// 6. DOM RENDERING & CORE LOGIC
// ==========================================
const boardContainer = document.getElementById('board-container');

function deleteCard(cardId) {
    if (!confirm("Are you sure you want to delete this task?")) return;
    for (let col of boardState) {
        if(!col.cards) continue;
        const index = col.cards.findIndex(c => c.id === cardId);
        if (index !== -1) { col.cards.splice(index, 1); break; }
    }
    for (let col of boardState) {
        if(!col.cards) continue;
        for (let card of col.cards) {
            if (card.blockedBy && card.blockedBy.includes(cardId)) {
                card.blockedBy = card.blockedBy.filter(id => id !== cardId);
            }
        }
    }
    saveBoard(); renderBoard(); showToast("Task deleted.", "info");
}

function moveCardMobile(cardId, currentColId) {
    const currentColIndex = boardState.findIndex(c => c.id === currentColId);
    if (currentColIndex < boardState.length - 1) {
        const nextCol = boardState[currentColIndex + 1];
        const cardObj = findCardInState(cardId);
        
        if (nextCol.wipLimit !== null && nextCol.cards.length >= nextCol.wipLimit) {
            showToast(`WIP Limit Reached for ${nextCol.title}`, "error"); return;
        }
        
        // AGILE WORKFLOW: Block only on terminal columns for mobile too
        const strictColumns = ['col-review', 'col-done'];
        if (strictColumns.includes(nextCol.id) && isCardBlocked(cardObj)) { 
            showToast("Clear dependencies before review/completion.", "error"); return; 
        }
        
        updateStateAfterDrop(cardId, currentColId, nextCol.id);
    }
}

function renderBoard() {
  try {
      const fragment = document.createDocumentFragment();

      boardState.forEach((col, colIndex) => {
        if(!col.cards) col.cards = []; 
        const colEl = document.createElement('div');
        colEl.className = 'column';
        
        const wipDisplay = col.wipLimit !== null ? ` / ${col.wipLimit}` : ' / ∞';
        const isAtLimit = col.wipLimit !== null && col.cards.length >= col.wipLimit;
        const limitStyle = isAtLimit ? 'color: var(--error);' : '';

        // FIX: Replaced setWipLimit trigger with openWipModal
        colEl.innerHTML = `<div class="column-header">
            <span>${col.title}</span> 
            <span class="wip-limit" style="${limitStyle}" onclick="openWipModal('${col.id}')" title="Click to set Work-In-Progress limit">
                ${col.cards.length}${wipDisplay}
            </span>
        </div>`;
        
        const listEl = document.createElement('div');
        listEl.className = 'card-list';
        listEl.dataset.columnId = col.id;

        col.cards.forEach(card => {
          if(!card || !card.id) return; 

          const cardEl = document.createElement('div');
          cardEl.className = 'card';
          if(isLinkingMode && card.id === linkingSourceId) cardEl.classList.add('is-link-source');
          if(!isLinkingMode) cardEl.draggable = true;
          cardEl.dataset.id = card.id;
          
          const isBlocked = isCardBlocked(card);
          let blockingNames = [];
          if (isBlocked) {
              cardEl.classList.add('is-blocked');
              const doneCol = boardState.find(c => c.id === 'col-done');
              card.blockedBy.forEach(blockerId => {
                  const isFinished = doneCol && doneCol.cards.some(c => c.id === blockerId);
                  if (!isFinished) {
                      const blockerCard = findCardInState(blockerId);
                      if (blockerCard) blockingNames.push(blockerCard.text);
                  }
              });
          }

          let nextColText = "";
          if (colIndex < boardState.length - 1) {
              nextColText = `Move to ${boardState[colIndex + 1].title} →`;
          }

          cardEl.innerHTML = `
              <div class="card-header">
                  <span class="card-text"></span> 
                  <div class="card-actions">
                      ${!isLinkingMode ? `
                          <button class="card-link-btn" title="Add Dependency">🔗</button>
                          <button class="card-delete-btn" title="Delete Task">🗑️</button>
                      ` : ''}
                  </div>
              </div>
              ${isBlocked && blockingNames.length > 0 ? `
                  <div class="dependency-container">
                      <span class="dependency-badge">🔒 Waiting on:</span>
                      <ul class="blocker-list">
                          ${blockingNames.map(name => `<li title="${name}">${name}</li>`).join('')}
                      </ul>
                  </div>
              ` : ''}
              ${nextColText ? `<button class="mobile-move-btn" onclick="moveCardMobile('${card.id}', '${col.id}')">${nextColText}</button>` : ''}
          `;
          
          cardEl.querySelector('.card-text').textContent = card.text || "Untitled Task";
          
          const linkBtn = cardEl.querySelector('.card-link-btn');
          if(linkBtn) { linkBtn.addEventListener('click', (e) => { e.stopPropagation(); startLinkingMode(card.id); }); }
          
          const deleteBtn = cardEl.querySelector('.card-delete-btn');
          if(deleteBtn) { deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteCard(card.id); }); }

          cardEl.addEventListener('click', (e) => { if (isLinkingMode) { e.stopPropagation(); finalizeLink(card.id); } });

          listEl.appendChild(cardEl);
        });

        colEl.appendChild(listEl);
        fragment.appendChild(colEl);
      });

      boardContainer.innerHTML = ''; 
      boardContainer.appendChild(fragment);
      setupDragEvents(); 

  } catch (error) {
      console.error("Fatal Application Error intercepted.", error);
      showToast("Detected board corruption. Please reload or reset.", "error");
  }
}

// ==========================================
// 7. DATA PORTABILITY
// ==========================================
document.getElementById('share-btn').addEventListener('click', () => {
    try {
        const jsonString = JSON.stringify(boardState);
        const base64 = btoa(unescape(encodeURIComponent(jsonString)));
        const shareUrl = `${window.location.origin}${window.location.pathname}#state=${base64}`;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast("Share link copied to clipboard!", "success");
        }).catch(() => {
            prompt("Copy this link to share your board:", shareUrl);
        });
    } catch (error) {
        showToast("Failed to generate link. Board might be too large.", "error");
    }
});

document.getElementById('export-btn').addEventListener('click', () => {
    const dataStr = JSON.stringify(boardState, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url; a.download = "kanban-backup.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Board exported successfully.");
});

document.getElementById('import-btn-trigger').addEventListener('click', () => {
    document.getElementById('import-input').click();
});

document.getElementById('import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const uploadedData = JSON.parse(event.target.result);
            if (Array.isArray(uploadedData) && uploadedData[0].hasOwnProperty('cards')) {
                boardState = uploadedData;
                saveBoard(); renderBoard(); showToast("Board imported successfully.");
            } else { throw new Error("Invalid format"); }
        } catch (error) { showToast("Failed to import. Invalid JSON file.", "error"); }
    };
    reader.readAsText(file);
    e.target.value = ''; 
});

// ==========================================
// 8. ASYNCHRONOUS MODAL LOGIC (Tasks & WIP)
// ==========================================
const modalOverlay = document.getElementById('task-modal');
const taskInput = document.getElementById('new-task-input');

function openModal() { modalOverlay.classList.remove('hidden'); taskInput.value = ''; setTimeout(() => taskInput.focus(), 50); }
function closeModal() { modalOverlay.classList.add('hidden'); }
function submitNewTask() {
    const text = taskInput.value.trim();
    if(text !== "") {
        boardState[0].cards.push({ id: generateId(), text: text, blockedBy: [] });
        saveBoard(); renderBoard(); closeModal(); showToast("Task created.");
    }
}

document.getElementById('add-task-trigger').addEventListener('click', openModal);
document.getElementById('cancel-task-btn').addEventListener('click', closeModal);
document.getElementById('submit-task-btn').addEventListener('click', submitNewTask);
taskInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitNewTask(); });
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

// NEW: Custom WIP Modal Logic
let activeWipColId = null;
const wipModal = document.getElementById('wip-modal');
const wipInput = document.getElementById('wip-input');

function openWipModal(colId) {
    activeWipColId = colId;
    const col = boardState.find(c => c.id === colId);
    if (!col) return;
    
    // Pre-fill existing limit, or leave empty
    wipInput.value = col.wipLimit !== null ? col.wipLimit : '';
    wipModal.classList.remove('hidden');
    setTimeout(() => wipInput.focus(), 50);
}

function closeWipModal() {
    wipModal.classList.add('hidden');
    activeWipColId = null;
}

function submitWipLimit() {
    if (!activeWipColId) return;
    
    const col = boardState.find(c => c.id === activeWipColId);
    const val = wipInput.value.trim();
    
    if (val === '') {
        col.wipLimit = null; // Strip the limit
        showToast(`WIP limit removed for ${col.title}`, "info");
    } else {
        const num = parseInt(val, 10);
        if (isNaN(num) || num <= 0) {
            showToast("Please enter a valid positive number.", "error");
            return;
        }
        col.wipLimit = num;
        showToast(`WIP limit updated to ${num}`, "success");
    }
    
    saveBoard();
    renderBoard();
    closeWipModal();
}

document.getElementById('cancel-wip-btn').addEventListener('click', closeWipModal);
document.getElementById('submit-wip-btn').addEventListener('click', submitWipLimit);
wipInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') submitWipLimit(); });
wipModal.addEventListener('click', (e) => { if (e.target === wipModal) closeWipModal(); });

// Boot the application
initTheme();
initBoard();