// Inicialização do Modal de Telemetria
document.addEventListener('DOMContentLoaded', () => {
  const telemetryModal = new bootstrap.Modal(document.getElementById('telemetryModal'));
  telemetryModal.show();
  logSystem("Sistema iniciado. Ambiente: DEV", "info");
});

function closeTelemetry(accepted) {
  const modalEl = document.getElementById('telemetryModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  modal.hide();
  logSystem(accepted ? "Telemetria ativada." : "Telemetria recusada.", "info");
}

function toggleDebug() {
  console.log("Debug Panel Toggled");
  // Lógica para mostrar painel de debug se necessário
}

// Objeto Principal da Aplicação
const App = {
  runTask: (task) => {
    logSystem(`Tarefa ${task} iniciada...`, "info");
    // Simulação de execução
    setTimeout(() => {
      logSystem(`Tarefa ${task} concluída com sucesso.`, "success");
    }, 1000);
  },
  clearTask: (task) => {
    logSystem(`Campos de ${task} limpos.`, "info");
  },
  queue: {
    pause: () => logSystem("Fila pausada.", "warning"),
    clear: () => {
      document.getElementById('queueList').innerHTML = '<li class="list-group-item text-center text-muted py-4">Fila vazia.</li>';
      logSystem("Fila limpa.", "info");
    }
  },
  runDiagnostics: () => logSystem("Diagnóstico executado. Status: OK", "success"),
  exportLogs: (type) => logSystem(`Exportando logs em ${type}...`, "info"),
  filterLogs: (type) => logSystem(`Filtro de logs alterado para: ${type}`, "info")
};

// Função de Log
function logSystem(msg, type = "info") {
  const container = document.getElementById('logs');
  const time = new Date().toLocaleTimeString();
  let colorClass = "text-secondary";
  if (type === "success") colorClass = "text-success";
  if (type === "warning") colorClass = "text-warning";
  if (type === "error") colorClass = "text-danger";

  const entry = document.createElement('div');
  entry.className = "log-entry mb-1";
  entry.innerHTML = `<span class="text-muted">[${time}]</span> <span class="${colorClass}">${msg}</span>`;
  container.prepend(entry);
}

// Toggle Sidebar Mobile
document.getElementById('toggleSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('show');
});
