/**
 * 🤖 Auto Robô v2.0 | GOI Style
 * Frontend Modular, Acessível e Otimizado
 */

const App = (() => {
  // 📦 Estado Global
  const state = {
    mode: localStorage.getItem("robô_mode") || "DEV",
    tasks: {
      GOI_CHECK: { status: "idle", params: {}, history: [] },
      WFM_CPF: { status: "idle", params: {}, history: [] },
      GPS_OPEN: { status: "idle", params: {}, history: [] },
      FULL: { status: "idle", params: {}, history: [] },
    },
    logs: [],
    metrics: {
      success: 0,
      failed: 0,
      totalTime: 0,
      count: 0,
      online: navigator.onLine,
    },
    telemetry: JSON.parse(localStorage.getItem("robô_telemetry") || "false"),
    debug: false,
    activeTask: null,
  };

  // 🔧 Utilitários
  const utils = {
    escape: (str) => {
      if (typeof str !== "string") return "";
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    },
    debounce: (fn, delay = 300) => {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    },
    formatCPF: (value) => {
      const nums = value.replace(/\D/g, "").slice(0, 11);
      return nums
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2");
    },
    announceSR: (msg) => {
      const el = document.createElement("div");
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.className = "sr-only";
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    },
    showToast: (msg, type = "info") => {
      const container = document.getElementById("toastContainer");
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "times-circle" : "info-circle"}"></i><span>${utils.escape(msg)}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(100%)";
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    },
    download: (filename, content, type) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    debugLog: (msg, data) => {
      if (!state.debug) return;
      const panel = document.getElementById("debugConsole");
      panel.textContent += `\n[${new Date().toLocaleTimeString()}] ${msg}\n${JSON.stringify(data || "", null, 2)}\n---`;
      panel.scrollTop = panel.scrollHeight;
    },
  };

  // 🎛️ Core Functions
  const init = () => {
    cacheDOM();
    applyTheme();
    bindEvents();
    loadState();
    updateMetrics();
    updateUI();
    utils.announceSR("Auto Robô v2.0 carregado com sucesso.");
    if (!localStorage.getItem("robô_telemetry_seen")) {
      setTimeout(
        () =>
          document.getElementById("telemetryBanner").classList.remove("hidden"),
        1500,
      );
    }
  };

  const cacheDOM = () => {
    document
      .querySelectorAll('input[id*="Cpf"]')
      .forEach((i) =>
        i.addEventListener(
          "input",
          (e) => (e.target.value = utils.formatCPF(e.target.value)),
        ),
      );
    document
      .querySelectorAll('input[id*="Order"]')
      .forEach((i) =>
        i.addEventListener(
          "input",
          (e) =>
            (e.target.value = e.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9\-]/g, "")),
        ),
      );
  };

  const loadState = () => {
    document
      .querySelectorAll(`.mode-btn[data-mode="${state.mode}"]`)
      .forEach((b) => b.classList.add("active"));
    document
      .querySelectorAll(".mode-btn")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.mode === state.mode),
      );
    document.getElementById("globalModeLabel").textContent = state.mode;
    loadHistoryChips();
  };

  const updateUI = () => {
    const dot = document.getElementById("globalStatusDot");
    const txt = document.getElementById("globalStatusText");
    dot.className = `status-dot ${state.mode === "PROD" ? "ready" : "idle"}`;
    txt.textContent =
      state.mode === "PROD"
        ? "Ambiente: Produção • Conexão segura ativa"
        : "Ambiente: Desenvolvimento • Mock local ativo";
  };

  const setTaskStatus = (taskKey, status) => {
    state.tasks[taskKey].status = status;
    const el = document.getElementById(`status-${taskKey}`);
    if (!el) return;
    const icons = {
      idle: "circle",
      running: "spinner",
      success: "check-circle",
      error: "times-circle",
    };
    const text = {
      idle: "Pronto",
      running: "Executando...",
      success: "Concluído",
      error: "Falha",
    };
    el.className = `task-status ${status}`;
    el.innerHTML = `<i class="fas fa-${icons[status]} ${status === "running" ? "fa-spin" : ""}"></i> ${text[status]}`;

    const btn = document.querySelector(`[data-task="${taskKey}"] .btn-run`);
    if (btn) btn.disabled = status === "running";
  };

  const addLog = (msg, task = "system") => {
    const logs = document.getElementById("logs");
    const entry = document.createElement("div");
    entry.className = `log-entry ${task !== "system" ? "" : "system"}`;
    entry.dataset.task = task;
    entry.innerHTML = `<small style="opacity:0.6">[${new Date().toLocaleTimeString()}]</small> ${task !== "system" ? `<strong>[${task}]</strong> ` : ""}${utils.escape(msg)}`;
    logs.prepend(entry);
    if (logs.children.length > 150) logs.removeChild(logs.lastChild);
    state.logs.push({ time: Date.now(), task, msg });
    if (state.debug) utils.debugLog(`[LOG] ${msg}`, { task });
  };

  const track = (event, props = {}) => {
    if (!state.telemetry) return;
    try {
      navigator.sendBeacon(
        "/api/telemetry",
        JSON.stringify({
          event,
          props,
          ts: Date.now(),
          ua: navigator.userAgent,
        }),
      );
    } catch {}
  };

  // ▶️ Execução de Tarefas
  const runTask = async (taskKey) => {
    if (state.tasks[taskKey].status === "running") return;
    const params = collectParams(taskKey);
    if (!validateParams(taskKey, params)) return;

    state.activeTask = taskKey;
    setTaskStatus(taskKey, "running");
    const start = Date.now();
    addLog(`Iniciando execução...`, taskKey);
    utils.announceSR(`${taskKey} em execução`);

    try {
      state.mode === "DEV"
        ? await mockExecution(taskKey, params)
        : await apiExecution(taskKey, params);
      state.metrics.success++;
      state.metrics.totalTime += Date.now() - start;
      state.metrics.count++;
      saveToHistory(taskKey, params);
      setTaskStatus(taskKey, "success");
      utils.showToast(`${taskKey} concluído com sucesso`, "success");
      addLog("✅ Concluído com sucesso", taskKey);
      track("task_success", { task: taskKey, time: Date.now() - start });
    } catch (err) {
      state.metrics.failed++;
      setTaskStatus(taskKey, "error");
      utils.showToast(`Erro em ${taskKey}: ${err.message}`, "error");
      addLog(`❌ Falha: ${err.message}`, taskKey);
      track("task_error", { task: taskKey, error: err.message });
    } finally {
      state.activeTask = null;
      updateMetrics();
    }
  };

  const collectParams = (taskKey) => {
    const p = {};
    const map = {
      GOI_CHECK: { order: "goiOrder" },
      WFM_CPF: { cpf: "wfmCpf" },
      GPS_OPEN: { param: "gpsParam" },
      FULL: { cpf: "fullCpf", order: "fullOrder" },
    };
    Object.entries(map[taskKey] || {}).forEach(([key, id]) => {
      const el = document.getElementById(id);
      p[key] = el ? el.value.trim() : "";
    });
    return p;
  };

  const validateParams = (taskKey, p) => {
    const rules = {
      GOI_CHECK: () => !!p.order,
      WFM_CPF: () => /^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})$/.test(p.cpf),
      GPS_OPEN: () => true,
      FULL: () => !!p.cpf && !!p.order,
    };
    const valid = rules[taskKey]();
    if (!valid) {
      utils.showToast(
        "Preencha os campos obrigatórios corretamente.",
        "warning",
      );
      utils.announceSR("Erro de validação. Verifique os campos.");
      track("validation_error", { task: taskKey });
    }
    return valid;
  };

  const mockExecution = (task, params) =>
    new Promise((res, rej) => {
      const delay = 800 + Math.random() * 1500;
      setTimeout(
        () =>
          Math.random() > 0.08
            ? res({ ok: true })
            : rej(new Error("Timeout simulado")),
        delay,
      );
    });

  const apiExecution = async (task, params) => {
    // Placeholder para integração real
    // return fetch(`/api/task/${task}`, { method: 'POST', body: JSON.stringify(params) }).then(r => r.json());
    throw new Error("API não configurada. Ative o modo DEV para testes.");
  };

  const saveToHistory = (task, params) => {
    const key =
      task === "FULL"
        ? params.order
        : task === "WFM_CPF"
          ? params.cpf
          : task === "GOI_CHECK"
            ? params.order
            : params.param;
    if (!key) return;
    state.tasks[task].history = [
      key,
      ...state.tasks[task].history.filter((h) => h !== key),
    ].slice(0, 5);
    localStorage.setItem(
      `robô_hist_${task}`,
      JSON.stringify(state.tasks[task].history),
    );
    loadHistoryChips();
  };

  const loadHistoryChips = () => {
    Object.keys(state.tasks).forEach((task) => {
      const container = document.querySelector(`#hist-${task} .history-chips`);
      if (!container) return;
      const hist = JSON.parse(
        localStorage.getItem(`robô_hist_${task}`) || "[]",
      );
      state.tasks[task].history = hist;
      container.innerHTML = hist
        .map(
          (v) =>
            `<button class="chip" onclick="App.fillFromHistory('${task}', '${utils.escape(v)}')">${utils.escape(v)}</button>`,
        )
        .join("");
      document
        .getElementById(`hist-${task}`)
        .classList.toggle("hidden", hist.length === 0);
    });
  };

  const fillFromHistory = (task, val) => {
    const inputs = {
      GOI_CHECK: "goiOrder",
      WFM_CPF: "wfmCpf",
      GPS_OPEN: "gpsParam",
      FULL: val.includes("-") ? "fullOrder" : "fullCpf",
    };
    const el = document.getElementById(inputs[task]);
    if (el) {
      el.value = val;
      el.focus();
      utils.showToast("Valor preenchido do histórico");
    }
  };

  // 🧹 Limpeza & Exportação
  const clearTask = (task) => {
    Object.keys(
      {
        GOI_CHECK: "goiOrder",
        WFM_CPF: "wfmCpf",
        GPS_OPEN: "gpsParam",
        FULL: "fullCpf,fullOrder",
      }[task].split(","),
    ).forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    setTaskStatus(task, "idle");
    addLog("🧹 Campos limpos", task);
  };

  const clearLogs = () => {
    document.getElementById("logs").innerHTML = "";
    state.logs = [];
    addLog("🗑️ Logs limpos", "system");
  };

  const exportLogs = () => {
    if (!state.logs.length)
      return utils.showToast("Nenhum log para exportar", "warning");
    const csv =
      "Time,Task,Message\n" +
      state.logs
        .map((l) => `${l.time},${l.task},${l.msg.replace(/"/g, '""')}`)
        .join("\n");
    utils.download(`auto-robô-logs-${Date.now()}.csv`, csv, "text/csv");
    utils.showToast("Logs exportados com sucesso", "success");
  };

  const exportSingle = (task) => {
    // Implementação futura baseada no retorno da API
    utils.showToast(`Exportação de ${task} disponível após execução`, "info");
  };

  const updateMetrics = () => {
    document.getElementById("metricSuccess").textContent =
      state.metrics.success;
    document.getElementById("metricFailed").textContent = state.metrics.failed;
    document.getElementById("metricAvgTime").textContent = state.metrics.count
      ? `${(state.metrics.totalTime / state.metrics.count / 1000).toFixed(1)}s`
      : "--";
    document.getElementById("metricStatus").textContent = state.metrics.online
      ? "Online"
      : "Offline";
    document.getElementById("metricConnectionIcon").className =
      `fas fa-${state.metrics.online ? "wifi" : "wifi-slash"}`;
  };

  // 🛡️ Diagnóstico & Telemetria
  const runDiagnostics = async () => {
    const res = document.getElementById("diagnosticResult");
    res.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    const checks = [
      {
        name: "LocalStorage",
        fn: () => {
          localStorage.setItem("_t", "1");
          localStorage.removeItem("_t");
          return true;
        },
      },
      {
        name: "Navegador Moderno",
        fn: () => typeof window.fetch !== "undefined",
      },
      { name: "Conexão", fn: () => navigator.onLine },
    ];
    const results = checks.map(
      (c) =>
        `<span style="color:${c.fn() ? "green" : "red"}"><i class="fas fa-${c.fn() ? "check" : "times"}-circle"></i> ${c.name}</span>`,
    );
    res.innerHTML = results.join(" • ");
    addLog("🔍 Diagnóstico executado", "system");
    track("diagnostic_run");
  };

  const bindEvents = () => {
    // Mode Selector
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-checked", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-checked", "true");
        state.mode = btn.dataset.mode;
        localStorage.setItem("robô_mode", state.mode);
        document.getElementById("globalModeLabel").textContent = state.mode;
        updateUI();
        addLog(`🔧 Modo alterado para: ${state.mode}`, "system");
        track("mode_change", { mode: state.mode });
      });
    });

    // Log Filter
    document.getElementById("logFilter").addEventListener("change", (e) => {
      document.querySelectorAll(".log-entry").forEach((l) => {
        l.classList.toggle(
          "hidden",
          e.target.value !== "all" && l.dataset.task !== e.target.value,
        );
      });
    });

    // Theme
    document.getElementById("themeToggle").addEventListener("click", () => {
      const html = document.documentElement;
      html.dataset.theme = html.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("robô_theme", html.dataset.theme);
      document.getElementById("themeToggle").innerHTML =
        `<i class="fas fa-${html.dataset.theme === "dark" ? "sun" : "moon"}"></i>`;
    });

    // Debug
    document.getElementById("debugToggle").addEventListener("click", () => {
      state.debug = !state.debug;
      document
        .getElementById("debugPanel")
        .classList.toggle("hidden", !state.debug);
      document
        .getElementById("debugPanel")
        .setAttribute("aria-hidden", !state.debug);
      addLog(
        state.debug ? "🐛 Debug ativado" : "🐛 Debug desativado",
        "system",
      );
    });

    // Sidebar Toggle
    document
      .getElementById("toggleSidebar")
      .addEventListener("click", () =>
        document.getElementById("sidebar").classList.toggle("open"),
      );

    // Telemetry
    document.getElementById("btnAcceptTelemetry").onclick = () => {
      state.telemetry = true;
      localStorage.setItem("robô_telemetry", "true");
      localStorage.setItem("robô_telemetry_seen", "true");
      document.getElementById("telemetryBanner").classList.add("hidden");
      utils.showToast("Telemetria ativada. Obrigado!", "success");
    };
    document.getElementById("btnDeclineTelemetry").onclick = () => {
      localStorage.setItem("robô_telemetry_seen", "true");
      document.getElementById("telemetryBanner").classList.add("hidden");
    };

    // Online/Offline
    window.addEventListener("online", () => {
      state.metrics.online = true;
      updateMetrics();
      utils.showToast("🟢 Conexão restaurada", "success");
    });
    window.addEventListener("offline", () => {
      state.metrics.online = false;
      updateMetrics();
      utils.showToast("🔴 Modo offline ativado", "warning");
    });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        const map = { 1: "goiOrder", 2: "wfmCpf", 3: "gpsParam" };
        document.getElementById(map[e.key])?.focus();
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        const active = document.activeElement;
        const card = active?.closest(".task-card");
        if (card) runTask(card.dataset.task);
      }
      if (e.key === "Escape" && state.activeTask) {
        utils.showToast("Execução cancelada", "warning");
        addLog("🛑 Cancelado pelo usuário", state.activeTask);
        state.activeTask = null;
        setTaskStatus(state.activeTask, "idle");
      }
      if (
        e.key.toLowerCase() === "d" &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement.tagName !== "INPUT"
      )
        runDiagnostics();
    });
  };

  const applyTheme = () => {
    const saved =
      localStorage.getItem("robô_theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = saved;
    document.getElementById("themeToggle").innerHTML =
      `<i class="fas fa-${saved === "dark" ? "sun" : "moon"}"></i>`;
  };

  return {
    runTask,
    clearTask,
    clearLogs,
    exportLogs,
    exportSingle,
    runDiagnostics,
    fillFromHistory,
  };
})();

// 🌍 Global Handlers
window.addEventListener("unhandledrejection", (e) =>
  console.error("Promise não tratada:", e.reason),
);
window.addEventListener("error", (e) =>
  console.error("Erro global:", e.error || e.message),
);

// 🚀 Init
document.addEventListener("DOMContentLoaded", () => {
  App; // Garante escopo
});

// Substitua o manipulador do banner de telemetria por:
const telemDialog = document.getElementById("telemetryDialog");
if (!localStorage.getItem("robô_telemetry_seen"))
  setTimeout(() => telemDialog.showModal(), 1500);

document.getElementById("telemetryForm").addEventListener("submit", (e) => {
  const choice = e.submitter.value;
  localStorage.setItem(
    "robô_telemetry",
    choice === "accept" ? "true" : "false",
  );
  localStorage.setItem("robô_telemetry_seen", "true");
  telemDialog.close();
  utils.toast(
    choice === "accept" ? "📊 Telemetria ativada" : "📊 Telemetria desativada",
    "info",
  );
});

// Config Dialog
document.getElementById("openConfig").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("configDialog").showModal();
});

document.getElementById("configForm").addEventListener("submit", (e) => {
  e.preventDefault();
  App.saveConfig();
  document.getElementById("configDialog").close();
});
