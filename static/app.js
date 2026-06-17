const PAGE_TITLES = {
  dashboard: "仪表盘",
  tasks: "备份任务",
  backups: "备份文件",
  history: "执行历史",
  logs: "运行日志",
  config: "配置管理",
};

const PAGE_SUBTITLES = {
  dashboard: "备份系统运行概览与关键指标",
  tasks: "管理定时备份计划，支持立即执行",
  backups: "浏览、下载或删除备份文件",
  history: "每次备份的详细执行记录",
  logs: "实时查看系统运行日志",
  config: "编辑 YAML 配置，保存后自动重载",
};

function typeIconClass(type) {
  const t = (type || "").toLowerCase();
  if (t === "mysql") return "mysql";
  if (["postgresql", "postgres", "pg"].includes(t)) return "pg";
  if (["file", "files", "directory", "dir"].includes(t)) return "file";
  return "other";
}

function typeIconLabel(type) {
  const cls = typeIconClass(type);
  if (cls === "mysql") return "MY";
  if (cls === "pg") return "PG";
  if (cls === "file") return "FS";
  return "BK";
}

function typeTag(type) {
  const cls = typeIconClass(type);
  const labels = { mysql: "MySQL", pg: "PostgreSQL", file: "文件", other: type || "-" };
  return `<span class="type-tag ${cls}">${labels[cls]}</span>`;
}

let authToken = localStorage.getItem("autobackup_token") || "";
let currentPage = "dashboard";
let logsTimer = null;

function headers() {
  const h = { "Content-Type": "application/json" };
  if (authToken) h["X-Auth-Token"] = authToken;
  return h;
}

async function api(path, options = {}) {
  const url = authToken && !path.includes("token=")
    ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(authToken)}`
    : path;
  const resp = await fetch(url, { ...options, headers: { ...headers(), ...options.headers } });
  if (resp.status === 401) {
    const input = prompt("请输入访问 Token:");
    if (input) {
      authToken = input;
      localStorage.setItem("autobackup_token", input);
      return api(path, options);
    }
    throw new Error("未授权");
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `请求失败 (${resp.status})`);
  return data;
}

function toast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${type}`;
  setTimeout(() => el.classList.add("hidden"), 3000);
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function formatCountdown(seconds) {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds} 秒后`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟后`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时后`;
  return `${Math.floor(seconds / 86400)} 天后`;
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.page === page);
  });
  document.getElementById("page-title").textContent = PAGE_TITLES[page] || page;
  document.getElementById("page-subtitle").textContent = PAGE_SUBTITLES[page] || "";
  refreshCurrentPage();
}

function refreshCurrentPage() {
  switch (currentPage) {
    case "dashboard": loadDashboard(); break;
    case "tasks": loadTasks(); break;
    case "backups": loadBackups(); break;
    case "history": loadHistory(); break;
    case "logs": loadLogs(); break;
    case "config": loadConfig(); break;
  }
}

async function loadDashboard() {
  try {
    const [status, tasks, history] = await Promise.all([
      api("/api/status"),
      api("/api/tasks"),
      api("/api/history?limit=8"),
    ]);

    const badge = document.getElementById("scheduler-badge");
    const running = status.scheduler_running;
    badge.className = `status-pill${running ? " running" : ""}`;
    badge.innerHTML = `
      <span class="status-dot"></span>
      <span class="status-text">${running ? "调度器运行中" : "调度器未运行"}</span>
    `;

    document.getElementById("stat-tasks").textContent = status.task_count;
    document.getElementById("stat-tasks-sub").textContent = `${status.enabled_task_count} 个已启用`;
    document.getElementById("stat-backups").textContent = status.backup_count;
    document.getElementById("stat-backups-sub").textContent = `共 ${status.total_backup_size_human}`;
    document.getElementById("stat-rate").textContent = `${status.history.success_rate}%`;
    document.getElementById("stat-rate-sub").textContent =
      `${status.history.success_count} 成功 / ${status.history.failure_count} 失败`;

    const last = status.history.last_run;
    if (last) {
      document.getElementById("stat-last").textContent = last.task_name;
      document.getElementById("stat-last-sub").textContent =
        `${last.end_time} · ${last.success ? "成功" : "失败"}`;
    } else {
      document.getElementById("stat-last").textContent = "暂无";
      document.getElementById("stat-last-sub").textContent = "-";
    }

    const tasksEl = document.getElementById("dashboard-tasks");
    if (!tasks.tasks.length) {
      tasksEl.innerHTML = '<div class="empty-state">暂无备份任务</div>';
    } else {
      tasksEl.innerHTML = tasks.tasks.map((t) => `
        <div class="task-mini">
          <div class="task-mini-left">
            <div class="task-mini-icon ${typeIconClass(t.type)}">${typeIconLabel(t.type)}</div>
            <div>
              <div class="task-mini-name">${esc(t.name)}</div>
              <div class="task-mini-meta">${esc(t.type_label)} · ${esc(t.target || "-")}</div>
            </div>
          </div>
          <div class="task-mini-right">
            ${t.enabled
              ? `<span class="badge badge-success">启用</span>`
              : `<span class="badge badge-muted">禁用</span>`}
            <div class="task-mini-meta" style="margin-top:6px">
              ${t.next_run ? esc(t.next_run) : "无调度"}
            </div>
          </div>
        </div>
      `).join("");
    }

    const histEl = document.getElementById("dashboard-history");
    if (!history.history.length) {
      histEl.innerHTML = '<div class="empty-state">暂无执行记录</div>';
    } else {
      histEl.innerHTML = history.history.map((h) => `
        <div class="history-item">
          <div class="history-item-left">
            <div class="history-item-name">
              ${esc(h.task_name)}
              <span class="badge ${h.success ? "badge-success" : "badge-danger"}">
                ${h.success ? "成功" : "失败"}
              </span>
            </div>
            <div class="history-item-meta">
              ${esc(h.start_time)} · ${h.duration_seconds}s
              ${h.size_human ? ` · ${esc(h.size_human)}` : ""}
            </div>
          </div>
        </div>
      `).join("");
    }

    updateTaskFilter(tasks.tasks);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadTasks() {
  try {
    const data = await api("/api/tasks");
    const tbody = document.getElementById("tasks-table");
    if (!data.tasks.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">暂无任务</td></tr>`;
      return;
    }
    tbody.innerHTML = data.tasks.map((t) => `
      <tr>
        <td><strong>${esc(t.name)}</strong></td>
        <td>${typeTag(t.type)}</td>
        <td class="text-truncate" title="${esc(t.target)}">${esc(t.target || "-")}</td>
        <td class="mono">${esc(t.schedule || "-")}</td>
        <td>${t.next_run ? esc(t.next_run) : "-"}<br>
          <span class="text-muted">${formatCountdown(t.next_run_in_seconds)}</span></td>
        <td>${t.enabled
          ? '<span class="badge badge-success">启用</span>'
          : '<span class="badge badge-muted">禁用</span>'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-success btn-sm" onclick="runTask('${esc(t.name)}')">立即备份</button>
            <button class="btn btn-ghost btn-sm" onclick="toggleTask('${esc(t.name)}')">
              ${t.enabled ? "禁用" : "启用"}
            </button>
          </div>
        </td>
      </tr>
    `).join("");
    updateTaskFilter(data.tasks);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function runTask(name) {
  try {
    const data = await api(`/api/tasks/${encodeURIComponent(name)}/run`, { method: "POST" });
    toast(data.message);
    setTimeout(refreshCurrentPage, 2000);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function toggleTask(name) {
  try {
    const data = await api(`/api/tasks/${encodeURIComponent(name)}/toggle`, { method: "POST" });
    toast(data.message);
    loadTasks();
  } catch (e) {
    toast(e.message, "error");
  }
}

function updateTaskFilter(tasks) {
  const sel = document.getElementById("backup-task-filter");
  const current = sel.value;
  sel.innerHTML = '<option value="">全部任务</option>' +
    tasks.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join("");
  sel.value = current;
}

async function loadBackups() {
  try {
    const task = document.getElementById("backup-task-filter").value;
    const url = task ? `/api/backups?task=${encodeURIComponent(task)}` : "/api/backups";
    const data = await api(url);
    const tbody = document.getElementById("backups-table");
    if (!data.backups.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">暂无备份文件</td></tr>`;
      return;
    }
    tbody.innerHTML = data.backups.map((b) => `
      <tr>
        <td class="mono">${esc(b.filename)}</td>
        <td>${esc(b.task)}</td>
        <td>${b.type === "sql" ? '<span class="type-tag pg">数据库</span>' : '<span class="type-tag file">文件</span>'}</td>
        <td>${esc(b.size_human)}</td>
        <td>${esc(b.created_at)}</td>
        <td>
          <div class="btn-group">
            <a class="btn btn-ghost btn-sm" href="/api/backups/${encodeURIComponent(b.filename)}/download${authToken ? "?token=" + encodeURIComponent(authToken) : ""}">下载</a>
            <button class="btn btn-danger btn-sm" onclick="deleteBackup('${esc(b.filename)}')">删除</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteBackup(filename) {
  if (!confirm(`确定删除 ${filename}？`)) return;
  try {
    const data = await api(`/api/backups/${encodeURIComponent(filename)}`, { method: "DELETE" });
    toast(data.message);
    loadBackups();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadHistory() {
  try {
    const data = await api("/api/history?limit=100");
    const tbody = document.getElementById("history-table");
    if (!data.history.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state">暂无历史记录</td></tr>`;
      return;
    }
    tbody.innerHTML = data.history.map((h) => `
      <tr>
        <td><strong>${esc(h.task_name)}</strong></td>
        <td>${typeTag(h.task_type)}</td>
        <td><span class="badge ${h.success ? "badge-success" : "badge-danger"}">${h.success ? "成功" : "失败"}</span></td>
        <td>${esc(h.start_time)}</td>
        <td>${h.duration_seconds}s</td>
        <td>${esc(h.size_human || "-")}</td>
        <td class="text-truncate" title="${esc(h.filename || h.error || "")}">${esc(h.filename || h.error || "-")}</td>
      </tr>
    `).join("");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadLogs() {
  try {
    const data = await api("/api/logs?lines=300");
    const el = document.getElementById("logs-content");
    el.textContent = data.logs || "(空)";
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    toast(e.message, "error");
  }
}

async function loadConfig() {
  try {
    const data = await api("/api/config");
    document.getElementById("config-editor").value = data.content;
  } catch (e) {
    toast(e.message, "error");
  }
}

async function saveConfig() {
  const content = document.getElementById("config-editor").value;
  try {
    const data = await api("/api/config", {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    toast(data.message);
  } catch (e) {
    toast(e.message, "error");
  }
}

function updateClock() {
  document.getElementById("clock").textContent = new Date().toLocaleString("zh-CN");
}

function setupLogsAutoRefresh() {
  clearInterval(logsTimer);
  logsTimer = setInterval(() => {
    if (currentPage === "logs" && document.getElementById("logs-auto").checked) {
      loadLogs();
    }
  }, 5000);
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchPage(btn.dataset.page));
});

document.getElementById("refresh-btn").addEventListener("click", refreshCurrentPage);

document.addEventListener("DOMContentLoaded", () => {
  updateClock();
  setInterval(updateClock, 1000);
  setupLogsAutoRefresh();
  switchPage("dashboard");
  setInterval(() => {
    if (currentPage === "dashboard") loadDashboard();
  }, 30000);
});
