import { autoUpdater } from "electron-updater";
import { dialog } from "electron";

export function setupUpdater() {
  autoUpdater.autoDownload = false;

  autoUpdater.on("update-available", (info) => {
    dialog.showMessageBox({
      type: "info",
      title: "Update available",
      message: `Prism v${info.version} is ready to install.`,
    });
  });

  autoUpdater.checkForUpdatesAndNotify();
}
