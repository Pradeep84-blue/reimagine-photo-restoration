import { useRef, useState } from "react";
import { Check, CloudUpload, FileImage, ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";

type PhotoSummary = { name: string; bytes?: number; example: boolean };
type Props = {
  photo: PhotoSummary | null;
  status: string;
  storageMessage: string;
  onFile: (file: File) => void;
  onRemove: () => void;
};

export default function PhotoUploadPanel({ photo, status, storageMessage, onFile, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState("");

  function chooseFile(file?: File) {
    if (!file) return;
    setLocalError("");
    onFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLocalError("That doesn’t look like an image. Try a JPEG, PNG, or WebP.");
      return;
    }
    chooseFile(file);
  }

  const storageFailed = status === "error" || storageMessage.includes("could not be saved");

  return (
    <section className="upload-panel" aria-labelledby="upload-heading">
      <div className="upload-panel-title"><span id="upload-heading">YOUR ORIGINAL</span>{photo && !photo.example && <button className="remove-photo" onClick={onRemove} aria-label="Remove photo"><Trash2 size={14} /></button>}</div>
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${photo && !photo.example ? "has-upload" : ""}`}
        onDragEnter={event => { event.preventDefault(); setDragging(true); }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="visually-hidden"
          aria-label="Choose a black-and-white photo"
          onChange={event => chooseFile(event.currentTarget.files?.[0])}
        />
        {photo && !photo.example ? (
          <>
            <div className="file-avatar"><FileImage size={18} /></div>
            <div className="upload-file-info"><strong title={photo.name}>{photo.name}</strong><span>{photo.bytes ? `${(photo.bytes / (1024 * 1024)).toFixed(photo.bytes < 1048576 ? 2 : 1)} MB` : "Your photo"}</span></div>
            <button className="replace-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> Replace</button>
          </>
        ) : (
          <>
            <div className="drop-icon"><CloudUpload size={21} /></div>
            <div className="drop-copy"><strong>Drop a photo here</strong><span>or choose one from your device</span></div>
            <button className="browse-button" onClick={() => inputRef.current?.click()}><ImagePlus size={15} /> Browse files</button>
            <p className="file-types">JPEG, PNG or WebP <i /> Up to 15 MB</p>
          </>
        )}
        {dragging && <div className="drop-overlay"><Upload size={19} /> Release to add your photo</div>}
      </div>
      {localError && <div className="upload-error" role="alert">{localError}</div>}
      {photo && !photo.example && (
        <div className={`storage-state ${status === "uploading" ? "in-progress" : status === "ready" ? "stored" : storageFailed ? "storage-error" : ""}`} role="status">
          {status === "uploading" ? <LoaderCircle size={14} className="spin" /> : status === "ready" ? <Check size={14} /> : storageFailed ? <CloudUpload size={14} /> : <FileImage size={14} />}
          <span>{storageMessage || (status === "ready" ? "Saved to project storage" : "Ready to restore")}</span>
        </div>
      )}
      {photo?.example && <div className="sample-file-line"><span className="sample-mini-dot" /> An example is open — add your own</div>}
    </section>
  );
}
