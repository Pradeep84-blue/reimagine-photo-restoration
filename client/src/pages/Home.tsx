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
  Trash2,
} from "lucide-react";
import PhotoComparison from "@/components/PhotoComparison";
import PhotoUploadPanel from "@/components/PhotoUploadPanel";

const SAMPLE_IMAGE = "/manus-storage/async-images/5EZzv39RGjcOKyWEpTtpR3/image-1.webp";
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
  resultStorageUrl?: string;
};
type WorkStatus = "empty" | "uploading" | "ready" | "processing" | "complete" | "error";
type ViewMode = "compare" | "side";

function prettyBytes(bytes?: number) {
  if (!bytes) return "Example photo";
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`;
}

async function createColorPreview(source: string): Promise<Blob> {
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The uploaded photo could not be opened."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare a photo preview.");
  context.filter = "sepia(0.18) saturate(1.35) contrast(1.04)";
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The color preview could not be saved.")), "image/png");
  });
}

async function uploadPhotoBlob(blob: Blob, contentType: string, kind: "original" | "colorized") {
  const response = await fetch("/api/photos/upload", {
    method: "POST",
    headers: { "Content-Type": contentType, "X-Photo-Kind": kind },
    body: blob,
  });
  const data = (await response.json().catch(() => ({}))) as { assetUrl?: string; error?: string };
  if (!response.ok || !data.assetUrl) {
    throw new Error(data.error || (response.status === 413 ? "Image must be 15 MB or smaller." : "Secure project storage is unavailable right now."));
  }
  return data.assetUrl;
}

export default function Home() {
  const [photo, setPhoto] = useState<Photo | null>({ src: SAMPLE_IMAGE, name: "An afternoon by the lake", example: true });
  const [status, setStatus] = useState<WorkStatus>("complete");
  const [comparison, setComparison] = useState(53);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const requestId = useRef(0);
  const objectUrls = useRef(new Set<string>());

  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current.clear();
  }, []);

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
      setErrorMessage("This image is larger than 15 MB. Choose a smaller file.");
      return;
    }
    const id = ++requestId.current;
    releasePhotoUrls(photo);
    const localUrl = URL.createObjectURL(file);
    objectUrls.current.add(localUrl);
    setPhoto({ src: localUrl, name: file.name, bytes: file.size, example: false, blobUrl: localUrl });
    setStatus("uploading");
    setProgress(0);

    try {
      const storageUrl = await uploadPhotoBlob(file, file.type, "original");
      if (requestId.current !== id) return;
      setPhoto(current => current?.blobUrl === localUrl ? { ...current, storageUrl } : current);
      setStatus("ready");
      setStorageMessage("Original uploaded to project storage and ready for processing.");
    } catch (error) {
      if (requestId.current !== id) return;
      setStatus("error");
      setStorageMessage(error instanceof Error ? error.message : "Secure upload failed. Your photo remains in this tab only.");
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
    if (!photo || status === "processing" || status === "uploading") return;
    const currentRequest = requestId.current;
    setErrorMessage("");
    setDownloaded(false);
    setStorageMessage("");
    setStatus("processing");
    setProgress(0);
    for (const value of [16, 34, 54, 72, 86]) {
      await new Promise(resolve => window.setTimeout(resolve, 330));
      if (requestId.current !== currentRequest) return;
      setProgress(value);
    }
    if (!photo.example) {
      try {
        const previewBlob = await createColorPreview(photo.src);
        if (requestId.current !== currentRequest) return;
        const resultSrc = URL.createObjectURL(previewBlob);
        objectUrls.current.add(resultSrc);
        setPhoto(current => current && current.blobUrl === photo.blobUrl ? { ...current, resultSrc } : current);
        setStorageMessage("Saving the color preview to project storage…");
        try {
          const resultStorageUrl = await uploadPhotoBlob(previewBlob, "image/png", "colorized");
          if (requestId.current !== currentRequest) return;
          setPhoto(current => current && current.blobUrl === photo.blobUrl ? { ...current, resultStorageUrl } : current);
          setStorageMessage("Original and color preview saved to project storage.");
        } catch (error) {
          if (requestId.current !== currentRequest) return;
          setStorageMessage(`Color preview is ready in this tab, but could not be saved: ${error instanceof Error ? error.message : "storage unavailable."}`);
        }
      } catch (error) {
        if (requestId.current !== currentRequest) return;
        setErrorMessage(error instanceof Error ? error.message : "The preview could not be prepared.");
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
        image.onerror = () => reject(new Error("The preview image could not be opened."));
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas download is not supported in this browser.");
      if (!photo.example && !photo.resultSrc) context.filter = "sepia(0.18) saturate(1.35) contrast(1.04)";
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

  const ready = !!photo && (photo.example || !!photo.resultSrc || status === "complete");

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ChromaLab home">
          <span className="brand-symbol" aria-hidden="true"><Aperture size={23} strokeWidth={1.7} /><i /></span>
          <span className="brand-name">chroma<span>lab</span><sup>®</sup></span>
        </a>
        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#studio">Studio</a>
          <a className="nav-link" href="#how-it-works">How it works</a>
        </nav>
        <div className="top-note"><span className="live-dot" /> A little color, a lot of history.</div>
      </header>

      <main id="top" className="workspace">
        <section className="intro" id="studio">
          <div className="intro-copy">
            <div className="eyebrow"><span>YOUR PHOTO RESTORATION STUDIO</span><span className="eyebrow-rule" /></div>
            <h1>Bring old memories<br /><em>back into color.</em></h1>
            <p>Give a favorite black-and-white photograph a new point of view. Your original always stays untouched.</p>
          </div>
          <div className="intro-stamp" aria-label="Photo restoration, made thoughtful">
            <span className="stamp-icon"><Sparkles size={19} /></span><span>MADE FOR<br />THE MEMORIES</span>
          </div>
        </section>

        <section className="studio-grid" aria-label="Photo restoration workspace">
          <div className="image-workspace">
            <div className="section-heading">
              <div className="section-title"><span className="step-number">01</span><h2>Your photograph</h2></div>
              <div className="comparison-actions" role="group" aria-label="Comparison display mode">
                <button className={`view-button ${viewMode === "compare" ? "selected" : ""}`} onClick={() => setViewMode("compare")} aria-pressed={viewMode === "compare"} aria-label="Show interactive comparison"><PanelTop size={15} /><span>Slide</span></button>
                <button className={`view-button ${viewMode === "side" ? "selected" : ""}`} onClick={() => setViewMode("side")} aria-pressed={viewMode === "side"} aria-label="Show original and colorized side by side"><Columns3 size={15} /><span>Side by side</span></button>
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
                <div className="empty-icon"><ImagePlus size={25} /></div>
                <p className="empty-title">Your next favorite memory goes here.</p>
                <p>Choose a black-and-white image and we’ll get the studio ready.</p>
              </div>
            )}

            <div className="image-caption-row">
              <span className="photo-title"><FileImage size={15} />{photo ? photo.name : "No photo selected"}</span>
              {photo && <span className="photo-meta">{prettyBytes(photo.bytes)}</span>}
            </div>
            {photo?.example && <div className="sample-note"><Sparkles size={13} /> Sample photo — an illustrative preview, not a model result.</div>}
            {!photo?.example && ready && <div className="sample-note"><Sparkles size={13} /> Prototype color preview — connect your model to generate real colorization.</div>}
            {status === "processing" && (
              <div className="progress-inline" aria-live="polite">
                <div className="progress-copy"><span><LoaderCircle size={14} className="spin" /> Preparing your preview</span><strong>{progress}%</strong></div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              </div>
            )}
            {downloaded && <p className="success-note" role="status"><Check size={14} /> Your color preview is ready to keep.</p>}
            {errorMessage && <p className="error-note" role="alert"><CircleAlert size={14} />{errorMessage}</p>}
          </div>

          <aside className="control-rail" aria-label="Photo controls">
            <div className="rail-topline"><span className="step-number">02</span><span>RESTORATION DESK</span><span className="rail-line" /></div>
            <PhotoUploadPanel photo={photo} status={status} storageMessage={storageMessage} onFile={handleFile} onRemove={handleRemove} />

            <div className="restore-card">
              <div className="restore-card-head"><span className="restore-icon"><Sparkles size={17} /></span><span>THE COLOR PASS</span></div>
              <h3>See your photo<br />in a new light.</h3>
              <p>Take a first look at a warm, color-inspired preview. Your original remains as it is.</p>
              <button className="restore-button" onClick={handleColorize} disabled={!photo || status === "processing" || status === "uploading"}>
                {status === "processing" ? <><LoaderCircle size={17} className="spin" /> Building preview</> : <><Sparkles size={16} /> Preview colorization <ArrowRight size={16} /></>}
              </button>
              {status === "complete" && photo && !photo.example && <div className="ready-pill"><BadgeCheck size={14} /> Preview ready <span>· demo mode</span></div>}
              <div className="model-disclosure"><CircleAlert size={14} /><span>Prototype mode — no trained colorization model is connected yet.</span></div>
              <div className="privacy-line"><LockKeyhole size={13} /><span>Your file is transferred using short-lived signed storage links.</span></div>
            </div>

            <button className="download-button" onClick={handleDownload} disabled={!photo || !ready}>
              <span className="download-icon"><ArrowDownToLine size={17} /></span><span><strong>Download preview</strong><small>Save as a PNG</small></span><ChevronRight size={17} className="download-chevron" />
            </button>
            <div className="rail-footnote"><Clock3 size={13} /> A color pass takes just a moment.</div>
          </aside>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-heading"><span>THE RESTORATION RITUAL</span><span className="how-rule" /></div>
          <div className="how-steps">
            <article className="how-step"><span className="how-step-number">01</span><div><h3>Choose a memory</h3><p>Drop in a JPEG, PNG, or WebP up to 15 MB.</p></div></article>
            <article className="how-step"><span className="how-step-number">02</span><div><h3>Explore the color</h3><p>Move the divider or see both views side by side.</p></div></article>
            <article className="how-step"><span className="how-step-number">03</span><div><h3>Keep a copy</h3><p>Save your preview as a PNG whenever you’re ready.</p></div></article>
          </div>
        </section>
        <footer className="page-footer"><a className="footer-brand" href="#top"><Aperture size={16} /> chromalab</a><span>Old photos, seen with new eyes.</span><a href="#top" className="back-top">Back to top <ArrowDownToLine size={13} className="back-top-icon" /></a></footer>
      </main>
    </div>
  );
}
