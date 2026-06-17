import { useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { isTauriRuntime } from "../lib/tauri";

type UpdateStatus = "idle" | "available" | "downloading" | "relaunching" | "error";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let amount = value;
  let unitIndex = 0;

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }

  return `${amount.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function UpdateNotice() {
  const didCheck = useRef(false);
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime() || didCheck.current) return;
    didCheck.current = true;

    let cancelled = false;

    check({ timeout: 12_000 })
      .then((availableUpdate) => {
        if (cancelled || !availableUpdate) return;
        setUpdate(availableUpdate);
        setStatus("available");
      })
      .catch((error) => {
        // Update checks should never block normal app startup.
        console.info("Update check skipped:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!update || status === "idle") return null;

  const progressLabel = contentLength
    ? `${formatBytes(downloadedBytes)} / ${formatBytes(contentLength)}`
    : downloadedBytes > 0
      ? formatBytes(downloadedBytes)
      : "подготовка…";
  const progressPercent = contentLength ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100)) : 0;

  async function installUpdate() {
    if (!update) return;

    setStatus("downloading");
    setErrorMessage(null);
    setDownloadedBytes(0);
    setContentLength(null);

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null);
          setDownloadedBytes(0);
        }

        if (event.event === "Progress") {
          setDownloadedBytes((current) => current + event.data.chunkLength);
        }
      });

      setStatus("relaunching");
      await relaunch();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось установить обновление.");
    }
  }

  return (
    <aside className="update-notice" role="status" aria-live="polite">
      <div className="update-notice-icon">
        <i className="ti ti-download" aria-hidden="true" />
      </div>
      <div className="update-notice-body">
        <b>Доступна новая версия RamTeamAi {update.version}</b>
        <span>
          Сейчас установлена {update.currentVersion}. {update.body ? update.body : "Можно скачать и установить обновление."}
        </span>
        {status === "downloading" ? (
          <div className="update-progress" aria-label={`Загрузка обновления: ${progressLabel}`}>
            <i style={{ width: `${progressPercent}%` }} />
            <small>{progressLabel}</small>
          </div>
        ) : null}
        {status === "error" && errorMessage ? <small className="update-error">{errorMessage}</small> : null}
      </div>
      <div className="update-notice-actions">
        <button
          className="primary"
          type="button"
          onClick={() => void installUpdate()}
          disabled={status === "downloading" || status === "relaunching"}
        >
          {status === "downloading" ? "Загрузка…" : status === "relaunching" ? "Перезапуск…" : "Обновить"}
        </button>
        <button className="ghost" type="button" onClick={() => setUpdate(null)} disabled={status === "downloading" || status === "relaunching"}>
          Позже
        </button>
      </div>
    </aside>
  );
}
