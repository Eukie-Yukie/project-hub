/* ==========================================================
   PROJECT HUB - FULL MONGODB ATLAS CONNECTED CLIENT
   ========================================================= */

const API_BASE = window.location.origin + "/api";

let currentUser = null;
let projects = [];
let customCategories = ["3D / Blender", "Web Dev", "Networking", "System", "Game Dev", "Other / General"];
let activeProjectId = null;
let activeCategoryFilter = "All";
let activeTabFilter = "all";
let isReadOnlyMode = false;

// Ephemeral avatar and file uploads
let tempRegisterAvatarBase64 = null;
let tempSettingsAvatarBase64 = null;
let tempImgBase64 = null;
let tempFileInfo = null;

function getToken() {
  return localStorage.getItem('token');
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!isReadOnlyMode && (response.status === 401 || response.status === 403)) {
    handleLogout();
    throw new Error("Session expired. Please sign in again.");
  }
  return response;
}

document.addEventListener("DOMContentLoaded", async () => {
  setupAuth();
  setupSettingsModal();
  setupShareFeature();
  setupMobileDrawer();
  setupCategoryHorizontalScroll();

  // Check if viewing via a public share link (e.g., ?share=651fc89...)
  const urlParams = new URLSearchParams(window.location.search);
  const sharedProjectId = urlParams.get('share');

  if (sharedProjectId) {
    await loadSharedProject(sharedProjectId);
  } else {
    const token = getToken();
    if (token) {
      try {
        await loadProfile();
        await fetchProjects();
      } catch {
        showAuthOverlay(true);
      }
    } else {
      showAuthOverlay(true);
    }
  }

  attachEventListeners();
});

/* MOUSE WHEEL & DRAG-TO-SCROLL FOR CATEGORY PILLS */
function setupCategoryHorizontalScroll() {
  const slider = document.getElementById("category-pills");
  if (!slider) return;

  // 1. Mouse Scroll Wheel Support (Vertical scroll moves left/right)
  slider.addEventListener("wheel", (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      slider.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // 2. Click and Drag to Scroll Support
  let isDown = false;
  let startX;
  let scrollLeft;

  slider.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("cat-del-btn")) return;
    isDown = true;
    slider.classList.add("dragging");
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });

  slider.addEventListener("mouseleave", () => {
    isDown = false;
    slider.classList.remove("dragging");
  });

  slider.addEventListener("mouseup", () => {
    isDown = false;
    slider.classList.remove("dragging");
  });

  slider.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.5;
    slider.scrollLeft = scrollLeft - walk;
  });
}

/* MOBILE HAMBURGER & DRAWER CONTROLLER */
function setupMobileDrawer() {
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  const btnOpen = document.getElementById("btn-open-sidebar");
  const btnClose = document.getElementById("btn-close-sidebar");

  function openSidebar() {
    sidebar.classList.add("mobile-open");
    backdrop.classList.add("active");
  }

  function closeSidebar() {
    sidebar.classList.remove("mobile-open");
    backdrop.classList.remove("active");
  }

  if (btnOpen) btnOpen.addEventListener("click", openSidebar);
  if (btnClose) btnClose.addEventListener("click", closeSidebar);
  if (backdrop) backdrop.addEventListener("click", closeSidebar);

  document.getElementById("project-folders-list").addEventListener("click", () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
}

/* PUBLIC SHARED PROJECT LOADER */
async function loadSharedProject(projectId) {
  isReadOnlyMode = true;
  showAuthOverlay(false);
  document.getElementById("shared-view-banner").classList.remove("hidden");

  document.getElementById("btn-new-project").classList.add("hidden");
  document.getElementById("btn-edit-details").classList.add("hidden");
  document.getElementById("btn-header-delete-proj").classList.add("hidden");
  document.getElementById("btn-add-activity").classList.add("hidden");
  document.getElementById("btn-open-settings").classList.add("hidden");

  try {
    const res = await fetch(`${API_BASE}/public/projects/${projectId}`);
    if (!res.ok) throw new Error("Could not load shared project.");
    const project = await res.json();

    projects = [project];
    activeProjectId = project._id;

    if (project.userId) {
      document.getElementById("sidebar-user-name").innerText = project.userId.name;
      document.getElementById("sidebar-user-email").innerText = "Shared project";
      if (project.userId.avatar) {
        const img = document.getElementById("sidebar-user-avatar-img");
        img.src = project.userId.avatar;
        img.classList.remove("hidden");
        document.getElementById("sidebar-user-avatar").classList.add("hidden");
      }
    }

    renderSidebar();
    renderProjectWorkspace();
  } catch (err) {
    alert("Error: " + err.message);
    window.location.href = window.location.origin;
  }
}

/* SHARE LINK HANDLER */
function setupShareFeature() {
  const shareBtn = document.getElementById("btn-share-project");
  const exitSharedBtn = document.getElementById("btn-exit-shared");

  shareBtn.addEventListener("click", () => {
    if (!activeProjectId) {
      alert("Please select a project first.");
      return;
    }
    const shareUrl = `${window.location.origin}/?share=${activeProjectId}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast("Share link copied to clipboard!");
    }).catch(() => {
      prompt("Copy your project share link:", shareUrl);
    });
  });

  exitSharedBtn.addEventListener("click", () => {
    window.location.href = window.location.origin;
  });
}

function showToast(message) {
  const toast = document.getElementById("toast-message");
  toast.innerText = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

/* AUTH & HERO CONTROLLER */
function setupAuth() {
  const heroView = document.getElementById("landing-hero-view");
  const authCard = document.getElementById("auth-card-box");
  const heroBtnLogin = document.getElementById("hero-btn-login");
  const heroBtnSignup = document.getElementById("hero-btn-signup");
  const btnCloseAuth = document.getElementById("btn-close-auth-card");

  const tabLogin = document.getElementById("tab-login-btn");
  const tabRegister = document.getElementById("tab-register-btn");
  const loginForm = document.getElementById("login-form");
  const regForm = document.getElementById("register-form");
  const errBox = document.getElementById("auth-error-msg");

  function openLogin() {
    heroView.classList.add("hidden");
    authCard.classList.remove("hidden");
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    regForm.classList.add("hidden");
    errBox.classList.add("hidden");
  }

  function openRegister() {
    heroView.classList.add("hidden");
    authCard.classList.remove("hidden");
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    regForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    errBox.classList.add("hidden");

    tempRegisterAvatarBase64 = null;
    const img = document.getElementById("avatar-img-preview");
    if (img) { img.src = ""; img.classList.add("hidden"); }
    const placeholder = document.getElementById("avatar-placeholder-icon");
    if (placeholder) placeholder.classList.remove("hidden");
  }

  heroBtnLogin.addEventListener("click", openLogin);
  heroBtnSignup.addEventListener("click", openRegister);
  tabLogin.addEventListener("click", openLogin);
  tabRegister.addEventListener("click", openRegister);

  btnCloseAuth.addEventListener("click", () => {
    authCard.classList.add("hidden");
    heroView.classList.remove("hidden");
  });

  const avatarBox = document.getElementById("avatar-preview-box");
  const avatarInput = document.getElementById("reg-avatar-input");
  avatarBox.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      tempRegisterAvatarBase64 = ev.target.result;
      const img = document.getElementById("avatar-img-preview");
      img.src = tempRegisterAvatarBase64;
      img.classList.remove("hidden");
      document.getElementById("avatar-placeholder-icon").classList.add("hidden");
    };
    reader.readAsDataURL(file);
  });

  // Login Form
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem('token', data.token);
      currentUser = data.user;
      updateUserSidebar();
      showAuthOverlay(false);
      await fetchProjects();
    } catch (err) {
      errBox.innerText = err.message;
      errBox.classList.remove("hidden");
    }
  });

  // Register Form
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.classList.add("hidden");

    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          avatar: tempRegisterAvatarBase64 || null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      localStorage.setItem('token', data.token);
      currentUser = data.user;
      updateUserSidebar();
      showAuthOverlay(false);
      await fetchProjects();
    } catch (err) {
      errBox.innerText = err.message;
      errBox.classList.remove("hidden");
    }
  });

  document.getElementById("btn-logout").addEventListener("click", handleLogout);
}

function handleLogout() {
  localStorage.removeItem('token');
  currentUser = null;
  projects = [];
  activeProjectId = null;
  showAuthOverlay(true);
}

async function loadProfile() {
  const res = await apiFetch('/auth/me');
  if (res.ok) {
    currentUser = await res.json();
    updateUserSidebar();
    showAuthOverlay(false);
  }
}

function showAuthOverlay(show) {
  const overlay = document.getElementById("auth-overlay");
  const heroView = document.getElementById("landing-hero-view");
  const authCard = document.getElementById("auth-card-box");

  if (show) {
    overlay.classList.remove("hidden");
    heroView.classList.remove("hidden");
    authCard.classList.add("hidden");
  } else {
    overlay.classList.add("hidden");
  }
}

function updateUserSidebar() {
  if (!currentUser) return;
  document.getElementById("sidebar-user-name").innerText = currentUser.name;
  document.getElementById("sidebar-user-email").innerText = currentUser.email;

  const avatarDiv = document.getElementById("sidebar-user-avatar");
  const avatarImg = document.getElementById("sidebar-user-avatar-img");

  if (currentUser.avatar) {
    avatarImg.src = currentUser.avatar;
    avatarImg.classList.remove("hidden");
    avatarDiv.classList.add("hidden");
  } else {
    avatarImg.classList.add("hidden");
    avatarDiv.classList.remove("hidden");
    const initials = currentUser.name ? currentUser.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() : "U";
    avatarDiv.innerText = initials || "U";
  }
}

/* SETTINGS MODAL */
function setupSettingsModal() {
  const btnOpenSettings = document.getElementById("btn-open-settings");
  const settingsModal = document.getElementById("settings-modal");
  const settingsForm = document.getElementById("settings-form");
  const avatarBox = document.getElementById("settings-avatar-preview-box");
  const avatarInput = document.getElementById("settings-avatar-input");
  const btnRemoveAvatar = document.getElementById("btn-remove-settings-avatar");

  btnOpenSettings.addEventListener("click", () => {
    if (!currentUser) return;
    document.getElementById("settings-name-input").value = currentUser.name || "";
    document.getElementById("settings-email-input").value = currentUser.email || "";

    tempSettingsAvatarBase64 = currentUser.avatar || null;
    renderSettingsAvatarPreview(tempSettingsAvatarBase64);

    settingsModal.classList.add("active");
  });

  avatarBox.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      tempSettingsAvatarBase64 = ev.target.result;
      renderSettingsAvatarPreview(tempSettingsAvatarBase64);
    };
    reader.readAsDataURL(file);
  });

  btnRemoveAvatar.addEventListener("click", () => {
    tempSettingsAvatarBase64 = null;
    avatarInput.value = "";
    renderSettingsAvatarPreview(null);
  });

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newName = document.getElementById("settings-name-input").value.trim();

    try {
      const res = await apiFetch('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: newName,
          avatar: tempSettingsAvatarBase64
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");

      currentUser = data.user;
      updateUserSidebar();
      settingsModal.classList.remove("active");
    } catch (err) {
      alert("Error saving settings: " + err.message);
    }
  });
}

function renderSettingsAvatarPreview(avatarSrc) {
  const imgTag = document.getElementById("settings-avatar-img-preview");
  const placeholder = document.getElementById("settings-avatar-placeholder-icon");
  if (avatarSrc) {
    imgTag.src = avatarSrc;
    imgTag.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    imgTag.src = "";
    imgTag.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

/* FETCH PROJECTS FROM MONGODB */
async function fetchProjects() {
  try {
    const res = await apiFetch('/projects');
    projects = await res.json();
    if (projects.length > 0 && (!activeProjectId || !projects.find(p => p._id === activeProjectId))) {
      activeProjectId = projects[0]._id;
    }
    renderSidebar();
    renderProjectWorkspace();
  } catch (err) {
    console.error("Error fetching projects:", err);
  }
}

function updateCounts() {
  document.getElementById("total-proj-count").innerText = projects.length;
  document.getElementById("fav-proj-count").innerText = projects.filter(p => p.favorite).length;
}

/* SIDEBAR & WORKSPACE RENDERERS */
function renderSidebar() {
  updateCounts();

  const catSet = new Set(["All", ...customCategories]);
  projects.forEach(p => { if (p.category && p.category.trim()) catSet.add(p.category.trim()); });

  const catContainer = document.getElementById("category-pills");
  catContainer.innerHTML = "";

  catSet.forEach(cat => {
    const pill = document.createElement("button");
    pill.className = `cat-pill ${activeCategoryFilter.toLowerCase() === cat.toLowerCase() ? 'active' : ''}`;
    
    const labelSpan = document.createElement("span");
    labelSpan.innerText = cat;
    pill.appendChild(labelSpan);

    if (!isReadOnlyMode && cat !== "All") {
      const delBtn = document.createElement("span");
      delBtn.className = "cat-del-btn";
      delBtn.title = `Delete category "${cat}"`;
      delBtn.innerHTML = "&times;";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (confirm(`Delete category "${cat}"? Projects will be reassigned to "Other / General".`)) {
          customCategories = customCategories.filter(c => c.toLowerCase() !== cat.toLowerCase());
          for (const p of projects) {
            if (p.category && p.category.toLowerCase() === cat.toLowerCase()) {
              await apiFetch(`/projects/${p._id}`, { method: 'PUT', body: JSON.stringify({ ...p, category: "Other / General" }) });
            }
          }
          await fetchProjects();
        }
      });
      pill.appendChild(delBtn);
    }

    pill.addEventListener("click", () => {
      activeCategoryFilter = cat;
      renderSidebar();
    });
    catContainer.appendChild(pill);
  });

  const folderContainer = document.getElementById("project-folders-list");
  const searchVal = document.getElementById("search-input").value.toLowerCase();
  folderContainer.innerHTML = "";

  const filtered = projects.filter(p => {
    const matchesCat = activeCategoryFilter === "All" || (p.category && p.category.toLowerCase() === activeCategoryFilter.toLowerCase());
    const matchesTab = activeTabFilter === "all" || (activeTabFilter === "fav" && p.favorite);
    const matchesSearch = p.name.toLowerCase().includes(searchVal) || (p.description && p.description.toLowerCase().includes(searchVal));
    return matchesCat && matchesTab && matchesSearch;
  });

  filtered.forEach(p => {
    const item = document.createElement("div");
    item.className = `folder-item ${p._id === activeProjectId ? 'active' : ''}`;
    item.innerHTML = `
      <div class="folder-icon">${p.icon || '📁'}</div>
      <div class="folder-meta">
        <div class="folder-name">${p.name}</div>
        <div class="folder-sub">${p.activities ? p.activities.length : 0} acts</div>
      </div>
      ${!isReadOnlyMode ? `
      <div class="folder-item-actions">
        <button class="folder-star-btn ${p.favorite ? 'starred' : ''}" title="${p.favorite ? 'Remove favorite' : 'Favorite'}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
        <button class="folder-delete-btn" title="Delete project folder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>` : ''}
    `;

    item.addEventListener("click", (e) => {
      if (e.target.closest('.folder-star-btn') || e.target.closest('.folder-delete-btn')) return;
      activeProjectId = p._id;
      renderSidebar();
      renderProjectWorkspace();
    });

    if (!isReadOnlyMode) {
      item.querySelector('.folder-star-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await apiFetch(`/projects/${p._id}`, { method: 'PUT', body: JSON.stringify({ ...p, favorite: !p.favorite }) });
        await fetchProjects();
      });

      item.querySelector('.folder-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const count = p.activities ? p.activities.length : 0;
        if (confirm(`Delete "${p.name}"? This removes all ${count} activities permanently!`)) {
          await apiFetch(`/projects/${p._id}`, { method: 'DELETE' });
          await fetchProjects();
        }
      });
    }

    folderContainer.appendChild(item);
  });
}

// Downloads binary file on-demand for both dashboard owners and public guests
async function downloadActivityFile(projectId, actId) {
  try {
    const endpoint = `${API_BASE}/public/projects/${projectId}/activities/${actId}/download`;
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "File download failed");

    const link = document.createElement("a");
    link.href = data.fileData;
    link.download = data.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    alert("Download failed: " + err.message);
  }
}

function renderProjectWorkspace() {
  const project = projects.find(p => p._id === activeProjectId);
  const container = document.getElementById("acts-container");
  container.innerHTML = "";

  if (!project) {
    document.getElementById("bc-category").innerText = "None";
    document.getElementById("bc-name").innerText = "No Project Selected";
    document.getElementById("project-name-display").innerText = "Select or create a folder";
    document.getElementById("project-desc-display").innerText = "Use '+ New project' in the sidebar to get started.";
    document.getElementById("stat-acts-count").innerText = "0";
    document.getElementById("stat-media-count").innerText = "0";
    document.getElementById("stat-files-count").innerText = "0";
    return;
  }

  document.getElementById("bc-category").innerText = project.category || "General";
  document.getElementById("bc-name").innerText = project.name;
  document.getElementById("project-icon-badge").innerText = project.icon || "📁";
  document.getElementById("project-name-display").innerText = project.name;
  document.getElementById("project-cat-badge").innerText = project.category || "General";
  document.getElementById("project-desc-display").innerText = project.description || "No description provided.";

  const acts = project.activities || [];
  document.getElementById("stat-acts-count").innerText = acts.length;
  document.getElementById("stat-media-count").innerText = acts.filter(a => a.image).length;
  document.getElementById("stat-files-count").innerText = acts.filter(a => a.fileName).length;

  acts.forEach(act => {
    const card = document.createElement("div");
    card.className = "act-card";
    const statusClass = act.status === "Completed" ? "status-pill-completed" : "status-pill-progress";
    const tagsHtml = (act.tags || []).map(t => `<span class="card-tag">${t}</span>`).join(" ");

    card.innerHTML = `
      <div class="card-media-box">
        ${act.image ? `<img src="${act.image}" class="card-img-tag" alt="${act.title}">` : `<div class="card-empty-thumb"><span>No Image</span></div>`}
        <span class="card-floating-status ${statusClass}">${act.status || 'In Progress'}</span>
      </div>
      <div class="card-info">
        <div class="card-meta-line">
          <span class="card-date">${act.date || 'Oct 2026'}</span>
          ${act.fileName ? `<a href="javascript:void(0)" class="card-file-link btn-dl" title="Click to download ${act.fileName}">📥 ${act.fileName}</a>` : `<span style="color:#525a75;font-size:11px;">No file linked</span>`}
        </div>
        <h3 class="card-title">${act.title}</h3>
        <p class="card-desc">${act.notes || 'No description provided.'}</p>
        ${tagsHtml ? `<div class="card-tags-row">${tagsHtml}</div>` : ''}
      </div>
      <div class="card-bottom-bar">
        <span style="font-size:11px;color:#555f7d;">${act.fileSize || ''}</span>
        ${!isReadOnlyMode ? `
        <div class="card-action-btns">
          <button class="card-btn btn-edit-act" title="Edit Act">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="card-btn del btn-del-act" title="Delete Act">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>` : ''}
      </div>
    `;

    // Download action
    const dlBtn = card.querySelector(".btn-dl");
    if (dlBtn && act.fileName) {
      dlBtn.addEventListener("click", (e) => {
        e.preventDefault();
        downloadActivityFile(project._id, act._id);
      });
    }

    if (act.image) {
      card.querySelector(".card-media-box").addEventListener("click", () => {
        document.getElementById("lightbox-img").src = act.image;
        document.getElementById("lightbox").classList.add("active");
      });
    }

    if (!isReadOnlyMode) {
      card.querySelector(".btn-edit-act").addEventListener("click", () => openActivityModal(act));
      card.querySelector(".btn-del-act").addEventListener("click", async () => {
        if (confirm(`Delete "${act.title}"?`)) {
          await apiFetch(`/projects/${project._id}/activities/${act._id}`, { method: 'DELETE' });
          await fetchProjects();
        }
      });
    }

    container.appendChild(card);
  });
}

function attachEventListeners() {
  document.getElementById("search-input").addEventListener("input", renderSidebar);

  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeTabFilter = tab.getAttribute("data-tab");
      renderSidebar();
    });
  });

  document.getElementById("btn-show-all-cats").addEventListener("click", () => {
    activeCategoryFilter = "All";
    renderSidebar();
  });

  document.getElementById("btn-new-project").addEventListener("click", () => openProjectModal());

  document.getElementById("btn-edit-details").addEventListener("click", () => {
    const curr = projects.find(p => p._id === activeProjectId);
    if (curr) openProjectModal(curr);
  });

  document.getElementById("btn-header-delete-proj").addEventListener("click", async () => {
    const curr = projects.find(p => p._id === activeProjectId);
    if (curr && confirm(`Permanently delete "${curr.name}" and all attached acts?`)) {
      await apiFetch(`/projects/${curr._id}`, { method: 'DELETE' });
      await fetchProjects();
    }
  });

  document.getElementById("btn-add-activity").addEventListener("click", () => {
    if (!activeProjectId) return alert("Select or create a project folder first.");
    openActivityModal();
  });

  document.querySelectorAll("[data-close]").forEach(b => {
    b.addEventListener("click", () => document.getElementById(b.getAttribute("data-close")).classList.remove("active"));
  });

  document.getElementById("lightbox-close").addEventListener("click", () => {
    document.getElementById("lightbox").classList.remove("active");
  });

  // Grid / List View Toggles
  const actsContainer = document.getElementById("acts-container");
  const btnGridView = document.getElementById("btn-grid-view");
  const btnListView = document.getElementById("btn-list-view");

  btnGridView.addEventListener("click", () => {
    btnGridView.classList.add("active");
    btnListView.classList.remove("active");
    actsContainer.classList.remove("list-mode");
  });

  btnListView.addEventListener("click", () => {
    btnListView.classList.add("active");
    btnGridView.classList.remove("active");
    actsContainer.classList.add("list-mode");
  });

  const catSelect = document.getElementById("p-form-cat-select");
  const catCustom = document.getElementById("p-form-cat-custom");
  catSelect.addEventListener("change", () => {
    if (catSelect.value === "__NEW__") {
      catCustom.classList.remove("hidden");
      catCustom.focus();
    } else {
      catCustom.classList.add("hidden");
    }
  });

  // Project creation and updates
  document.getElementById("project-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("p-form-id").value;
    const name = document.getElementById("p-form-name").value.trim();

    let category = catSelect.value;
    if (category === "__NEW__") {
      category = catCustom.value.trim() || "Other / General";
      if (!customCategories.includes(category)) customCategories.push(category);
    }

    const payload = {
      name,
      category,
      icon: document.getElementById("p-form-icon").value.trim() || "📁",
      description: document.getElementById("p-form-desc").value.trim()
    };

    if (id) {
      await apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(payload) });
      const newProj = await res.json();
      activeProjectId = newProj._id;
    }

    document.getElementById("project-modal").classList.remove("active");
    await fetchProjects();
  });

  // Screenshot preview dropzone
  const boxImg = document.getElementById("box-image-drop");
  const inputImg = document.getElementById("input-act-img");
  boxImg.addEventListener("click", () => inputImg.click());
  inputImg.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      tempImgBase64 = ev.target.result;
      document.getElementById("img-preview-tag").src = tempImgBase64;
      document.getElementById("img-preview-tag").classList.remove("hidden");
      document.getElementById("img-drop-prompt").classList.add("hidden");
    };
    reader.readAsDataURL(file);
  });

  // Binary file dropzone
  const boxFile = document.getElementById("box-file-drop");
  const inputFile = document.getElementById("input-act-file");
  boxFile.addEventListener("click", () => inputFile.click());
  inputFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      tempFileInfo = {
        fileName: file.name,
        fileSize: (file.size / (1024 * 1024)).toFixed(1) + " MB",
        fileData: ev.target.result
      };
      document.getElementById("label-ext-badge").innerText = file.name.split(".").pop().toUpperCase();
      document.getElementById("label-filename").innerText = file.name;
      document.getElementById("label-filesize").innerText = tempFileInfo.fileSize;
      document.getElementById("file-drop-prompt").classList.add("hidden");
      document.getElementById("file-attached-info").classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  // Activity submit
  document.getElementById("activity-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;

    const actId = document.getElementById("a-form-id").value;
    const title = document.getElementById("a-form-title").value.trim();
    const status = document.getElementById("a-form-status").value;
    const date = document.getElementById("a-form-date").value.trim() || "Oct 2026";
    const notes = document.getElementById("a-form-notes").value.trim();
    const tagsRaw = document.getElementById("a-form-tags").value.trim();
    const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim().startsWith("#") ? t.trim() : "#" + t.trim()) : [];

    const body = {
      title,
      status,
      date,
      notes,
      tags,
      image: tempImgBase64,
      fileName: tempFileInfo ? tempFileInfo.fileName : undefined,
      fileSize: tempFileInfo ? tempFileInfo.fileSize : undefined,
      fileData: tempFileInfo ? tempFileInfo.fileData : undefined
    };

    if (actId) {
      await apiFetch(`/projects/${activeProjectId}/activities/${actId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await apiFetch(`/projects/${activeProjectId}/activities`, { method: 'POST', body: JSON.stringify(body) });
    }

    document.getElementById("activity-modal").classList.remove("active");
    await fetchProjects();
  });
}

function openProjectModal(project = null) {
  const modal = document.getElementById("project-modal");
  document.getElementById("project-modal-heading").innerText = project ? "Edit Project Details" : "Create New Project";
  document.getElementById("p-form-id").value = project ? project._id : "";
  document.getElementById("p-form-name").value = project ? project.name : "";
  document.getElementById("p-form-icon").value = project ? project.icon : "📁";
  document.getElementById("p-form-desc").value = project ? project.description : "";

  const select = document.getElementById("p-form-cat-select");
  const customInput = document.getElementById("p-form-cat-custom");
  customInput.value = "";
  customInput.classList.add("hidden");

  const catSet = new Set(["3D / Blender", "Web Dev", "Networking", "System", "Game Dev", "Other / General", ...customCategories]);
  projects.forEach(p => { if (p.category && p.category.trim()) catSet.add(p.category.trim()); });

  select.innerHTML = "";
  catSet.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.innerText = cat;
    select.appendChild(opt);
  });

  const newOpt = document.createElement("option");
  newOpt.value = "__NEW__";
  newOpt.innerText = "+ Add Custom Category...";
  select.appendChild(newOpt);

  select.value = project ? (project.category || "3D / Blender") : "3D / Blender";
  modal.classList.add("active");
}

function openActivityModal(act = null) {
  const modal = document.getElementById("activity-modal");
  tempImgBase64 = act ? act.image : null;
  tempFileInfo = act && act.fileName ? { fileName: act.fileName, fileSize: act.fileSize, fileData: act.fileData } : null;

  document.getElementById("act-modal-heading").innerText = act ? "Edit Activity / Act" : "Add Activity / Act";
  document.getElementById("a-form-id").value = act ? act._id : "";
  document.getElementById("a-form-title").value = act ? act.title : "";
  document.getElementById("a-form-status").value = act ? act.status : "Completed";
  document.getElementById("a-form-date").value = act ? act.date : "Oct 05, 2026";
  document.getElementById("a-form-notes").value = act ? act.notes : "";
  document.getElementById("a-form-tags").value = act && act.tags ? act.tags.join(", ") : "";

  const imgTag = document.getElementById("img-preview-tag");
  const imgPrompt = document.getElementById("img-drop-prompt");
  if (act && act.image) {
    imgTag.src = act.image;
    imgTag.classList.remove("hidden");
    imgPrompt.classList.add("hidden");
  } else {
    imgTag.src = "";
    imgTag.classList.add("hidden");
    imgPrompt.classList.remove("hidden");
  }

  const fileSummary = document.getElementById("file-attached-info");
  const filePrompt = document.getElementById("file-drop-prompt");
  if (act && act.fileName) {
    document.getElementById("label-ext-badge").innerText = act.fileName.split(".").pop().toUpperCase();
    document.getElementById("label-filename").innerText = act.fileName;
    document.getElementById("label-filesize").innerText = act.fileSize || "";
    fileSummary.classList.remove("hidden");
    filePrompt.classList.add("hidden");
  } else {
    fileSummary.classList.add("hidden");
    filePrompt.classList.remove("hidden");
  }

  modal.classList.add("active");
}