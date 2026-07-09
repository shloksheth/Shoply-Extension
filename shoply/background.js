// Shoply background service worker
// Handles first-install setup so the popup always has at least one list to show.

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const { shoply_lists } = await chrome.storage.local.get("shoply_lists");
    if (!shoply_lists) {
      const defaultList = {
        id: crypto.randomUUID(),
        name: "Wishlist",
        emoji: "✦",
        createdAt: Date.now(),
        items: []
      };
      await chrome.storage.local.set({
        shoply_lists: [defaultList],
        shoply_active_list: defaultList.id,
        shoply_view_mode: "icon"
      });
    }
  }
});
