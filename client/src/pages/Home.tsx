import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Aperture,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Columns3,
  FileImage,
  ImagePlus,
  PanelTop,
  Sparkles,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BatchColorizer from "@/components/BatchColorizer";
import PhotoComparison from "@/components/PhotoComparison";
import PhotoUploadPanel from "@/components/PhotoUploadPanel";
import {
  colorizePhoto,
  fetchColorizationModelCatalog,
  fetchPrivatePhoto,
  getPreferredImageModelId,
  setPreferredImageModelId,
  type ColorStyle,
  type ColorizationProvider,
  type ColorizationModelOption,
} from "@/lib/photoApi";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const SAMPLE_IMAGE = "/images/demo-before.jpg";
const SAMPLE_RESULT_IMAGE = "/images/demo-after.jpg";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
type Photo = {
  src: string;
  name: string;
  bytes?: number;
  example: boolean;
  blobUrl?: string;
  resultSrc?: string;
  historyId?: string;
  style?: ColorStyle;
};
type WorkStatus = "empty" | "ready" | "processing" | "complete" | "error";
type ViewMode = "compare" | "side";

function prettyBytes(bytes?: number) {
  return bytes
    ? `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`
    : "Example photo";
}

export default function Home() {
  const utils = trpc.useUtils();
  const [photo, setPhoto] = useState<Photo>({
    src: SAMPLE_IMAGE,
    name: "An afternoon by the lake",
    example: true,
    resultSrc: SAMPLE_RESULT_IMAGE,
  });
  const [status, setStatus] = useState<WorkStatus>("complete");
  const [comparison, setComparison] = useState(53);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [style, setStyle] = useState<ColorStyle>("natural");
  const [provider, setProvider] = useState<ColorizationProvider>("reimagine");
  const [cutoutProAvailable, setCutoutProAvailable] = useState(false);
  const [modelOptions, setModelOptions] = useState<ColorizationModelOption[]>(
    []
  );
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const objectUrls = useRef(new Set<string>());
  const requestId = useRef(0);
  const [location] = useLocation();

  useEffect(() => {
    let active = true;
    void fetchColorizationModelCatalog()
      .then(catalog => {
        if (!active) return;
        setModelOptions(catalog.models);
        setCutoutProAvailable(catalog.cutoutProAvailable);
        setModelError(catalog.modelError ?? "");
        if (!catalog.models.length) {
          setSelectedModelId("");
          return;
        }
        const preferredModelId = getPreferredImageModelId();
        const preferredIsAvailable = catalog.models.some(
          model => model.id === preferredModelId
        );
        if (preferredModelId && !preferredIsAvailable) {
          setSelectedModelId(preferredModelId);
          setModelError(
            "Your previously selected model is no longer available. Choose another model."
          );
          return;
        }
        const nextModelId = preferredModelId ?? catalog.defaultModelId;
        setSelectedModelId(nextModelId);
        setPreferredImageModelId(nextModelId);
      })
      .catch(error => {
        if (!active) return;
        setModelError(
          error instanceof Error
            ? error.message
            : "Available image models could not be loaded."
        );
      })
      .finally(() => {
        if (active) setModelLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => objectUrls.current.forEach(url => URL.revokeObjectURL(url)),
    []
  );
  function clearUrl(url?: string) {
    if (url && objectUrls.current.delete(url)) URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const savedId = new URLSearchParams(window.location.search).get("photo");
    if (!savedId) return;
    const requestNumber = ++requestId.current;
    setMessage("Opening your saved photo…");
    setErrorMessage("");
    void (async () => {
      try {
        const saved = await utils.library.list.fetch({
          search: "",
          sort: "newest",
          favoritesOnly: false,
        });
        const record = saved.find(item => item.id === savedId);
        if (!record)
          throw new Error("This photo is no longer in your history.");
        const [original, result] = await Promise.all([
          fetchPrivatePhoto(record.id, "original"),
          fetchPrivatePhoto(record.id, "colorized"),
        ]);
        if (requestId.current !== requestNumber) return;
        const originalUrl = URL.createObjectURL(original);
        const resultUrl = URL.createObjectURL(result);
        objectUrls.current.add(originalUrl);
        objectUrls.current.add(resultUrl);
        setPhoto({
          src: originalUrl,
          name: record.title,
          bytes: original.size,
          example: false,
          blobUrl: originalUrl,
          resultSrc: resultUrl,
          historyId: record.id,
          style: record.style,
        });
        setStyle(record.style);
        setStatus("complete");
        setMessage("Saved photo opened from your history.");
        window.history.replaceState(null, "", window.location.pathname);
      } catch (error) {
        if (requestId.current !== requestNumber) return;
        setStatus("error");
        setMessage("");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "This saved photo could not be opened."
        );
      }
    })();
    return () => {
      if (requestId.current === requestNumber) requestId.current += 1;
    };
  }, [location, utils.library.list]);

  function handleRemove() {
    requestId.current += 1;
    clearUrl(photo.blobUrl);
    clearUrl(photo.resultSrc);
    setPhoto({
      src: SAMPLE_IMAGE,
      name: "An afternoon by the lake",
      example: true,
      resultSrc: SAMPLE_RESULT_IMAGE,
    });
    setStatus("complete");
    setErrorMessage("");
    setMessage("");
  }

  function handleFile(file: File) {
    setErrorMessage("");
    setMessage("");
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image to continue.");
      return;
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setErrorMessage("Each image must be non-empty and 15 MB or smaller.");
      return;
    }
    requestId.current += 1;
    clearUrl(photo.blobUrl);
    clearUrl(photo.resultSrc);
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    setPhoto({
      src: url,
      name: file.name,
      bytes: file.size,
      example: false,
      blobUrl: url,
    });
    setStatus("ready");
  }

  async function handleColorize() {
    if (!photo || photo.example || status === "processing") return;
    if (
      provider === "reimagine" &&
      !modelOptions.some(model => model.id === selectedModelId)
    ) {
      setErrorMessage("Choose an available image model before colorizing.");
      return;
    }
    if (provider === "cutout-pro" && !cutoutProAvailable) {
      setErrorMessage("Cutout.Pro is not available for this account.");
      return;
    }
    const requestNumber = ++requestId.current;
    setStatus("processing");
    setErrorMessage("");
    setMessage("");
    try {
      const source = await fetch(photo.src).then(response => {
        if (!response.ok)
          throw new Error("The selected photo could not be opened.");
        return response.blob();
      });
      const saved = await colorizePhoto(
        source,
        photo.name,
        provider === "cutout-pro" ? "natural" : style,
        undefined,
        provider === "reimagine" ? selectedModelId : undefined,
        provider
      );
      const result = await fetchPrivatePhoto(saved.id, "colorized");
      if (requestId.current !== requestNumber) return;
      const resultUrl = URL.createObjectURL(result);
      objectUrls.current.add(resultUrl);
      clearUrl(photo.resultSrc);
      setPhoto(current => ({
        ...current,
        name: saved.title,
        resultSrc: resultUrl,
        historyId: saved.id,
        style: saved.style,
      }));
      setStatus("complete");
      setMessage("Colorized result saved to your private history.");
      await utils.library.list.invalidate();
    } catch (error) {
      if (requestId.current !== requestNumber) return;
      setStatus("error");
      setMessage("");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "This photo could not be colorized."
      );
    }
  }

  async function handleDownload() {
    if (!photo?.resultSrc) return;
    const response = await fetch(photo.resultSrc);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const ext =
      blob.type === "image/jpeg"
        ? "jpg"
        : blob.type === "image/webp"
          ? "webp"
          : "png";
    link.download = `${photo.name.replace(/\.[^.]+$/, "")}-colorized.${ext}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const ready = !!photo && (photo.example || !!photo.resultSrc);
  const selectedModel = modelOptions.find(
    model => model.id === selectedModelId
  );
  const selectedModelAvailable = Boolean(selectedModel);
  return (
    <div className="app-shell">
      <AppHeader active="studio" />
      <main id="top" className="workspace">
        <section className="intro">
          <div className="intro-copy">
            <div className="eyebrow">
              <span>YOUR PHOTO RESTORATION STUDIO</span>
              <span className="eyebrow-rule" />
            </div>
            <h1>
              Bring old memories
              <br />
              <em>back into color.</em>
            </h1>
            <p>
              Give a favorite black-and-white photograph a new point of view.
              Your original always stays untouched.
            </p>
          </div>
          <div
            className="intro-stamp"
            aria-label="Photo restoration, made thoughtful"
          >
            <span className="stamp-icon">
              <Sparkles size={19} />
            </span>
            <span>
              MADE FOR
              <br />
              THE MEMORIES
            </span>
          </div>
        </section>
        <section
          className="studio-grid"
          aria-label="Photo restoration workspace"
        >
          <div className="image-workspace">
            <div className="section-heading">
              <div className="section-title">
                <span className="step-number">01</span>
                <h2>Your photograph</h2>
              </div>
              <div
                className="comparison-actions"
                role="group"
                aria-label="Comparison display mode"
              >
                <button
                  className={`view-button ${viewMode === "compare" ? "selected" : ""}`}
                  onClick={() => setViewMode("compare")}
                  aria-pressed={viewMode === "compare"}
                >
                  <PanelTop size={15} />
                  <span>Slide</span>
                </button>
                <button
                  className={`view-button ${viewMode === "side" ? "selected" : ""}`}
                  onClick={() => setViewMode("side")}
                  aria-pressed={viewMode === "side"}
                >
                  <Columns3 size={15} />
                  <span>Side by side</span>
                </button>
              </div>
            </div>
            <PhotoComparison
              photo={photo}
              ready={ready}
              status={status}
              comparison={comparison}
              onComparisonChange={setComparison}
              viewMode={viewMode}
            />
            {status === "processing" && (
              <div className="photo-processing-progress" role="status">
                <span className="visually-hidden">Colorizing photo</span>
                <span className="photo-processing-track" aria-hidden="true">
                  <span className="photo-processing-line" />
                </span>
              </div>
            )}
            <div className="image-caption-row">
              <span className="photo-title">
                <FileImage size={15} />
                {photo.name}
              </span>
              <span className="photo-meta">{prettyBytes(photo.bytes)}</span>
            </div>
            {(message || errorMessage) && (
              <p
                className={errorMessage ? "error-note" : "success-note"}
                role={errorMessage ? "alert" : "status"}
              >
                {errorMessage ? <CircleAlert size={14} /> : <Check size={14} />}
                {errorMessage || message}
              </p>
            )}
          </div>
          <aside className="control-rail" aria-label="Photo controls">
            <div className="rail-topline">
              <span className="step-number">02</span>
              <span>RESTORATION DESK</span>
              <span className="rail-line" />
            </div>
            <PhotoUploadPanel
              photo={photo}
              status={status}
              message={message}
              onFile={handleFile}
              onRemove={handleRemove}
            />
            <div className="restore-card">
              <div className="restore-card-head">
                <span className="restore-icon">
                  <Sparkles size={17} />
                </span>
                <span>THE COLOR PASS</span>
              </div>
              <h3>Bring the scene back to life.</h3>
              <p>
                {provider === "cutout-pro"
                  ? "Use Cutout.Pro as a manual backup colorizer."
                  : "Choose a restrained or richer pass, then inspect the saved result in your history."}
              </p>
              <div className="provider-selector">
                <label htmlFor="colorization-provider">PROVIDER</label>
                <select
                  id="colorization-provider"
                  value={provider}
                  disabled={status === "processing"}
                  onChange={event => {
                    const nextProvider = event.currentTarget
                      .value as ColorizationProvider;
                    setProvider(nextProvider);
                    setErrorMessage("");
                    setModelError("");
                    if (nextProvider === "cutout-pro") setStyle("natural");
                  }}
                >
                  <option value="reimagine">Reimagine AI</option>
                  {cutoutProAvailable && (
                    <option value="cutout-pro">
                      Cutout.Pro · manual backup
                    </option>
                  )}
                </select>
                <small>
                  {provider === "cutout-pro"
                    ? "Manual choice only. Reimagine will not switch providers automatically."
                    : "Default provider. No backup is contacted unless you select it."}
                </small>
              </div>
              {provider === "reimagine" ? (
                <div className="model-selector">
                  <label htmlFor="colorization-model">AI MODEL</label>
                  <select
                    id="colorization-model"
                    value={selectedModelId}
                    disabled={modelLoading || !modelOptions.length}
                    onChange={event => {
                      const nextModelId = event.currentTarget.value;
                      setSelectedModelId(nextModelId);
                      setPreferredImageModelId(nextModelId);
                      setModelError("");
                    }}
                  >
                    {selectedModelId && !selectedModelAvailable && (
                      <option value={selectedModelId} disabled>
                        Previously selected model (unavailable)
                      </option>
                    )}
                    {modelOptions.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                  {modelLoading ? (
                    <small>Loading available models…</small>
                  ) : modelError ? (
                    <small className="model-selector-error" role="alert">
                      {modelError}
                    </small>
                  ) : (
                    <small>
                      Choice applies to single photos, library passes and
                      batches.
                    </small>
                  )}
                </div>
              ) : (
                <div className="provider-model-note">
                  <span>MODEL</span>
                  <strong>Cutout.Pro Colorizer</strong>
                  <small>
                    One standard color pass; no model choice required.
                  </small>
                </div>
              )}
              {provider === "reimagine" ? (
                <div
                  className="style-selector"
                  role="group"
                  aria-label="Color style"
                >
                  <span>COLOR STYLE</span>
                  <div>
                    <button
                      type="button"
                      className={style === "natural" ? "selected" : ""}
                      aria-pressed={style === "natural"}
                      onClick={() => setStyle("natural")}
                    >
                      Natural
                    </button>
                    <button
                      type="button"
                      className={style === "vivid" ? "selected" : ""}
                      aria-pressed={style === "vivid"}
                      onClick={() => setStyle("vivid")}
                    >
                      Vivid
                    </button>
                  </div>
                </div>
              ) : (
                <div className="provider-model-note provider-pass-note">
                  <span>COLOR PASS</span>
                  <strong>Standard</strong>
                  <small>Cutout.Pro applies its own color treatment.</small>
                </div>
              )}
              <button
                className="restore-button"
                onClick={() => void handleColorize()}
                disabled={
                  !photo ||
                  photo.example ||
                  status === "processing" ||
                  (provider === "reimagine" &&
                    (modelLoading || !selectedModelAvailable)) ||
                  (provider === "cutout-pro" && !cutoutProAvailable)
                }
              >
                {status === "processing" ? (
                  <>Colorizing photo</>
                ) : photo?.example ? (
                  <>
                    <ImagePlus size={16} /> Add a photo to begin{" "}
                    <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Colorize photo{" "}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
              {status === "complete" && !photo.example && (
                <div className="ready-pill">
                  <BadgeCheck size={14} /> Saved to history
                </div>
              )}
              <div className="model-disclosure">
                <Sparkles size={14} />
                <span>
                  AI-assisted colorization. Choose the provider and pass before
                  colorizing.
                </span>
              </div>
            </div>
            <button
              className="download-button"
              onClick={() => void handleDownload()}
              disabled={!photo || !ready}
            >
              <span className="download-icon">
                <ArrowDownToLine size={17} />
              </span>
              <span>
                <strong>Download colorized image</strong>
                <small>Save the restored result</small>
              </span>
              <ChevronRight size={17} />
            </button>
            <div className="tool-separator" aria-hidden="true">
              <span>OR COLORIZE A BATCH</span>
              <span className="rail-line" />
            </div>
            <BatchColorizer
              provider={provider}
              style={style}
              modelId={
                provider === "reimagine" && selectedModelAvailable
                  ? selectedModelId
                  : ""
              }
              modelLabel={
                provider === "cutout-pro"
                  ? "Cutout.Pro Colorizer"
                  : (selectedModel?.label ?? "Choose a model")
              }
            />
          </aside>
        </section>
        <footer className="page-footer">
          <a className="footer-brand" href="#top">
            <Aperture size={16} /> reimagine
          </a>
          <span>Old photos, seen with new eyes.</span>
          <a href="#top" className="back-top">
            Back to top
          </a>
        </footer>
      </main>
    </div>
  );
}
