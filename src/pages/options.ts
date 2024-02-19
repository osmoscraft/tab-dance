import "./options.css";

console.log("hello options page");

window.addEventListener("click", (e) => {
  const actionTarget = (e.target as HTMLElement)?.closest("[data-action]") as HTMLElement;
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;

  switch (action) {
    case "reload-extension": {
      chrome.runtime.reload();
      break;
    }
  }
});
