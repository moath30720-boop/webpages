'use strict';

// ==========================================
// APPLICATION STATE
// ==========================================
let tasks = [];
let currentView = 'dashboard';
let currentFilter = 'all';
let currentSort = 'created';
let currentCategoryFilter = 'all';
let searchQuery = '';
let editingTaskId = null; // null for create, taskId for edit
let deletingTaskId = null;
let viewMode = 'list'; // 'list' or 'board'
let darkMode = false;
let focusTimerInterval = null;
let focusTimeRemaining = 25 * 60; // seconds
let focusRunning = false;
let lastDeletedTask = null; // for undo

// ==========================================
// LOCAL STORAGE
// ==========================================
function saveTasks() {
  localStorage.setItem('taskflow-tasks', JSON.stringify(tasks));
}

function loadTasks() {
  const data = localStorage.getItem('taskflow-tasks');
  return data ? JSON.parse(data) : [];
}

function saveTheme() {
  localStorage.setItem('taskflow-theme', darkMode ? 'dark' : 'light');
}

function loadTheme() {
  return localStorage.getItem('taskflow-theme') || 'light';
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
  // Load data
  const savedTasks = loadTasks();
  tasks = savedTasks.length > 0 ? savedTasks : getDefaultTasks();
  if (savedTasks.length === 0) saveTasks();
  
  // Load theme
  const savedTheme = loadTheme();
  darkMode = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  
  // Update theme button text
  const themeBtns = document.querySelectorAll('#theme-toggle, .mobile-header [data-action="theme"]');
  themeBtns.forEach(btn => btn.textContent = darkMode ? '☀️' : '🌙');
  
  // Setup event listeners
  setupNavigation();
  setupSidebar();
  setupDragAndDrop();
  setupFocusMode();
  setupSettings();
  setupModals();
  setupTaskForm();
  setupFilters();
  
  // Add task buttons
  const addTaskBtn = document.getElementById('add-task-btn');
  if (addTaskBtn) addTaskBtn.addEventListener('click', openCreateModal);
  
  document.querySelectorAll('.btn-add-task').forEach(btn => {
    btn.addEventListener('click', openCreateModal);
  });
  
  // Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleDarkMode);
  
  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      searchQuery = this.value.trim();
      // If on dashboard or other views, switch to tasks view to show results
      if (searchQuery && currentView !== 'tasks') navigateTo('tasks');
      renderTasks();
    });
  }

  // View toggle
  document.addEventListener('click', function(e) {
    const toggleBtn = e.target.closest('.view-toggle-btn');
    if (!toggleBtn) return;
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    toggleBtn.classList.add('active');
    viewMode = toggleBtn.dataset.mode;
    renderTasks();
  });

  // Task list event delegation
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.addEventListener('click', function(e) {
      const card = e.target.closest('.task-card');
      const action = e.target.closest('[data-action]');
      
      if (action) {
        if (!card && action.dataset.action !== 'menu') return;
        const taskId = card ? card.dataset.taskId : null;
        
        switch (action.dataset.action) {
          case 'complete': toggleComplete(taskId); break;
          case 'menu': toggleMenu(card); break;
          case 'edit': openEditModal(taskId); break;
          case 'duplicate': duplicateTask(taskId); break;
          case 'delete': confirmDelete(taskId); break;
          case 'focus': startFocusMode(taskId); break;
        }
      } else if (!e.target.closest('.task-actions-menu')) {
        closeAllMenus();
      }
    });
  }

  // Handle URL hash navigation
  if (window.location.hash) {
    const view = window.location.hash.substring(1);
    if (['dashboard', 'tasks', 'today', 'projects', 'settings'].includes(view)) {
      navigateTo(view);
    } else {
      renderAll();
    }
  } else {
    renderAll();
  }
});

// ==========================================
// NAVIGATION & LAYOUT
// ==========================================
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function(e) {
      e.preventDefault();
      navigateTo(this.dataset.view);
      history.pushState(null, null, `#${this.dataset.view}`);
    });
  });
}

function navigateTo(viewName) {
  currentView = viewName;
  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });
  // Show correct view
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
  });
  // Close sidebar on mobile
  closeSidebar();
  // Re-render view-specific content
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'tasks') renderTasks();
  if (viewName === 'today') renderToday();
  if (viewName === 'projects') renderProjects();
}

function setupSidebar() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  
  if (menuToggle) menuToggle.addEventListener('click', openSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
}

function openSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('active');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

// ==========================================
// FILTERING & SORTING
// ==========================================
function setupFilters() {
  const filterSelect = document.getElementById('filter-select');
  const sortSelect = document.getElementById('sort-select');
  const categoryFilter = document.getElementById('category-filter');
  
  if (filterSelect) {
    filterSelect.addEventListener('change', function() {
      currentFilter = this.value;
      renderTasks();
    });
  }
  
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      currentSort = this.value;
      renderTasks();
    });
  }
  
  if (categoryFilter) {
    categoryFilter.addEventListener('change', function() {
      currentCategoryFilter = this.value;
      renderTasks();
    });
  }
}

function getFilteredTasks() {
  let result = [...tasks];
  
  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(t => 
      t.title.toLowerCase().includes(q) || 
      (t.description && t.description.toLowerCase().includes(q)) || 
      (t.category && t.category.toLowerCase().includes(q))
    );
  }
  
  // Status filter
  if (currentFilter === 'active') result = result.filter(t => !t.completed);
  else if (currentFilter === 'completed') result = result.filter(t => t.completed);
  else if (currentFilter === 'overdue') result = result.filter(t => isOverdue(t));
  
  // Category filter
  if (currentCategoryFilter !== 'all') {
    result = result.filter(t => t.category === currentCategoryFilter);
  }
  
  // Sort
  result = sortTasks(result);
  
  return result;
}

function sortTasks(arr) {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  
  switch (currentSort) {
    case 'due-date': 
      return arr.sort((a, b) => { 
        if (!a.dueDate) return 1; 
        if (!b.dueDate) return -1; 
        return new Date(a.dueDate) - new Date(b.dueDate); 
      });
    case 'priority': 
      return arr.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    case 'alphabetical': 
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case 'created': 
    default: 
      return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

// ==========================================
// RENDERING
// ==========================================
function renderAll() {
  updateStats();
  updateGreeting();
  
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'tasks') renderTasks();
  if (currentView === 'today') renderToday();
  if (currentView === 'projects') renderProjects();
}

function renderTasks() {
  const filtered = getFilteredTasks();
  const taskListEl = document.getElementById('task-list');
  const kanbanEl = document.getElementById('kanban-board');
  
  if (!taskListEl || !kanbanEl) return;
  
  if (viewMode === 'list') {
    taskListEl.classList.remove('hidden');
    kanbanEl.classList.add('hidden');
    renderTaskList(filtered, taskListEl);
  } else {
    taskListEl.classList.add('hidden');
    kanbanEl.classList.remove('hidden');
    renderKanbanBoard(filtered);
  }
}

function renderTaskList(filteredTasks, container) {
  if (filteredTasks.length === 0) {
    container.innerHTML = getEmptyStateHTML();
    return;
  }
  container.innerHTML = filteredTasks.map(task => createTaskCardHTML(task)).join('');
}

function renderKanbanBoard(filteredTasks) {
  const statuses = ['todo', 'in-progress', 'done'];
  
  statuses.forEach(status => {
    const column = document.querySelector(`.kanban-cards[data-status="${status}"]`);
    if (!column) return;
    
    const statusTasks = filteredTasks.filter(t => t.status === status);
    
    // Update count
    const countId = `kanban-${status === 'in-progress' ? 'progress' : status}-count`;
    const countEl = document.getElementById(countId);
    if (countEl) countEl.textContent = statusTasks.length;
    
    if (statusTasks.length === 0) {
      column.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No tasks</p></div>';
    } else {
      column.innerHTML = statusTasks.map(t => createTaskCardHTML(t)).join('');
    }
  });
}

function createTaskCardHTML(task) {
  const overdue = isOverdue(task);
  const dueDateFormatted = formatDueDate(task.dueDate);
  const subtaskProgress = getSubtaskProgress(task);
  const priorityIcon = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
  
  return `
    <article class="task-card ${task.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}" data-task-id="${task.id}" draggable="true">
      <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-action="complete">
        ${task.completed ? '✓' : ''}
      </div>
      <div class="task-content">
        <div class="task-title">${escapeHTML(task.title)}</div>
        ${task.description ? `<div class="task-description">${escapeHTML(task.description)}</div>` : ''}
        <div class="task-meta">
          <span class="task-tag tag-category">${escapeHTML(task.category)}</span>
          <span class="task-tag tag-${task.priority}">${priorityIcon} ${capitalize(task.priority)}</span>
          ${task.dueDate ? `<span class="task-date ${overdue ? 'overdue-date' : ''}">📅 ${dueDateFormatted}</span>` : ''}
          ${overdue ? '<span class="task-tag tag-overdue">Overdue</span>' : ''}
        </div>
        ${subtaskProgress ? `
          <div class="subtask-progress">
            <div class="progress-bar"><div class="progress-fill" style="width: ${subtaskProgress.percent}%"></div></div>
            <span class="progress-text">${subtaskProgress.completed} / ${subtaskProgress.total} subtasks</span>
          </div>
        ` : ''}
      </div>
      <button class="task-actions-btn" data-action="menu">⋮</button>
      <div class="task-actions-menu">
        <button class="menu-item" data-action="edit">✏️ Edit</button>
        <button class="menu-item" data-action="duplicate">📋 Duplicate</button>
        <button class="menu-item" data-action="focus">🎯 Focus</button>
        <button class="menu-item menu-item-danger" data-action="delete">🗑️ Delete</button>
      </div>
    </article>
  `;
}

function getEmptyStateHTML() {
  if (searchQuery) {
    return '<div class="empty-state"><div class="empty-icon">🔍</div><h3>No tasks found</h3><p>Try a different search term.</p></div>';
  }
  if (currentFilter === 'completed') {
    return '<div class="empty-state"><div class="empty-icon">✓</div><h3>No completed tasks</h3><p>Complete some tasks to see them here.</p></div>';
  }
  if (currentFilter === 'overdue') {
    return '<div class="empty-state"><div class="empty-icon">✓</div><h3>No overdue tasks</h3><p>Great job staying on track!</p></div>';
  }
  return '<div class="empty-state"><div class="empty-icon">✓</div><h3>No tasks here</h3><p>You\'re all caught up!</p></div>';
}

// ==========================================
// DASHBOARD
// ==========================================
function renderDashboard() {
  updateStats();
  renderDashboardTasks();
  renderPriorityChart();
}

function renderDashboardTasks() {
  const container = document.getElementById('dashboard-tasks');
  if (!container) return;
  
  const recent = [...tasks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No tasks yet</h3><p>Create your first task to get started!</p></div>';
    return;
  }
  
  container.innerHTML = recent.map(t => createTaskCardHTML(t)).join('');
}

function renderPriorityChart() {
  const container = document.getElementById('priority-chart');
  if (!container) return;
  
  const high = tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const medium = tasks.filter(t => t.priority === 'medium' && !t.completed).length;
  const low = tasks.filter(t => t.priority === 'low' && !t.completed).length;
  const max = Math.max(high, medium, low, 1);
  
  container.innerHTML = `
    <h3>Priority Distribution</h3>
    <div class="chart-bars">
      <div class="chart-bar-group">
        <div class="chart-bar bar-high" style="height: ${(high / max) * 150}px"></div>
        <span class="chart-label">High (${high})</span>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar bar-medium" style="height: ${(medium / max) * 150}px"></div>
        <span class="chart-label">Medium (${medium})</span>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar bar-low" style="height: ${(low / max) * 150}px"></div>
        <span class="chart-label">Low (${low})</span>
      </div>
    </div>
  `;
}

// ==========================================
// TODAY VIEW
// ==========================================
function renderToday() {
  const container = document.getElementById('today-task-list');
  if (!container) return;
  
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = tasks.filter(t => t.dueDate === today);
  const overdueTasks = tasks.filter(t => isOverdue(t));
  
  // Combine and remove duplicates
  const allTodayTasks = [...new Set([...todayTasks, ...overdueTasks])];
  
  if (allTodayTasks.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><h3>No tasks for today</h3><p>You\'re all caught up! Enjoy your day.</p></div>';
    return;
  }
  
  container.innerHTML = allTodayTasks.map(t => createTaskCardHTML(t)).join('');
}

// ==========================================
// PROJECTS VIEW
// ==========================================
function renderProjects() {
  const container = document.querySelector('#view-projects .projects-grid') || document.getElementById('projects-container');
  if (!container) return;
  
  const categories = ['Programming', 'Design', 'Marketing', 'Personal', 'Health', 'Finance', 'Education', 'Other'];
  const icons = { 
    Programming: '💻', Design: '🎨', Marketing: '📣', Personal: '👤', 
    Health: '❤️', Finance: '💰', Education: '📚', Other: '📌' 
  };
  
  container.innerHTML = categories.map(cat => {
    const catTasks = tasks.filter(t => t.category === cat);
    const completedCount = catTasks.filter(t => t.completed).length;
    const progress = catTasks.length > 0 ? Math.round((completedCount / catTasks.length) * 100) : 0;
    
    return `
      <div class="project-card" data-category="${escapeHTML(cat)}">
        <div class="project-icon">${icons[cat]}</div>
        <div class="project-name">${escapeHTML(cat)}</div>
        <div class="project-count">${catTasks.length} tasks · ${completedCount} done</div>
        <div class="project-progress"><div class="project-progress-fill" style="width: ${progress}%"></div></div>
      </div>
    `;
  }).join('');
  
  // Click on project card to navigate to tasks with that category filter
  container.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', function() {
      currentCategoryFilter = this.dataset.category;
      const categorySelect = document.getElementById('category-filter');
      if (categorySelect) categorySelect.value = currentCategoryFilter;
      navigateTo('tasks');
    });
  });
}

// ==========================================
// TASK ACTIONS
// ==========================================
function toggleComplete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  task.completed = !task.completed;
  task.status = task.completed ? 'done' : 'todo';
  
  saveTasks();
  renderAll();
  showToast(task.completed ? 'Task completed! 🎉' : 'Task unchecked', 'success');
}

function toggleMenu(cardElement) {
  const menu = cardElement.querySelector('.task-actions-menu');
  const isActive = menu.classList.contains('active');
  
  closeAllMenus();
  
  if (!isActive) {
    menu.classList.add('active');
  }
}

function closeAllMenus() {
  document.querySelectorAll('.task-actions-menu').forEach(m => {
    m.classList.remove('active');
  });
}

function duplicateTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const newTask = {
    ...task,
    id: crypto.randomUUID(),
    title: task.title + ' (copy)',
    completed: false,
    status: 'todo',
    createdAt: new Date().toISOString(),
    subtasks: (task.subtasks || []).map(s => ({ 
      ...s, 
      id: crypto.randomUUID(), 
      completed: false 
    }))
  };
  
  tasks.unshift(newTask);
  saveTasks();
  closeAllMenus();
  renderAll();
  showToast('Task duplicated! 📋', 'success');
}

// ==========================================
// DELETE & UNDO
// ==========================================
function confirmDelete(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  deletingTaskId = taskId;
  
  const nameEl = document.getElementById('delete-task-name');
  if (nameEl) nameEl.textContent = task.title;
  
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.add('active');
  
  closeAllMenus();
}

document.getElementById('delete-confirm-btn')?.addEventListener('click', function() {
  if (!deletingTaskId) return;
  
  const task = tasks.find(t => t.id === deletingTaskId);
  lastDeletedTask = { ...task, subtasks: [...(task.subtasks || [])] };
  
  tasks = tasks.filter(t => t.id !== deletingTaskId);
  saveTasks();
  
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.remove('active');
  
  deletingTaskId = null;
  renderAll();
  showToast('Task deleted', 'info', true);
});

function undoDelete() {
  if (!lastDeletedTask) return;
  
  tasks.unshift(lastDeletedTask);
  lastDeletedTask = null;
  
  saveTasks();
  renderAll();
  showToast('Task restored! ↩️', 'success');
}

// ==========================================
// MODALS
// ==========================================
function setupModals() {
  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) {
        closeModal(this.id);
      }
    });
  });
  
  // Cancel buttons
  document.querySelectorAll('.btn-cancel, .modal-close').forEach(btn => {
    btn.addEventListener('click', function() {
      const modal = this.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    });
  });
}

function closeModal(modalId = 'task-modal') {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
  
  if (modalId === 'task-modal') {
    editingTaskId = null;
  } else if (modalId === 'delete-modal') {
    deletingTaskId = null;
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  const focusOverlay = document.getElementById('focus-overlay');
  if (focusOverlay) focusOverlay.classList.remove('active');
  
  if (focusRunning) pauseFocusTimer();
  editingTaskId = null;
  deletingTaskId = null;
}

// ==========================================
// TASK FORM (CREATE/EDIT)
// ==========================================
function setupTaskForm() {
  const form = document.getElementById('task-form');
  const titleInput = document.getElementById('task-title-input');
  
  if (form) {
    form.addEventListener('submit', handleTaskSubmit);
  }
  
  if (titleInput) {
    titleInput.addEventListener('input', function() {
      if (this.value.trim()) {
        const group = this.closest('.form-group');
        if (group) group.classList.remove('error');
      }
    });
  }
  
  // Priority selector
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault(); // In case it's in a form
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
    });
  });
  
  // Subtasks
  const addSubtaskBtn = document.getElementById('add-subtask-btn');
  if (addSubtaskBtn) {
    addSubtaskBtn.addEventListener('click', addSubtaskRow);
  }
  
  const subtasksContainer = document.getElementById('subtasks-container');
  if (subtasksContainer) {
    subtasksContainer.addEventListener('click', function(e) {
      if (e.target.classList.contains('subtask-remove')) {
        const item = e.target.closest('.subtask-item');
        if (item) item.remove();
      }
    });
  }
}

function openCreateModal() {
  editingTaskId = null;
  
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-btn');
  const form = document.getElementById('task-form');
  
  if (titleEl) titleEl.textContent = 'Create New Task';
  if (submitBtn) submitBtn.textContent = 'Create Task';
  if (form) form.reset();
  
  // Reset priority to medium
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.priority === 'medium');
  });
  
  // Clear subtasks
  const subtasksContainer = document.getElementById('subtasks-container');
  if (subtasksContainer) subtasksContainer.innerHTML = '';
  
  // Clear errors
  document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
  
  // Set default due date to today
  const dueInput = document.getElementById('task-due-input');
  if (dueInput) {
    dueInput.value = new Date().toISOString().split('T')[0];
  }
  
  // Show modal
  const modal = document.getElementById('task-modal');
  if (modal) modal.classList.add('active');
  
  // Focus title
  setTimeout(() => {
    const titleInput = document.getElementById('task-title-input');
    if (titleInput) titleInput.focus();
  }, 100);
}

function openEditModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  editingTaskId = taskId;
  
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-btn');
  
  if (titleEl) titleEl.textContent = 'Edit Task';
  if (submitBtn) submitBtn.textContent = 'Save Changes';
  
  const titleInput = document.getElementById('task-title-input');
  const descInput = document.getElementById('task-desc-input');
  const dueInput = document.getElementById('task-due-input');
  const catInput = document.getElementById('task-category-input');
  
  if (titleInput) titleInput.value = task.title;
  if (descInput) descInput.value = task.description || '';
  if (dueInput) dueInput.value = task.dueDate || '';
  if (catInput) catInput.value = task.category || 'Other';
  
  // Set priority
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.priority === task.priority);
  });
  
  // Render subtasks
  renderModalSubtasks(task.subtasks || []);
  
  // Clear errors
  document.querySelectorAll('.form-group').forEach(g => g.classList.remove('error'));
  
  // Close any open menus
  closeAllMenus();
  
  // Show modal
  const modal = document.getElementById('task-modal');
  if (modal) modal.classList.add('active');
}

function handleTaskSubmit(e) {
  e.preventDefault();
  
  const titleInput = document.getElementById('task-title-input');
  const descInput = document.getElementById('task-desc-input');
  const dueInput = document.getElementById('task-due-input');
  const catInput = document.getElementById('task-category-input');
  const activePriorityBtn = document.querySelector('.priority-btn.active');
  
  const title = titleInput ? titleInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';
  const priority = activePriorityBtn ? activePriorityBtn.dataset.priority : 'medium';
  const dueDate = dueInput ? dueInput.value : '';
  const category = catInput ? catInput.value : 'Other';
  const subtasks = getModalSubtasks();
  
  // Validation
  if (!title) {
    if (titleInput) {
      const group = titleInput.closest('.form-group');
      if (group) group.classList.add('error');
      titleInput.focus();
    }
    return;
  }
  
  if (editingTaskId) {
    // Edit existing task
    const task = tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.description = description;
      task.priority = priority;
      task.dueDate = dueDate;
      task.category = category;
      task.subtasks = subtasks;
      
      // Update status if needed based on subtasks maybe? The requirements don't say this, 
      // they just say keep the status, except when completing task.
    }
    showToast('Task updated! ✏️', 'success');
  } else {
    // Create new task
    const newTask = {
      id: crypto.randomUUID(),
      title,
      description,
      priority,
      category,
      dueDate,
      completed: false,
      status: 'todo',
      createdAt: new Date().toISOString(),
      subtasks
    };
    tasks.unshift(newTask);
    showToast('Task created! 🎉', 'success');
  }
  
  saveTasks();
  closeModal('task-modal');
  renderAll();
}

function renderModalSubtasks(subtasks) {
  const container = document.getElementById('subtasks-container');
  if (!container) return;
  
  container.innerHTML = subtasks.map(st => `
    <div class="subtask-item" data-subtask-id="${st.id}">
      <input type="checkbox" ${st.completed ? 'checked' : ''} class="subtask-checkbox">
      <input type="text" value="${escapeHTML(st.title)}" class="subtask-title-input" placeholder="Subtask title...">
      <button type="button" class="subtask-remove">✕</button>
    </div>
  `).join('');
}

function getModalSubtasks() {
  const container = document.getElementById('subtasks-container');
  if (!container) return [];
  
  const items = container.querySelectorAll('.subtask-item');
  return Array.from(items).map(item => {
    const input = item.querySelector('.subtask-title-input');
    const checkbox = item.querySelector('.subtask-checkbox');
    return {
      id: item.dataset.subtaskId || crypto.randomUUID(),
      title: input ? input.value.trim() : '',
      completed: checkbox ? checkbox.checked : false
    };
  }).filter(s => s.title);
}

function addSubtaskRow() {
  const container = document.getElementById('subtasks-container');
  if (!container) return;
  
  const id = crypto.randomUUID();
  const div = document.createElement('div');
  div.className = 'subtask-item';
  div.dataset.subtaskId = id;
  div.innerHTML = `
    <input type="checkbox" class="subtask-checkbox">
    <input type="text" class="subtask-title-input" placeholder="Subtask title...">
    <button type="button" class="subtask-remove">✕</button>
  `;
  container.appendChild(div);
  
  const input = div.querySelector('.subtask-title-input');
  if (input) input.focus();
}

// ==========================================
// DRAG AND DROP
// ==========================================
function setupDragAndDrop() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;
  
  mainContent.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;
    
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', card.dataset.taskId);
    e.dataTransfer.effectAllowed = 'move';
  });
  
  mainContent.addEventListener('dragend', function(e) {
    const card = e.target.closest('.task-card');
    if (card) card.classList.remove('dragging');
    
    document.querySelectorAll('.kanban-column').forEach(col => {
      col.classList.remove('drag-over');
    });
  });
  
  mainContent.addEventListener('dragover', function(e) {
    const column = e.target.closest('.kanban-column');
    if (column) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Remove drag-over from all, add to current
      document.querySelectorAll('.kanban-column').forEach(col => {
        col.classList.remove('drag-over');
      });
      column.classList.add('drag-over');
    }
  });
  
  mainContent.addEventListener('dragleave', function(e) {
    const column = e.target.closest('.kanban-column');
    if (column && !column.contains(e.relatedTarget)) {
      column.classList.remove('drag-over');
    }
  });
  
  mainContent.addEventListener('drop', function(e) {
    const column = e.target.closest('.kanban-column');
    if (!column) return;
    
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    
    // The data-status is usually on the column or kanban-cards div
    const kanbanCards = column.querySelector('.kanban-cards') || column;
    const newStatus = kanbanCards.dataset.status;
    
    if (!newStatus) {
      column.classList.remove('drag-over');
      return;
    }
    
    const task = tasks.find(t => t.id === taskId);
    if (task && task.status !== newStatus) {
      task.status = newStatus;
      task.completed = newStatus === 'done';
      saveTasks();
      renderAll();
      showToast(`Task moved to ${newStatus.replace('-', ' ')}`, 'info');
    }
    
    column.classList.remove('drag-over');
  });
}

// ==========================================
// FOCUS MODE
// ==========================================
function setupFocusMode() {
  const startBtn = document.getElementById('focus-start-btn');
  const resetBtn = document.getElementById('focus-reset-btn');
  const closeBtn = document.querySelector('.focus-close');
  
  if (startBtn) startBtn.addEventListener('click', toggleFocusTimer);
  if (resetBtn) resetBtn.addEventListener('click', resetFocusTimer);
  if (closeBtn) closeBtn.addEventListener('click', closeFocusMode);
  
  // Break duration buttons
  document.querySelectorAll('.focus-break-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      setFocusDuration(parseInt(this.dataset.minutes));
    });
  });
}

function startFocusMode(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  closeAllMenus();
  
  const nameEl = document.getElementById('focus-task-name');
  if (nameEl) nameEl.textContent = task.title;
  
  const overlay = document.getElementById('focus-overlay');
  if (overlay) overlay.classList.add('active');
  
  focusTimeRemaining = 25 * 60;
  focusRunning = false;
  
  updateFocusTimerDisplay();
  
  const startBtn = document.getElementById('focus-start-btn');
  if (startBtn) startBtn.textContent = '▶ Start';
}

function toggleFocusTimer() {
  if (focusRunning) {
    pauseFocusTimer();
  } else {
    focusRunning = true;
    
    const startBtn = document.getElementById('focus-start-btn');
    if (startBtn) startBtn.textContent = '⏸ Pause';
    
    focusTimerInterval = setInterval(() => {
      focusTimeRemaining--;
      updateFocusTimerDisplay();
      
      if (focusTimeRemaining <= 0) {
        clearInterval(focusTimerInterval);
        focusRunning = false;
        showToast('Focus session complete! 🎉 Time for a break.', 'success');
        
        if (startBtn) startBtn.textContent = '▶ Start';
      }
    }, 1000);
  }
}

function pauseFocusTimer() {
  focusRunning = false;
  clearInterval(focusTimerInterval);
  
  const startBtn = document.getElementById('focus-start-btn');
  if (startBtn) startBtn.textContent = '▶ Start';
}

function resetFocusTimer() {
  pauseFocusTimer();
  focusTimeRemaining = 25 * 60;
  updateFocusTimerDisplay();
}

function setFocusDuration(minutes) {
  pauseFocusTimer();
  focusTimeRemaining = minutes * 60;
  updateFocusTimerDisplay();
}

function updateFocusTimerDisplay() {
  const timerEl = document.getElementById('focus-timer');
  if (!timerEl) return;
  
  const mins = Math.floor(focusTimeRemaining / 60);
  const secs = focusTimeRemaining % 60;
  timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function closeFocusMode() {
  pauseFocusTimer();
  const overlay = document.getElementById('focus-overlay');
  if (overlay) overlay.classList.remove('active');
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info', showUndo = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHTML(message)}</span>
    ${showUndo ? '<button class="toast-undo">Undo</button>' : ''}
    <button class="toast-close">✕</button>
  `;
  
  container.appendChild(toast);
  
  if (showUndo) {
    const undoBtn = toast.querySelector('.toast-undo');
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        undoDelete();
        removeToast(toast);
      });
    }
  }
  
  // Close button
  const closeBtn = toast.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => removeToast(toast));
  }
  
  // Trigger show animation
  requestAnimationFrame(() => toast.classList.add('show'));
  
  // Auto remove
  setTimeout(() => removeToast(toast), showUndo ? 5000 : 4000);
}

function removeToast(toast) {
  toast.classList.remove('show');
  setTimeout(() => toast.remove(), 300);
}

// ==========================================
// STATS & GREETING
// ==========================================
function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => isOverdue(t)).length;
  const inProgress = tasks.filter(t => !t.completed && t.status === 'in-progress').length;
  
  animateNumber('stat-total', total);
  animateNumber('stat-completed', completed);
  animateNumber('stat-in-progress', inProgress);
  animateNumber('stat-overdue', overdue);
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const current = parseInt(el.textContent) || 0;
  if (current === target) { 
    el.textContent = target; 
    return; 
  }
  
  const duration = 300;
  const steps = 15;
  const increment = (target - current) / steps;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    el.textContent = Math.round(current + increment * step);
    if (step >= steps) { 
      clearInterval(timer); 
      el.textContent = target; 
    }
  }, duration / steps);
}

function updateGreeting() {
  const el = document.getElementById('greeting-text');
  if (!el) return;
  
  const hour = new Date().getHours();
  let greeting;
  
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';
  else greeting = 'Good evening';
  
  el.textContent = `${greeting} 👋`;
}

// ==========================================
// UTILITIES
// ==========================================
function isOverdue(task) {
  if (!task.dueDate || task.completed) return false;
  
  // Using toDateString to compare just the date parts
  const due = new Date(task.dueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return due < today;
}

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(str) { 
  if (typeof str !== 'string' || !str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1); 
}

function formatDueDate(dateStr) {
  if (!dateStr) return '';
  
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today); 
  tomorrow.setDate(today.getDate() + 1);
  
  const yesterday = new Date(today); 
  yesterday.setDate(today.getDate() - 1);
  
  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getSubtaskProgress(task) {
  if (!task.subtasks || task.subtasks.length === 0) return null;
  const completed = task.subtasks.filter(s => s.completed).length;
  return { 
    completed, 
    total: task.subtasks.length, 
    percent: Math.round((completed / task.subtasks.length) * 100) 
  };
}

function toggleDarkMode() {
  darkMode = !darkMode;
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  saveTheme();
  
  // Update toggle button text
  const toggleBtns = document.querySelectorAll('#theme-toggle, .mobile-header [data-action="theme"]');
  toggleBtns.forEach(btn => btn.textContent = darkMode ? '☀️' : '🌙');
  
  // Update settings toggle if visible
  const settingsToggle = document.getElementById('dark-mode-toggle');
  if (settingsToggle) settingsToggle.checked = darkMode;
}

// ==========================================
// SETTINGS (IMPORT / EXPORT / CLEAR)
// ==========================================
function setupSettings() {
  // Dark mode toggle in settings
  const dmToggle = document.getElementById('dark-mode-toggle');
  if (dmToggle) {
    dmToggle.checked = darkMode;
    dmToggle.addEventListener('change', toggleDarkMode);
  }
  
  // Export button
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportTasks);
  
  // Import button
  const importBtn = document.getElementById('import-btn');
  const importInput = document.getElementById('import-input');
  
  if (importBtn) importBtn.addEventListener('click', () => {
    if (importInput) importInput.click();
  });
  
  if (importInput) {
    importInput.addEventListener('change', (e) => { 
      if (e.target.files[0]) importTasks(e.target.files[0]); 
      // Reset input so the same file can be selected again
      e.target.value = '';
    });
  }
  
  // Clear button
  const clearBtn = document.getElementById('clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearAllData);
}

function exportTasks() {
  const data = JSON.stringify(tasks, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'taskflow-backup.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
  showToast('Tasks exported! 📥', 'success');
}

function importTasks(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        // We could merge or replace. The prompt says "imported tasks" implying replacement or overwrite.
        tasks = imported;
        saveTasks();
        renderAll();
        showToast(`Imported ${imported.length} tasks! 📤`, 'success');
      } else {
        showToast('Invalid file format', 'error');
      }
    } catch (err) {
      showToast('Error reading file', 'error');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (confirm('Are you sure you want to delete ALL tasks? This cannot be undone.')) {
    tasks = [];
    saveTasks();
    renderAll();
    showToast('All tasks cleared', 'info');
  }
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
document.addEventListener('keydown', function(e) {
  // Don't trigger if typing in input/textarea
  if (e.target.matches('input, textarea, select')) {
    if (e.key === 'Escape') {
      e.target.blur();
      closeAllModals();
    }
    return;
  }
  
  switch (e.key.toLowerCase()) {
    case 'n': 
      openCreateModal(); 
      e.preventDefault(); 
      break;
    case '/': 
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
      e.preventDefault(); 
      break;
    case 'escape': 
      closeAllModals(); 
      break;
    case 'd': 
      toggleDarkMode(); 
      break;
    case '1': 
      navigateTo('dashboard'); 
      break;
    case '2': 
      navigateTo('tasks'); 
      break;
    case '3': 
      navigateTo('today'); 
      break;
    case '4': 
      navigateTo('projects'); 
      break;
    case '5': 
      navigateTo('settings'); 
      break;
    case '?': 
      toggleShortcutsModal(); 
      break;
  }
});

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.toggle('active');
}

// ==========================================
// DEFAULT DATA
// ==========================================
function getDefaultTasks() {
  return [
    {
      id: crypto.randomUUID(),
      title: 'Finish JavaScript project',
      description: 'Complete the Canvas API section and submit',
      priority: 'high',
      category: 'Programming',
      dueDate: '2026-10-05',
      completed: false,
      status: 'in-progress',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      subtasks: [
        { id: crypto.randomUUID(), title: 'Setup project structure', completed: true },
        { id: crypto.randomUUID(), title: 'Implement Canvas drawing', completed: true },
        { id: crypto.randomUUID(), title: 'Add animations', completed: false },
        { id: crypto.randomUUID(), title: 'Write documentation', completed: false }
      ]
    },
    {
      id: crypto.randomUUID(),
      title: 'Design portfolio website',
      description: 'Create mockups and wireframes for the new portfolio',
      priority: 'medium',
      category: 'Design',
      dueDate: '2026-10-08',
      completed: false,
      status: 'todo',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      subtasks: [
        { id: crypto.randomUUID(), title: 'Research inspiration', completed: true },
        { id: crypto.randomUUID(), title: 'Create wireframes', completed: false },
        { id: crypto.randomUUID(), title: 'Design in Figma', completed: false }
      ]
    },
    {
      id: crypto.randomUUID(),
      title: 'Write blog post about CSS Grid',
      description: 'Share insights about advanced CSS Grid techniques',
      priority: 'low',
      category: 'Education',
      dueDate: '2026-10-10',
      completed: false,
      status: 'todo',
      createdAt: new Date(Date.now() - 259200000).toISOString(),
      subtasks: []
    },
    {
      id: crypto.randomUUID(),
      title: 'Grocery shopping',
      description: 'Buy fruits, vegetables, and weekly essentials',
      priority: 'medium',
      category: 'Personal',
      dueDate: '2026-10-03',
      completed: false,
      status: 'todo',
      createdAt: new Date(Date.now() - 345600000).toISOString(),
      subtasks: []
    },
    {
      id: crypto.randomUUID(),
      title: 'Morning workout routine',
      description: '30 minutes cardio + 20 minutes strength training',
      priority: 'high',
      category: 'Health',
      dueDate: '2026-10-03',
      completed: true,
      status: 'done',
      createdAt: new Date(Date.now() - 432000000).toISOString(),
      subtasks: []
    },
    {
      id: crypto.randomUUID(),
      title: 'Review marketing strategy',
      description: 'Analyze Q3 results and plan Q4 campaigns',
      priority: 'high',
      category: 'Marketing',
      dueDate: '2026-10-01',
      completed: false,
      status: 'todo',
      createdAt: new Date(Date.now() - 518400000).toISOString(),
      subtasks: []
    }
  ];
}
