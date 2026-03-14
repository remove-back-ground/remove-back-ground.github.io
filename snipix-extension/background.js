chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "snipix-remove-bg",
    title: "Remove Background with Snipix AI",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "snipix-remove-bg") {
    const url = "https://remove-back-ground.github.io/?img=" + encodeURIComponent(info.srcUrl);
    chrome.tabs.create({ url });
  }
});
