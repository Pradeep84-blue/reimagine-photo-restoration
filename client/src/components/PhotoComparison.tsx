import { Columns3, MoveHorizontal } from "lucide-react";

type Props = {
  photo: { src: string; name: string; example: boolean; resultSrc?: string };
  ready: boolean;
  status: string;
  comparison: number;
  onComparisonChange: (value: number) => void;
  viewMode: "compare" | "side";
};

function ImageView({ src, name, colorized }: { src: string; name: string; colorized: boolean }) {
  return (
    <div className={`image-frame ${colorized ? "colorized-view" : "original-view"}`}>
      <img src={src} alt={`${colorized ? "Color preview" : "Original black-and-white photo"}: ${name}`} className="photo-image" draggable={false} />
      {colorized && <span className="image-grain" aria-hidden="true" />}
    </div>
  );
}

export default function PhotoComparison({ photo, ready, status, comparison, onComparisonChange, viewMode }: Props) {
  const colorSource = photo.example ? photo.src : photo.resultSrc || photo.src;
  if (viewMode === "side") {
    return (
      <div className="side-comparison" aria-label="Original and colorized photo side by side">
        <div className="side-photo"><ImageView src={photo.src} name={photo.name} colorized={false} /><span className="photo-label"><i className="label-dot monochrome" /> ORIGINAL</span></div>
        <div className="side-photo"><ImageView src={colorSource} name={photo.name} colorized={ready} /><span className="photo-label"><i className="label-dot color-dot" /> COLOR PREVIEW</span>
          {!ready && <div className="awaiting-color"><Columns3 size={17} /><span>Start a preview<br />to see color here</span></div>}
        </div>
      </div>
    );
  }

  return (
    <div className={`comparison-stage ${status === "processing" ? "is-processing" : ""}`}>
      <div className="compare-canvas" style={{ "--split": `${comparison}%` } as React.CSSProperties}>
        <ImageView src={photo.src} name={photo.name} colorized={false} />
        <div className="compare-overlay" style={{ clipPath: `inset(0 0 0 ${comparison}%)` }} aria-hidden="true">
          <ImageView src={colorSource} name={photo.name} colorized={ready} />
          {!ready && <div className="awaiting-color"><MoveHorizontal size={18} /><span>Start a preview<br />to reveal color</span></div>}
        </div>
        <span className="photo-label label-left"><i className="label-dot monochrome" /> BEFORE</span>
        <span className="photo-label label-right"><i className="label-dot color-dot" /> AFTER</span>
        <div className="compare-divider" style={{ left: `${comparison}%` }} aria-hidden="true"><span className="divider-grip"><MoveHorizontal size={15} /></span></div>
        <input
          className="compare-range"
          type="range"
          min="8"
          max="92"
          value={comparison}
          onChange={event => onComparisonChange(Number(event.currentTarget.value))}
          aria-label="Slide to compare original and color preview"
          aria-valuetext={`${comparison}% from the left`}
        />
      </div>
      <div className="compare-hint"><MoveHorizontal size={14} /><span>Drag the line to compare</span></div>
    </div>
  );
}
