import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileImage,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  colorizePhoto,
  type ColorStyle,
  type ColorizationProvider,
} from "@/lib/photoApi";
import { trpc } from "@/lib/trpc";

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type QueueStatus = "queued" | "processing" | "complete" | "failed";
type BatchItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  historyId?: string;
  error?: string;
};

export default function BatchColorizer({
  provider,
  style,
  modelId,
  modelLabel,
}: {
  provider: ColorizationProvider;
  style: ColorStyle;
  modelId: string;
  modelLabel: string;
}) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<BatchItem[]>([]);
  const processingRef = useRef(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [batchId, setBatchId] = useState("");
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () =>
      itemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl)),
    []
  );

  function updateItem(id: string, changes: Partial<BatchItem>) {
    setItems(current => {
      const next = current.map(item =>
        item.id === id ? { ...item, ...changes } : item
      );
      itemsRef.current = next;
      return next;
    });
  }

  function chooseFiles(selected: FileList | null) {
    if (!selected?.length) return;
    const files = Array.from(selected);
    if (itemsRef.current.length) {
      setErrorMessage("Finish or clear this batch before choosing another.");
      return;
    }
    if (files.length > MAX_FILES) {
      setErrorMessage(`Choose up to ${MAX_FILES} photos per batch.`);
      return;
    }
    const invalid = files.find(
      file =>
        !ALLOWED_TYPES.has(file.type) ||
        file.size > MAX_BYTES ||
        file.size === 0
    );
    if (invalid) {
      setErrorMessage(
        !ALLOWED_TYPES.has(invalid.type)
          ? "Every photo must be a JPEG, PNG, or WebP."
          : "Each photo must be non-empty and 15 MB or smaller."
      );
      return;
    }
    const nextBatchId = crypto.randomUUID();
    const nextItems = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "queued" as const,
    }));
    itemsRef.current = nextItems;
    setItems(nextItems);
    setBatchId(nextBatchId);
    setErrorMessage("");
    setSuccessMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function processJobs(onlyIds?: string[]) {
    if (processingRef.current) return;
    if (provider === "reimagine" && !modelId) {
      setErrorMessage(
        "Choose an available image model in the color pass above."
      );
      return;
    }
    const pending = itemsRef.current.filter(
      item =>
        (!onlyIds || onlyIds.includes(item.id)) &&
        (item.status === "queued" || item.status === "failed")
    );
    if (!pending.length) return;
    processingRef.current = true;
    setRunning(true);
    setErrorMessage("");
    setSuccessMessage("");
    let failures = 0;
    for (const item of pending) {
      updateItem(item.id, { status: "processing", error: undefined });
      try {
        const saved = await colorizePhoto(
          item.file,
          item.file.name,
          provider === "cutout-pro" ? "natural" : style,
          batchId || undefined,
          provider === "reimagine" ? modelId : undefined,
          provider
        );
        updateItem(item.id, { status: "complete", historyId: saved.id });
        await utils.library.list.invalidate();
      } catch (error) {
        failures += 1;
        updateItem(item.id, {
          status: "failed",
          error:
            error instanceof Error
              ? error.message
              : "This photo could not be colorized.",
        });
      }
    }
    processingRef.current = false;
    setRunning(false);
    setSuccessMessage(
      failures
        ? "Some photos could not be colorized. Retry the failed items."
        : "All photos are in your private history."
    );
  }

  function clearBatch() {
    if (running) return;
    items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    itemsRef.current = [];
    setBatchId("");
    setErrorMessage("");
    setSuccessMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const complete = items.filter(item => item.status === "complete").length;
  const failed = items.filter(item => item.status === "failed").length;
  const pending = items.filter(
    item => item.status === "queued" || item.status === "failed"
  ).length;

  return (
    <section className="batch-card" aria-labelledby="batch-heading">
      <div className="batch-card-heading">
        <span className="batch-icon">
          <Sparkles size={16} />
        </span>
        <div>
          <h3 id="batch-heading">Colorize a batch</h3>
          <p>
            {provider === "cutout-pro"
              ? "Cutout.Pro standard pass"
              : `${style === "vivid" ? "Vivid color" : "Natural color"} · ${modelLabel}`}
            · up to five photos, one at a time.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="Choose up to five photos for a batch"
        onChange={event => chooseFiles(event.currentTarget.files)}
      />
      {!items.length ? (
        <button
          className="batch-add-button"
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          <Plus size={16} /> Choose photos
        </button>
      ) : (
        <>
          <div className="batch-progress-heading" aria-live="polite">
            <span>
              {running
                ? "Processing batch"
                : `${complete} of ${items.length} complete`}
            </span>
            <strong>
              {complete}/{items.length}
            </strong>
          </div>
          <div className="batch-progress-track">
            <span
              style={{
                width: `${items.length ? (complete / items.length) * 100 : 0}%`,
              }}
            />
          </div>
          <ul className="batch-list">
            {items.map(item => (
              <li className={`batch-item batch-${item.status}`} key={item.id}>
                <img src={item.previewUrl} alt="" />
                <div className="batch-item-copy">
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <span>
                    {item.status === "processing"
                      ? "Colorizing…"
                      : item.status === "complete"
                        ? "Saved to your history"
                        : item.status === "failed"
                          ? (item.error ?? "Could not colorize")
                          : "Queued"}
                  </span>
                </div>
                {item.status === "complete" ? (
                  <Check size={16} className="batch-status-icon" />
                ) : item.status === "processing" ? (
                  <LoaderCircle size={16} className="spin batch-status-icon" />
                ) : item.status === "failed" ? (
                  <button
                    type="button"
                    className="batch-retry"
                    title="Retry this photo"
                    aria-label={`Retry ${item.file.name}`}
                    disabled={running}
                    onClick={() => void processJobs([item.id])}
                  >
                    <RotateCcw size={15} />
                  </button>
                ) : (
                  <FileImage size={16} className="batch-status-icon" />
                )}
              </li>
            ))}
          </ul>
          {errorMessage && (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p className="form-success" role="status">
              {successMessage}
            </p>
          )}
          <div className="batch-actions">
            {pending > 0 && (
              <button
                className="batch-run-button"
                type="button"
                disabled={running || (provider === "reimagine" && !modelId)}
                onClick={() => void processJobs()}
              >
                {running ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {running
                  ? "Colorizing…"
                  : failed
                    ? "Retry failed photos"
                    : `Colorize ${items.length} photos`}
                {!running && <ArrowRight size={15} />}
              </button>
            )}
            <button
              className="batch-clear-button"
              type="button"
              disabled={running}
              onClick={clearBatch}
            >
              <Trash2 size={14} /> Clear batch
            </button>
          </div>
        </>
      )}
      {!items.length && errorMessage && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      <p className="batch-footnote">
        Each completed photo is saved separately in your private history.
      </p>
    </section>
  );
}
