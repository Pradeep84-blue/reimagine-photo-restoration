import { useEffect, useRef, useState } from "react";
import {
  Aperture,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Columns3,
  FileImage,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  PanelTop,
  Sparkles,
} from "lucide-react";
import PhotoComparison from "@/components/PhotoComparison";
import PhotoUploadPanel from "@/components/PhotoUploadPanel";

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
  storageUrl?: string;
  resultSrc?: string;
};
type WorkStatus =
  | "empty"
  | "uploading"
  | "ready"
  | "processing"
  | "complete"
  | "error";
type ViewMode = "compare" | "side";

function prettyBytes(bytes?: number) {
  if (!bytes) return "Example photo";
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

async function uploadPhotoBlob(blob: Blob, contentType: string) {
  const response = await fetch("/api/photos/upload", {
    method: "POST",
    headers: { "Content-Type": contentType, "X-Photo-Kind": "original" },
    body: blob,
  });
  const data = (await response.json().catch(() => ({}))) as {
    assetUrl?: string;
    error?: string;
  };
  if (!response.ok || !data.assetUrl) {
    throw new Error(
      data.error ||
        (response.status === 413
          ? "Image must be 15 MB or smaller."
          : "Project file storage is unavailable right now.")
    );
  }
  return data.assetUrl;
}

async function requestColorization(photo: Blob) {
  const response = await fetch("/api/photos/colorize", {
    method: "POST",
    headers: { "Content-Type": photo.type },
    body: photo,
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      data.error || "Colorization could not be completed. Please try again."
    );
  }
  const resultBlob = await response.blob();
  const storageUrl = response.headers.get("X-Photo-Asset-Url");
  if (!resultBlob.size || !storageUrl)
    throw new Error(
      "The colorized result could not be loaded. Please try again."
    );
  return resultBlob;
}

export default function Home() {
  const [photo, setPhoto] = useState<Photo | null>({
    src: SAMPLE_IMAGE,
    name: "An afternoon by the lake",
    example: true,
    resultSrc: SAMPLE_RESULT_IMAGE,
  });
  const [status, setStatus] = useState<WorkStatus>("complete");
  const [comparison, setComparison] = useState(53);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const requestId = useRef(0);
  const objectUrls = useRef(new Set<string>());

  useEffect(
    () => () => {
      objectUrls.current.forEach(url => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    },
    []
  );

  function releasePhotoUrls(current: Photo | null) {
    for (const url of [current?.blobUrl, current?.resultSrc]) {
      if (url && objectUrls.current.delete(url)) URL.revokeObjectURL(url);
    }
  }

  async function handleFile(file: File) {
    setErrorMessage("");
    setStorageMessage("");
    setDownloaded(false);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage("Choose a JPEG, PNG, or WebP image to continue.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage(
        "This image is larger than 15 MB. Choose a smaller file."
      );
      return;
    }
    const id = ++requestId.current;
    releasePhotoUrls(photo);
    const localUrl = URL.createObjectURL(file);
    objectUrls.current.add(localUrl);
    setPhoto({
      src: localUrl,
      name: file.name,
      bytes: file.size,
      example: false,
      blobUrl: localUrl,
    });
    setStatus("uploading");
    setProgress(0);

    try {
      const storageUrl = await uploadPhotoBlob(file, file.type);
      if (requestId.current !== id) return;
      setPhoto(current =>
        current?.blobUrl === localUrl ? { ...current, storageUrl } : current
      );
      setStatus("ready");
      setStorageMessage(
        "Original uploaded to project storage and ready for processing."
      );
    } catch (error) {
      if (requestId.current !== id) return;
      setStatus("error");
      setStorageMessage(
        error instanceof Error
          ? error.message
          : "Project storage transfer failed. Your photo remains in this tab only."
      );
    }
  }

  function handleRemove() {
    requestId.current += 1;
    releasePhotoUrls(photo);
    setPhoto(null);
    setStatus("empty");
    setErrorMessage("");
    setStorageMessage("");
    setProgress(0);
  }

  async function handleColorize() {
    if (
      !photo ||
      photo.example ||
      status === "processing" ||
      status === "uploading"
    )
      return;
    const currentRequest = requestId.current;
    setErrorMessage("");
    setDownloaded(false);
    setStorageMessage(
      photo.storageUrl
        ? "Original saved. AI colorization is in progress…"
        : "Colorizing this photo from your tab…"
    );
    setStatus("processing");
    setProgress(0);
    for (const value of [16, 34, 54, 72, 86]) {
      await new Promise(resolve => window.setTimeout(resolve, 330));
      if (requestId.current !== currentRequest) return;
      setProgress(value);
    }
    if (!photo.example) {
      try {
        const original = await fetch(photo.src);
        if (!original.ok)
          throw new Error("The uploaded photo could not be opened.");
        const originalBlob = await original.blob();
        if (requestId.current !== currentRequest) return;
        const resultBlob = await requestColorization(originalBlob);
        if (requestId.current !== currentRequest) return;
        const resultSrc = URL.createObjectURL(resultBlob);
        objectUrls.current.add(resultSrc);
        setPhoto(current => {
          if (!current || current.blobUrl !== photo.blobUrl) return current;
          if (current.resultSrc && objectUrls.current.delete(current.resultSrc))
            URL.revokeObjectURL(current.resultSrc);
          return { ...current, resultSrc };
        });
        setStorageMessage(
          photo.storageUrl
            ? "Original and AI colorized result saved to project storage."
            : "AI result saved; the original remains in this tab only."
        );
      } catch (error) {
        if (requestId.current !== currentRequest) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The preview could not be prepared."
        );
        setStorageMessage(
          photo.storageUrl
            ? "Original saved. Colorization did not complete."
            : "The original remains in this tab; colorization did not complete."
        );
        setStatus("error");
        return;
      }
    }
    setProgress(100);
    setStatus("complete");
  }

  async function handleDownload() {
    if (!photo) return;
    try {
      const image = new Image();
      image.src = photo.resultSrc || photo.src;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("The preview image could not be opened."));
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Canvas download is not supported in this browser.");
      context.drawImage(image, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        const link = document.createElement("a");
        const downloadUrl = URL.createObjectURL(blob);
        link.href = downloadUrl;
        link.download = `${photo.name.replace(/\.[^.]+$/, "")}-color-preview.png`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        setDownloaded(true);
      }, "image/png");
    } catch {
      setErrorMessage("We couldn't prepare this download. Please try again.");
    }
  }

  const ready =
    !!photo && (photo.example || !!photo.resultSrc || status === "complete");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Reimagine home">
          <span className="brand-symbol" aria-hidden="true">
            <Aperture size={23} strokeWidth={1.7} />
            <i />
          </span>
          <span className="brand-name">
            re<span>imagine</span>
          </span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#studio">
            Studio
          </a>
        </nav>
        <div className="top-note">
          <span className="live-dot" /> A little color, a lot of history.
        </div>
      </header>

      <main id="top" className="workspace">
        <section className="intro" id="studio">
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
                  aria-label="Show interactive comparison"
                >
                  <PanelTop size={15} />
                  <span>Slide</span>
                </button>
                <button
                  className={`view-button ${viewMode === "side" ? "selected" : ""}`}
                  onClick={() => setViewMode("side")}
                  aria-pressed={viewMode === "side"}
                  aria-label="Show original and colorized side by side"
                >
                  <Columns3 size={15} />
                  <span>Side by side</span>
                </button>
              </div>
            </div>

            {photo ? (
              <PhotoComparison
                photo={photo}
                ready={ready}
                status={status}
                comparison={comparison}
                onComparisonChange={setComparison}
                viewMode={viewMode}
              />
            ) : (
              <div className="empty-canvas">
                <div className="empty-icon">
                  <ImagePlus size={25} />
                </div>
                <p className="empty-title">
                  Your next favorite memory goes here.
                </p>
                <p>
                  Choose a black-and-white image and we’ll get the studio ready.
                </p>
              </div>
            )}

            <div className="image-caption-row">
              <span className="photo-title">
                <FileImage size={15} />
                {photo ? photo.name : "No photo selected"}
              </span>
              {photo && (
                <span className="photo-meta">{prettyBytes(photo.bytes)}</span>
              )}
            </div>
            {photo?.example && (
              <div className="sample-note">
                <Sparkles size={13} /> AI-colorized sample — colors are
                estimates, not historical records.
              </div>
            )}
            {!photo?.example && ready && (
              <div className="sample-note">
                <Sparkles size={13} /> AI color estimate — review each person’s
                skin tone and important details.
              </div>
            )}
            {status === "processing" && (
              <div className="progress-inline" aria-live="polite">
                <div className="progress-copy">
                  <span>
                    <LoaderCircle size={14} className="spin" /> Restoring color
                    and preserving facial detail
                  </span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {downloaded && (
              <p className="success-note" role="status">
                <Check size={14} /> Your color preview is ready to keep.
              </p>
            )}
            {errorMessage && (
              <p className="error-note" role="alert">
                <CircleAlert size={14} />
                {errorMessage}
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
              storageMessage={storageMessage}
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
                AI estimates the scene’s color and is prompted to preserve
                individual complexions, undertones, and facial detail.
              </p>
              <button
                className="restore-button"
                onClick={handleColorize}
                disabled={
                  !photo ||
                  photo.example ||
                  status === "processing" ||
                  status === "uploading"
                }
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
              {status === "complete" && photo && !photo.example && (
                <div className="ready-pill">
                  <BadgeCheck size={14} /> AI colorized result{" "}
                  <span>· review before saving</span>
                </div>
              )}
              <div className="model-disclosure">
                <CircleAlert size={14} />
                <span>
                  Color and skin tones are AI estimates; review important
                  details before keeping.
                </span>
              </div>
              <div className="privacy-line">
                <LockKeyhole size={13} />
                <span>
                  Your original is sent to the project’s image model only when
                  you colorize.
                </span>
              </div>
            </div>

            <button
              className="download-button"
              onClick={handleDownload}
              disabled={!photo || !ready}
            >
              <span className="download-icon">
                <ArrowDownToLine size={17} />
              </span>
              <span>
                <strong>Download preview</strong>
                <small>Save as a PNG</small>
              </span>
              <ChevronRight size={17} className="download-chevron" />
            </button>
            <div className="rail-footnote">
              <Clock3 size={13} /> A color pass takes just a moment.
            </div>
          </aside>
        </section>

        <footer className="page-footer">
          <a className="footer-brand" href="#top">
            <Aperture size={16} /> reimagine
          </a>
          <span>Old photos, seen with new eyes.</span>
          <a href="#top" className="back-top">
            Back to top <ArrowDownToLine size={13} className="back-top-icon" />
          </a>
        </footer>
      </main>
    </div>
  );
}
