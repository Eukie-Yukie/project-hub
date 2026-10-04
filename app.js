/* ========================================================
   AUTHENTICATION & PROJECT API CLIENT
   ======================================================== */

const API_BASE = "http://localhost:3000/api";

let currentUser = null;
let projects = [];
let activeProjectId = null;
let currentFilter = 'all';

// Pending files in Act modal
let pendingImageFile = null;
let pendingProjectFile = null;

// Helper: Get token
function getToken() {
  return localStorage.getItem('token');
}

// Helper: Authorized fetch
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If body is NOT FormData, set JSON content type
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401 || response.status === 403) {
    handleLogout();
    throw new Error("Session expired. Please log in.");
  }

  return response;
}

/* APP INIT */
document.addEventListener('DOMContentLoaded', async () => {
  setupAuthTabs();
  setupEventListeners();

  const token = getToken();
  if (token) {
    try {
      await loadUserProfile();
      await fetchProjects();
    } catch (err) {
      showAuthOverlay(true);
    }
  } else {
    showAuthOverlay(true);
  }
});

/* AUTH CONTROLLER */
function setupAuthTabs() {
  const tabLogin = document.getElementById('tab-login-btn');
  const tabReg = document.getElementById('tab-register-btn');
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const errBox = document.getElementById('auth-error-msg');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    errBox.classList.add('hidden');
  });

  tabReg.addEventListener('click', () => {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    errBox.classList.add('hidden');
  });

  // Handle Login Form
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem('token', data.token);
      currentUser = data.user;
      showAuthOverlay(false);
      updateUserSidebar();
      await fetchProjects();
    } catch (err) {
      errBox.innerText = err.message;
      errBox.classList.remove('hidden');
    }
  });

  // Handle Register Form
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.classList.add('hidden');
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      localStorage.setItem('token', data.token);
      currentUser = data.user;
      showAuthOverlay(false);
      updateUserSidebar();
      await fetchProjects();
    } catch (err) {
      errBox.innerText = err.message;
      errBox.classList.remove('hidden');
    }
  });

  // Handle Logout
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
}

function showAuthOverlay(show) {
  const overlay = document.getElementById('auth-overlay');
  if (show) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function handleLogout() {
  localStorage.removeItem('token');
  currentUser = null;
  projects = [];
  activeProjectId = null;
  showAuthOverlay(true);
}

async function loadUserProfile() {
  const res = await apiFetch('/auth/me');
  if (res.ok) {
    currentUser = await res.json();
    updateUserSidebar();
    showAuthOverlay(false);
  }
}

function updateUserSidebar() {
  if (!currentUser) return;
  document.getElementById('sidebar-user-name').innerText = currentUser.name;
  document.getElementById('sidebar-user-email').innerText = currentUser.email;

  // Initials
  const initials = currentUser.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  document.getElementById('sidebar-user-avatar').innerText = initials || 'JR';
}

/* DATA SYNC & RENDERING */
async function fetchProjects() {
  try {
    const res = await apiFetch('/projects');
    projects = await res.json();
    if (projects.length > 0 && !activeProjectId) {
      activeProjectId = projects[0]._id;
    }
    renderSidebar();
    renderProjectView();
  } catch (err) {
    console.error(err);
  }
}

function renderSidebar() {
  const container = document.getElementById('recents-list');
  const searchVal = document.getElementById('search-input').value.toLowerCase();
  container.innerHTML = '';

  const filtered = projects.filter(p => {
    const matchCat = (currentFilter === 'all' || p.category === currentFilter);
    const matchSearch = p.name.toLowerCase().includes(searchVal);
    return matchCat && matchSearch;
  });

  filtered.forEach(p => {
    const div = document.createElement('div');
    div.className = `recent-project-item ${p._id === activeProjectId ? 'active' : ''}`;
    div.innerHTML = `
      <span class="recent-project-name">${p.name}</span>
      <span class="recent-count-badge">${p.activities ? p.activities.length : 0} acts</span>
    `;
    div.addEventListener('click', () => {
      activeProjectId = p._id;
      renderSidebar();
      renderProjectView();
    });
    container.appendChild(div);
  });
}

function renderProjectView() {
  const project = projects.find(p => p._id === activeProjectId);
  const container = document.getElementById('activities-container');
  container.innerHTML = '';

  if (!project) {
    document.getElementById('header-breadcrumb').innerText = 'Projects';
    document.getElementById('project-header-title').innerText = 'No Project Selected';
    document.getElementById('project-header-desc').innerText = 'Click "+ New project" to begin.';
    return;
  }

  document.getElementById('header-breadcrumb').innerText = `Projects / ${project.category}`;
  document.getElementById('project-header-title').innerText = project.name;
  document.getElementById('project-header-desc').innerText = project.description || 'No description provided.';

  (project.activities || []).forEach(act => {
    const card = document.createElement('div');
    card.className = 'act-card';

    const statusClass = act.status === 'Completed' ? 'status-completed' : (act.status === 'Review' ? 'status-review' : 'status-progress');

    card.innerHTML = `
      <div class="act-thumb">
        ${act.image 
          ? `<img src="${act.image}" alt="${act.title}" />` 
          : `<div class="act-thumb-placeholder"><span>No Render Image</span></div>`
        }
      </div>
      <div class="act-card-body">
        <div class="act-header-row">
          <div class="act-title">${act.title}</div>
          <span class="status-badge ${statusClass}">${act.status}</span>
        </div>
        <div class="act-notes">${act.notes || 'No notes.'}</div>

        ${act.fileName ? `
          <div class="act-file-row">
            <span style="font-size:12px; font-weight:600;">${act.fileName} (${act.fileSize || 'FILE'})</span>
            <a href="${act.fileUrl}" download="${act.fileName}" class="icon-btn-sm" style="color:var(--teal-accent); text-decoration:none;">Download</a>
          </div>
        ` : ''}

        <div class="act-card-actions">
          <button class="icon-btn-sm btn-delete-act" style="color:var(--danger);">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-delete-act').addEventListener('click', async () => {
      if (confirm("Delete this activity?")) {
        await apiFetch(`/projects/${project._id}/activities/${act._id}`, { method: 'DELETE' });
        await fetchProjects();
      }
    });

    container.appendChild(card);
  });
}

/* LISTENERS & DIALOGS */
function setupEventListeners() {
  // Category tabs
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      renderSidebar();
    });
  });

  // Search input
  document.getElementById('search-input').addEventListener('input', renderSidebar);

  // New Project Modal
  document.getElementById('btn-new-project').addEventListener('click', () => openProjectModal());
  document.getElementById('btn-edit-project').addEventListener('click', () => {
    const proj = projects.find(p => p._id === activeProjectId);
    if (proj) openProjectModal(proj);
  });

  // New Act Modal
  document.getElementById('btn-add-activity').addEventListener('click', () => {
    if (!activeProjectId) {
      alert("Please select or create a project first.");
      return;
    }
    openActivityModal();
  });

  // Close modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      document.getElementById(modalId).classList.remove('active');
    });
  });

  // Save Project
  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const body = {
      name: document.getElementById('project-name-input').value,
      category: document.getElementById('project-cat-input').value,
      status: document.getElementById('project-status-input').value,
      description: document.getElementById('project-desc-input').value
    };

    if (id) {
      await apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      const res = await apiFetch('/projects', { method: 'POST', body: JSON.stringify(body) });
      const newProj = await res.json();
      activeProjectId = newProj._id;
    }

    document.getElementById('project-modal').classList.remove('active');
    await fetchProjects();
  });

  // Dual dropzones
  const imgDropArea = document.getElementById('img-drop-area');
  const imgInput = document.getElementById('act-img-file');
  imgDropArea.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingImageFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const imgPreview = document.getElementById('img-preview');
      imgPreview.src = ev.target.result;
      imgPreview.classList.remove('hidden');
      document.getElementById('img-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });

  const fileDropArea = document.getElementById('file-drop-area');
  const fileInput = document.getElementById('act-project-file');
  fileDropArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingProjectFile = file;
    const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + " MB";
    document.getElementById('file-ext-badge').innerText = file.name.split('.').pop().toUpperCase();
    document.getElementById('file-name-display').innerText = file.name;
    document.getElementById('file-size-display').innerText = sizeStr;
    document.getElementById('file-placeholder').classList.add('hidden');
    document.getElementById('file-attached-info').classList.remove('hidden');
  });

  // Save Act Form
  document.getElementById('activity-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeProjectId) return;

    const formData = new FormData();
    formData.append('title', document.getElementById('act-title-input').value);
    formData.append('status', document.getElementById('act-status-input').value);
    formData.append('notes', document.getElementById('act-notes-input').value);

    if (pendingImageFile) formData.append('image', pendingImageFile);
    if (pendingProjectFile) formData.append('file', pendingProjectFile);

    await apiFetch(`/projects/${activeProjectId}/activities`, {
      method: 'POST',
      body: formData
    });

    document.getElementById('activity-modal').classList.remove('active');
    await fetchProjects();
  });
}

function openProjectModal(project = null) {
  const modal = document.getElementById('project-modal');
  document.getElementById('project-modal-title').innerText = project ? "Edit Project" : "New Project";
  document.getElementById('project-id').value = project ? project._id : "";
  document.getElementById('project-name-input').value = project ? project.name : "";
  document.getElementById('project-cat-input').value = project ? project.category : "3D";
  document.getElementById('project-status-input').value = project ? project.status : "In Progress";
  document.getElementById('project-desc-input').value = project ? project.description : "";
  modal.classList.add('active');
}

function openActivityModal() {
  const modal = document.getElementById('activity-modal');
  pendingImageFile = null;
  pendingProjectFile = null;
  document.getElementById('activity-id').value = "";
  document.getElementById('act-title-input').value = "";
  document.getElementById('act-status-input').value = "In Progress";
  document.getElementById('act-notes-input').value = "";

  document.getElementById('img-preview').classList.add('hidden');
  document.getElementById('img-placeholder').classList.remove('hidden');
  document.getElementById('file-attached-info').classList.add('hidden');
  document.getElementById('file-placeholder').classList.remove('hidden');

  modal.classList.add('active');
}