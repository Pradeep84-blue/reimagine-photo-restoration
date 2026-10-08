import { useEffect, useState } from "react";
import { Columns3, MoveHorizontal } from "lucide-react";

type Props = {
  photo: { src: string; name: string; example: boolean; resultSrc?: string };
  ready: boolean;
  status: string;
  comparison: number;
  onComparisonChange: (value: number) => void;
  viewMode: "compare" | "side";
};

function ImageView({
  src,
  name,
  colorized,
}: {
  src: string;
  name: string;
  colorized: boolean;
}) {
  return (
    <div
      className={`image-frame ${colorized ? "colorized-view" : "original-view"}`}
    >
      <img
        src={src}
        alt={`${colorized ? "AI colorized result" : "Original black-and-white photo"}: ${name}`}
        className="photo-image"
        draggable={false}
      />
      {colorized && <span className="image-grain" aria-hidden="true" />}
    </div>
  );
}

export default function PhotoComparison({
  photo,
  ready,
  status,
  comparison,
  onComparisonChange,
  viewMode,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState(4 / 3);
  const colorSource = photo.resultSrc || photo.src;
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active && image.naturalWidth && image.naturalHeight) {
        setAspectRatio(image.naturalWidth / image.naturalHeight);
      }
    };
    image.onerror = () => {
      if (active) setAspectRatio(4 / 3);
    };
    image.src = photo.src;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [photo.src]);
  const frameStyle = {
    "--photo-ratio": `${aspectRatio} / 1`,
  } as React.CSSProperties;

  if (viewMode === "side") {
    return (
      <div
        className="side-comparison"
        aria-label="Original and colorized photo side by side"
      >
        <div className="side-photo" style={frameStyle}>
          <ImageView src={photo.src} name={photo.name} colorized={false} />
          <span className="photo-label">
            <i className="label-dot monochrome" /> ORIGINAL
          </span>
        </div>
        <div className="side-photo" style={frameStyle}>
          <ImageView src={colorSource} name={photo.name} colorized={ready} />
          <span className="photo-label">
            <i className="label-dot color-dot" /> COLORIZED RESULT
          </span>
          {!ready && (
            <div className="awaiting-color">
              <Columns3 size={17} />
              <span>
                Start a preview
                <br />
                to see color here
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`comparison-stage ${status === "processing" ? "is-processing" : ""}`}
    >
      <div
        className="compare-canvas"
        style={
          { ...frameStyle, "--split": `${comparison}%` } as React.CSSProperties
        }
      >
        <ImageView src={photo.src} name={photo.name} colorized={false} />
        <div
          className="compare-overlay"
          style={{ clipPath: `inset(0 0 0 ${comparison}%)` }}
          aria-hidden="true"
        >
          <ImageView src={colorSource} name={photo.name} colorized={ready} />
          {!ready && (
            <div className="awaiting-color">
              <MoveHorizontal size={18} />
              <span>
                Start a preview
                <br />
                to reveal color
              </span>
            </div>
          )}
        </div>
        <span className="photo-label label-left">
          <i className="label-dot monochrome" /> BEFORE
        </span>
        <span className="photo-label label-right">
          <i className="label-dot color-dot" /> AFTER
        </span>
        <div
          className="compare-divider"
          style={{ left: `${comparison}%` }}
          aria-hidden="true"
        >
          <span className="divider-grip">
            <MoveHorizontal size={15} />
          </span>
        </div>
        <input
          className="compare-range"
          type="range"
          min="8"
          max="92"
          value={comparison}
          onChange={event =>
            onComparisonChange(Number(event.currentTarget.value))
          }
          aria-label="Slide to compare original and color preview"
          aria-valuetext={`${comparison}% from the left`}
        />
      </div>
      <div className="compare-hint">
        <MoveHorizontal size={14} />
        <span>Drag the line to compare</span>
      </div>
    </div>
  );
}
