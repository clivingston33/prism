import Store from "electron-store";
import { app } from "electron";

export const defaultSettings: any = {
  defaultVideoFormat: "mp4",
  defaultAudioFormat: "mp3",
  maxConcurrentDownloads: 2,
  downloadLocation: app.getPath("downloads"),
  historyRetentionDays: -1,
  videoAutoDeleteDays: 0,
  theme: "system",
};

export const store = new Store({
  name: "prism-settings",
  defaults: {
    settings: defaultSettings,
    history: [],
  },
});
