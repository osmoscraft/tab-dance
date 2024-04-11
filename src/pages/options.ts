import "./options.css";

console.log(`DEBUG=${!!globalThis.DEBUG}`);

chrome.commands.getAll(renderCommands);

function renderCommands(commands: chrome.commands.Command[]) {
  const visibleCommands = commands
    .filter((command) => command.description)
    .sort((a, b) => a.description!.localeCompare(b.description!));

  const container = document.getElementById("shortcuts-list");
  if (!container) return;
  container.innerHTML = visibleCommands
    .map((command) => {
      const shortcut = command.shortcut;
      return `<tr>
    <td>${command.description}</td>
    <td data-not-set="${!shortcut}">${shortcut || "Not set"}</td>
    </tr>`;
    })
    .join("");
}

window.addEventListener("click", (e) => {
  const actionTarget = (e.target as HTMLElement)?.closest("[data-action]") as HTMLElement;
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;

  switch (action) {
    case "setup-keybindings": {
      chrome.tabs.create({
        url: `chrome://extensions/shortcuts#${chrome.runtime.id}-title:~:text=Tab%20Dance`,
      });
      break;
    }
    case "reload-extension": {
      chrome.runtime.reload();
      break;
    }
  }
});
