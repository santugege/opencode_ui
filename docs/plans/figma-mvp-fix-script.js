const mutatedNodeIds = [];

const page = figma.root.children.find((p) => p.name === "MVP Screens");
if (!page) throw new Error("MVP Screens page not found");

await figma.setCurrentPageAsync(page);

for (const root of page.children) {
  if (!root.name || !root.name.startsWith("AI Workspace /")) continue;

  const sidebars = root.findAll((n) => n.type === "FRAME" && n.name === "Sidebar");
  for (const sidebar of sidebars) {
    const spacer = sidebar.findOne((n) => n.type === "FRAME" && n.name === "Sidebar Spacer");
    const user = sidebar.findOne((n) => n.type === "FRAME" && n.name === "User Menu");

    if (spacer && "resize" in spacer) {
      spacer.resize(256, 344);
      mutatedNodeIds.push(spacer.id);
    }

    if (user) {
      user.y = 846;
      mutatedNodeIds.push(user.id);
    }
  }

  const main = root.findOne((n) => n.type === "FRAME" && n.name === "Main Chat Area");
  if (main && "resize" in main) {
    main.resize(1160, 900);
    mutatedNodeIds.push(main.id);
  }
}

return { success: true, mutatedNodeIds, count: mutatedNodeIds.length };
