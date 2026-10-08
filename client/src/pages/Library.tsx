import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  PencilLine,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useLocation } from "wouter";
import AppHeader from "@/components/AppHeader";
import {
  fetchPrivatePhoto,
  colorizePhoto,
  type ColorStyle,
} from "@/lib/photoApi";
import { trpc } from "@/lib/trpc";

type LibraryItem = {
  id: string;
  title: string;
  fileName: string;
  style: ColorStyle;
  favorite: boolean;
  createdAt: Date | string;
  batchId: string | null;
  originalMimeType: string;
};

function PrivateThumbnail({
  photoId,
  label,
}: {
  photoId: string;
  label: string;
}) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetchPrivatePhoto(photoId, "colorized")
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);
  return src ? (
    <img src={src} alt={label} loading="lazy" />
  ) : (
    <div
      className="history-thumbnail-placeholder"
      aria-label={failed ? "Photo unavailable" : "Loading private photo"}
    >
      {failed ? (
        <ImageIcon size={22} />
      ) : (
        <LoaderCircle size={20} className="spin" />
      )}
    </div>
  );
}

export default function Library() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [renaming, setRenaming] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [workingId, setWorkingId] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<
    Record<string, ColorStyle>
  >({});
  const list = trpc.library.list.useQuery({ search, sort, favoritesOnly });

  const refresh = async () => {
    await utils.library.list.invalidate();
  };
  const rename = trpc.library.rename.useMutation({
    onSuccess: async () => {
      setRenaming("");
      setTitleDraft("");
      setActionError("");
      await refresh();
    },
    onError: error => setActionError(error.message),
  });
  const favorite = trpc.library.favorite.useMutation({
    onSuccess: refresh,
    onError: error => setActionError(error.message),
  });
  const remove = trpc.library.remove.useMutation({
    onSuccess: async () => {
      setActionMessage(
        "Removed from your history. Stored image data remains private in project storage."
      );
      setActionError("");
      await refresh();
    },
    onError: error => setActionError(error.message),
  });

  function selectedPassStyle(item: LibraryItem): ColorStyle {
    return (
      selectedStyles[item.id] ??
      (item.style === "natural" ? "vivid" : "natural")
    );
  }

  async function recolor(item: LibraryItem) {
    const colorStyle = selectedPassStyle(item);
    setWorkingId(item.id);
    setActionError("");
    setActionMessage("");
    try {
      const original = await fetchPrivatePhoto(item.id, "original");
      const file = new File([original], item.fileName, {
        type: original.type || item.originalMimeType,
      });
      await colorizePhoto(file, item.fileName, colorStyle);
      setActionMessage(`New ${colorStyle} version added to your history.`);
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The new color pass could not be saved."
      );
    } finally {
      setWorkingId("");
    }
  }

  async function download(item: LibraryItem) {
    setWorkingId(item.id);
    setActionError("");
    try {
      const blob = await fetchPrivatePhoto(item.id, "colorized");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const baseName =
        item.title.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") ||
        "reimagine-photo";
      const extension =
        blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/webp"
            ? "webp"
            : "png";
      link.download = `${baseName}-colorized.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "This photo could not be downloaded."
      );
    } finally {
      setWorkingId("");
    }
  }

  function confirmRemove(item: LibraryItem) {
    const confirmed = window.confirm(
      `Remove “${item.title}” from your history? It will no longer appear here. Its private stored image data is retained.`
    );
    if (confirmed) remove.mutate({ id: item.id });
  }

  const photos = list.data ?? [];

  return (
    <div className="app-shell">
      <AppHeader active="library" />
      <main className="library-page">
        <section className="library-heading">
          <div>
            <span className="eyebrow">YOUR PRIVATE COLLECTION</span>
            <h1>Photo history</h1>
            <p>Every color pass you save, in one quiet place.</p>
          </div>
          <button
            className="library-create-button"
            onClick={() => setLocation("/")}
          >
            <Sparkles size={15} /> Restore another photo
          </button>
        </section>

        <section className="library-toolbar" aria-label="Filter photo history">
          <label className="library-search">
            <span className="visually-hidden">Search your photo history</span>
            <input
              type="search"
              placeholder="Search names or filenames"
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              maxLength={100}
            />
          </label>
          <select
            aria-label="Sort photo history"
            value={sort}
            onChange={event =>
              setSort(event.currentTarget.value as "newest" | "oldest")
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button
            className={`filter-toggle ${favoritesOnly ? "selected" : ""}`}
            onClick={() => setFavoritesOnly(value => !value)}
            aria-pressed={favoritesOnly}
          >
            <Heart size={15} /> Favorites
          </button>
        </section>

        {(actionMessage || actionError) && (
          <p
            className={actionError ? "error-note" : "success-note"}
            role={actionError ? "alert" : "status"}
          >
            {actionMessage || actionError}
          </p>
        )}

        {list.isLoading ? (
          <div className="library-empty">
            <LoaderCircle className="spin" size={21} />
            <span>Opening your collection…</span>
          </div>
        ) : photos.length ? (
          <section className="history-grid" aria-label="Saved photos">
            {photos.map(item => (
              <article className="history-card" key={item.id}>
                <button
                  className="history-preview"
                  onClick={() =>
                    setLocation(`/?photo=${encodeURIComponent(item.id)}`)
                  }
                  aria-label={`Compare ${item.title}`}
                >
                  <PrivateThumbnail
                    photoId={item.id}
                    label={`Colorized: ${item.title}`}
                  />
                  <span className="history-preview-open">
                    <ArrowUpRight size={16} />
                  </span>
                </button>
                <div className="history-card-body">
                  {renaming === item.id ? (
                    <form
                      className="history-rename-form"
                      onSubmit={event => {
                        event.preventDefault();
                        rename.mutate({ id: item.id, title: titleDraft });
                      }}
                    >
                      <input
                        aria-label="New photo title"
                        value={titleDraft}
                        onChange={event =>
                          setTitleDraft(event.currentTarget.value)
                        }
                        maxLength={160}
                        required
                        autoFocus
                      />
                      <button type="submit" disabled={rename.isPending}>
                        Save
                      </button>
                      <button type="button" onClick={() => setRenaming("")}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <h2 title={item.title}>{item.title}</h2>
                  )}
                  <div className="history-meta">
                    <time dateTime={new Date(item.createdAt).toISOString()}>
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    <span className="history-style-pill">{item.style}</span>
                    {item.batchId && <span className="batch-chip">Batch</span>}
                  </div>
                  <div className="history-preset-box">
                    <div className="history-preset-heading">
                      <span>NEW COLOR PASS</span>
                      <small>Original stays unchanged</small>
                    </div>
                    <div
                      className="history-preset-options"
                      role="group"
                      aria-label={`Choose a color style for ${item.title}`}
                    >
                      {(["natural", "vivid"] as const).map(colorStyle => (
                        <button
                          key={colorStyle}
                          type="button"
                          className={
                            selectedPassStyle(item) === colorStyle
                              ? "selected"
                              : ""
                          }
                          aria-pressed={selectedPassStyle(item) === colorStyle}
                          disabled={Boolean(workingId)}
                          onClick={() =>
                            setSelectedStyles(current => ({
                              ...current,
                              [item.id]: colorStyle,
                            }))
                          }
                        >
                          {colorStyle === "natural" ? "Natural" : "Vivid"}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="history-recolor-button"
                      disabled={Boolean(workingId)}
                      onClick={() => void recolor(item)}
                    >
                      {workingId === item.id ? (
                        <LoaderCircle size={13} className="spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      Create {selectedPassStyle(item)} pass
                    </button>
                  </div>
                  <div className="history-actions">
                    <button
                      title={item.favorite ? "Remove favorite" : "Add favorite"}
                      aria-label={
                        item.favorite
                          ? `Remove ${item.title} from favorites`
                          : `Add ${item.title} to favorites`
                      }
                      className={item.favorite ? "is-favorite" : ""}
                      onClick={() =>
                        favorite.mutate({
                          id: item.id,
                          favorite: !item.favorite,
                        })
                      }
                    >
                      <Heart
                        size={15}
                        fill={item.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <button
                      title="Rename"
                      aria-label={`Rename ${item.title}`}
                      onClick={() => {
                        setTitleDraft(item.title);
                        setRenaming(item.id);
                      }}
                    >
                      <PencilLine size={15} />
                    </button>
                    <button
                      title="Download"
                      aria-label={`Download ${item.title}`}
                      disabled={Boolean(workingId)}
                      onClick={() => void download(item)}
                    >
                      <ArrowDownToLine size={15} />
                    </button>
                    <button
                      title="Remove from history"
                      aria-label={`Remove ${item.title} from your history`}
                      onClick={() => confirmRemove(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="library-empty">
            <span className="library-empty-mark">
              <ImageIcon size={22} />
            </span>
            <h2>
              {search || favoritesOnly
                ? "No matching photos"
                : "Your history starts here"}
            </h2>
            <p>
              {search || favoritesOnly
                ? "Try another search or filter."
                : "Colorize a photo to save its original and result to this account."}
            </p>
            {!search && !favoritesOnly && (
              <button
                className="library-create-button"
                onClick={() => setLocation("/")}
              >
                Start with a photo <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        )}
      </main>
      <footer className="page-footer account-footer">
        <span className="footer-brand">Reimagine</span>
        <span>Your photographs, together again.</span>
        <a href="/" className="back-top">
          Back to studio
        </a>
      </footer>
    </div>
  );
}
