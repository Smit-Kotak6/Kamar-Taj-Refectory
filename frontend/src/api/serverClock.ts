let offsetMs = 0;
export const syncServerClock = (serverNowIso: string) => {
  offsetMs = new Date(serverNowIso).getTime() - Date.now();
};
export const nowMs = () => Date.now() + offsetMs;