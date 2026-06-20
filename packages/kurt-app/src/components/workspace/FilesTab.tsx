/** Files pane — a lightweight workspace file browser. Lists the bridge's
 *  workspace over GET /fs and lets the user drill into folders and open a file
 *  (→ a preview tab). Self-rolled tree (no extra dep). */

import { useEffect, useState } from "react";
import type { Lang } from "../../types.ts";
import { T, tr } from "../../i18n/strings.ts";
import { Icon } from "../Icon.tsx";
import { listDir, type DirEntry } from "../../lib/bridge.ts";
import { resolveBridgeUrl } from "../../lib/bridgeUrl.ts";

function Node({ entry, depth, workspace, onOpenFile }: { entry: DirEntry; depth: number; workspace: string; onOpenFile: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<DirEntry[] | null>(null);

  useEffect(() => {
    if (!open || kids !== null) return;
    let alive = true;
    void (async () => {
      const listing = await listDir(await resolveBridgeUrl(), entry.path, workspace);
      if (alive) setKids(listing?.entries ?? []);
    })();
    return () => { alive = false; };
  }, [open, kids, entry.path, workspace]);

  const pad = { paddingLeft: 8 + depth * 14 };
  if (!entry.dir) {
    return (
      <button className="files-node file" style={pad} onClick={() => onOpenFile(entry.path)} title={entry.path}>
        <Icon name="image" className="files-ico" />
        <span className="files-name">{entry.name}</span>
      </button>
    );
  }
  return (
    <div>
      <button className={"files-node dir" + (open ? " open" : "")} style={pad} onClick={() => setOpen((v) => !v)} title={entry.path}>
        <Icon name="chevR" className="files-chev" />
        <Icon name="folder" className="files-ico" />
        <span className="files-name">{entry.name}</span>
      </button>
      {open && kids && kids.map((k) => <Node key={k.path} entry={k} depth={depth + 1} workspace={workspace} onOpenFile={onOpenFile} />)}
    </div>
  );
}

export function FilesTab({ lang, workspace, onOpenFile }: { lang: Lang; workspace: string; onOpenFile: (path: string) => void }) {
  const [entries, setEntries] = useState<DirEntry[] | null | "error">(null);

  useEffect(() => {
    let alive = true;
    setEntries(null);
    void (async () => {
      const listing = await listDir(await resolveBridgeUrl(), "", workspace);
      if (alive) setEntries(listing ? listing.entries : "error");
    })();
    return () => { alive = false; };
  }, [workspace]);

  return (
    <div className="files-tab">
      {entries === null ? (
        <div className="files-loading" />
      ) : entries === "error" ? (
        <div className="ws-empty">{tr(T.filesError, lang)}</div>
      ) : entries.length === 0 ? (
        <div className="ws-empty">{tr(T.filesEmpty, lang)}</div>
      ) : (
        entries.map((e) => <Node key={e.path} entry={e} depth={0} workspace={workspace} onOpenFile={onOpenFile} />)
      )}
    </div>
  );
}
