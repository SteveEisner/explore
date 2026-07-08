import * as React from "react";
import {
  FileIcon,
  FileTextIcon,
  FileWarningIcon,
  FolderIcon,
  LoaderIcon,
  SparklesIcon,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { frontendLog } from "@/lib/frontend-log";
import { useStoreValue } from "@/lib/state-store";

/** The wiki's front page, featured as an excerpt at the top of Home. */
export const README_URL = "/docs/README.md";

/** One file from the server's /api/wiki/files inventory. */
interface WikiFile {
  path: string;
  size: number;
  modified: string;
}

/**
 * The Home view: a README excerpt on top (with a link to the full page),
 * then the wiki's folders and files as a nested list — every entry opens in
 * the content panel via `onNavigate`. Listing and excerpt refetch whenever
 * the wiki changes on disk (the `app/wiki-changed` store key), so files
 * saved or edited mid-session appear without a reload.
 */
export function HomeView({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const [readme, setReadme] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<WikiFile[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** True once any fetch succeeded — refetch failures then keep stale data. */
  const loadedRef = React.useRef(false);

  // Any wiki change may add/remove/rename files or edit the README; the seq
  // in the effect deps triggers a silent refetch (stale data stays up).
  const [wikiChanged] = useStoreValue<{ url: string; seq: number } | null>(
    "app/wiki-changed",
    null
  );
  const wikiSeq = wikiChanged?.seq ?? 0;

  React.useEffect(() => {
    let stale = false;
    Promise.all([
      fetch(README_URL).then((res) => (res.ok ? res.text() : null)),
      fetch("/api/wiki/files").then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json() as Promise<WikiFile[]>;
      }),
    ])
      .then(([readmeText, fileList]) => {
        if (stale) return;
        loadedRef.current = true;
        setReadme(readmeText);
        setFiles(fileList);
        setError(null);
      })
      .catch((err: Error) => {
        frontendLog("home:error", { message: err.message });
        // Only a *first* load failure shows the error screen; a failed
        // refetch keeps the last good listing on screen.
        if (!stale && !loadedRef.current) setError(err.message);
      });
    return () => {
      stale = true;
    };
  }, [wikiSeq]);

  if (error) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-destructive">
        <FileWarningIcon className="size-4" /> Couldn’t load the wiki: {error}
      </p>
    );
  }
  if (files === null) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" /> Loading the wiki…
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {readme !== null && (
        <section className="mb-8">
          <Markdown
            text={excerptOf(readme)}
            onLinkClick={(href, event) => {
              const target = new URL(href, new URL(README_URL, location.origin));
              if (target.origin !== location.origin) return;
              event.preventDefault();
              onNavigate(target.pathname);
            }}
          />
          <button
            type="button"
            onClick={() => onNavigate(README_URL)}
            className="mt-2 cursor-pointer text-sm text-primary underline"
          >
            more →
          </button>
        </section>
      )}

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        Wiki files
      </h2>
      <FolderListing
        folder={buildTree(files)}
        onNavigate={onNavigate}
      />
    </div>
  );
}

/**
 * Excerpt = everything before the README's second heading, capped at ~700
 * characters on a line boundary — enough to introduce the wiki without
 * swallowing the page (the "more" link carries the rest).
 */
function excerptOf(markdown: string): string {
  const lines = markdown.split("\n");
  const cut: string[] = [];
  let headings = 0;
  let length = 0;
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && ++headings > 1) break;
    if (length + line.length > 700 && cut.length > 0) {
      cut.push("…");
      break;
    }
    cut.push(line);
    length += line.length;
  }
  return cut.join("\n").trim();
}

/** A directory node: subfolders plus the files directly inside it. */
interface Folder {
  folders: Map<string, Folder>;
  files: WikiFile[];
}

/**
 * Fold the server's flat path list into a folder tree. The server sorts
 * names at every level, so insertion order is already display order. The
 * top-level README is left out — it's featured as the excerpt above.
 */
function buildTree(files: WikiFile[]): Folder {
  const root: Folder = { folders: new Map(), files: [] };
  for (const file of files) {
    if (file.path === "README.md") continue;
    const segments = file.path.split("/");
    let node = root;
    for (const dir of segments.slice(0, -1)) {
      let child = node.folders.get(dir);
      if (!child) node.folders.set(dir, (child = { folders: new Map(), files: [] }));
      node = child;
    }
    node.files.push(file);
  }
  return root;
}

function FolderListing({
  folder,
  onNavigate,
  prefix = "",
}: {
  folder: Folder;
  onNavigate: (url: string) => void;
  /** Wiki-relative path of this folder ("" at the root). */
  prefix?: string;
}) {
  return (
    <ul className={prefix ? "ml-5" : undefined}>
      {[...folder.folders.entries()].map(([name, child]) => (
        <li key={name} className="mt-1">
          <span className="flex items-center gap-2 py-0.5 text-sm font-medium">
            <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
            {name}
          </span>
          <FolderListing
            folder={child}
            onNavigate={onNavigate}
            prefix={prefix ? `${prefix}/${name}` : name}
          />
        </li>
      ))}
      {folder.files.map((file) => (
        <li key={file.path}>
          <FileRow file={file} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

function FileRow({
  file,
  onNavigate,
}: {
  file: WikiFile;
  onNavigate: (url: string) => void;
}) {
  // Sparkles = artifact, text-file = markdown — the toolbar's icon language.
  const Icon = file.path.endsWith(".oui")
    ? SparklesIcon
    : /\.(md|markdown)$/.test(file.path)
      ? FileTextIcon
      : FileIcon;
  const name = file.path.split("/").pop()!;
  return (
    <button
      type="button"
      onClick={() => onNavigate(`/docs/${file.path}`)}
      className="flex w-full cursor-pointer items-center gap-2 rounded py-0.5 text-left text-sm hover:bg-muted"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate underline-offset-2 hover:underline">{name}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        {formatSize(file.size)}
      </span>
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
