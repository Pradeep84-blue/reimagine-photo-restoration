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
  LoaderCircle,
  PanelTop,
  Sparkles,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import BatchColorizer from "@/components/BatchColorizer";
import PhotoComparison from "@/components/PhotoComparison";
import PhotoUploadPanel from "@/components/PhotoUploadPanel";
import {
  colorizePhoto,
  fetchPrivatePhoto,
  type ColorStyle,
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
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const objectUrls = useRef(new Set<string>());
  const requestId = useRef(0);
  const [location] = useLocation();

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
    const requestNumber = ++requestId.current;
    setStatus("processing");
    setErrorMessage("");
    setMessage("Colorizing and saving this photo to your history…");
    try {
      const source = await fetch(photo.src).then(response => {
        if (!response.ok)
          throw new Error("The selected photo could not be opened.");
        return response.blob();
      });
      const saved = await colorizePhoto(source, photo.name, style);
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
              <h3>
                Vivid color.
                <br />
                Natural skin tones.
              </h3>
              <p>
                Choose a restrained or richer pass, then inspect the saved
                result in your history.
              </p>
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
              <button
                className="restore-button"
                onClick={() => void handleColorize()}
                disabled={!photo || photo.example || status === "processing"}
              >
                {status === "processing" ? (
                  <>
                    <LoaderCircle size={17} className="spin" /> Colorizing photo
                  </>
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
                  AI-assisted colorization, with Natural and Vivid treatments.
                </span>
              </div>
            </div>
            <BatchColorizer style={style} />
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
