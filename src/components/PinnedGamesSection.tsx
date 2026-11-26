import { FC, useEffect, useState } from "react";
import { GameCard, RecentGame } from "../pages/Home";
import { SectionHeader } from "./SectionHeader";
import { useLanguage } from "../context/LanguageContext";

export const PinnedGamesSection: FC<{
  pinnedGames: RecentGame[];
  launchPlaceId: string;
  thumbs: Record<string, string>;
  onTogglePin: (g: RecentGame) => void;
  onSelectGame: (placeId: string) => void;
  onGameContextMenu: (e: React.MouseEvent, g: RecentGame) => void;
  onDeleteGame: (placeId: string, name: string) => void;
  onQuickLaunch: (placeId: string) => void;
  /** Drag & drop: move `placeId` to where `targetPlaceId` is. */
  onReorder?: (placeId: string, targetPlaceId: string) => void;
  first?: boolean;
}> = ({ pinnedGames, launchPlaceId, thumbs, onTogglePin, onSelectGame, onGameContextMenu, onDeleteGame, onQuickLaunch, onReorder }) => {
  const { t } = useLanguage();
  const gamesPerPage = 18;
  const [page, setPage] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const pageCount = Math.max(1, Math.ceil(pinnedGames.length / gamesPerPage));

  useEffect(() => {
    setPage(current => Math.min(current, pageCount - 1));
  }, [pageCount]);

  if (pinnedGames.length === 0) return null;

  const visibleGames = pinnedGames.slice(page * gamesPerPage, (page + 1) * gamesPerPage);
  const canDrag = !!onReorder && pinnedGames.length > 1;
  const dragIndex = dragId ? pinnedGames.findIndex(g => g.placeId === dragId) : -1;

  const endDrag = () => { setDragId(null); setOverId(null); };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader
        dotColor="#FBBF24"
        dotShadow="0 0 6px rgba(251,191,36,0.4)"
        title={<>
          {t("home_pinned_title")} ({pinnedGames.length})
          {canDrag && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--t3)", letterSpacing: 0, textTransform: "none" }}>
              {t("home_pinned_drag_hint")}
            </span>
          )}
        </>}
        style={{ marginBottom: 10 }}
        trailing={pageCount > 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--muted)", fontSize: 9.5 }}>{page + 1}/{pageCount}</span>
            <button className="btn btn-ghost" aria-label="Previous pinned games page" disabled={page === 0}
              onClick={() => setPage(current => Math.max(0, current - 1))}
              style={{ width: 24, height: 22, padding: 0, opacity: page === 0 ? 0.4 : 1 }}>{"<"}</button>
            <button className="btn btn-ghost" aria-label="Next pinned games page" disabled={page === pageCount - 1}
              onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}
              style={{ width: 24, height: 22, padding: 0, opacity: page === pageCount - 1 ? 0.4 : 1 }}>{">"}</button>
          </div>
        ) : undefined}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
        {visibleGames.map(g => {
          const isSelected = launchPlaceId === g.placeId;
          const hasPrivateServer = !!g.privateServer;
          const isDragging = dragId === g.placeId;
          const isTarget = overId === g.placeId && dragId !== null && dragId !== g.placeId;
          // Show the drop marker on the side the game will land on
          const targetIndex = pinnedGames.findIndex(x => x.placeId === g.placeId);
          const markerSide = isTarget ? (dragIndex < targetIndex ? "right" : "left") : null;
          return (
            <div
              key={g.placeId}
              draggable={canDrag}
              onDragStart={e => {
                setDragId(g.placeId);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", g.placeId);
              }}
              onDragEnter={e => { if (dragId) { e.preventDefault(); setOverId(g.placeId); } }}
              onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (overId !== g.placeId) setOverId(g.placeId); } }}
              onDrop={e => {
                e.preventDefault();
                if (dragId && dragId !== g.placeId) onReorder?.(dragId, g.placeId);
                endDrag();
              }}
              onDragEnd={endDrag}
              style={{
                position: "relative",
                cursor: canDrag ? (isDragging ? "grabbing" : "grab") : undefined,
                opacity: isDragging ? 0.35 : 1,
                transform: isTarget ? "scale(0.97)" : "none",
                transition: "opacity .12s, transform .12s",
              }}
            >
              {markerSide && (
                <div style={{
                  position: "absolute", top: 0, bottom: 0, [markerSide]: -8, width: 4, borderRadius: 4,
                  background: "#FBBF24", boxShadow: "0 0 10px rgba(251,191,36,0.6)", zIndex: 20, pointerEvents: "none",
                }} />
              )}
              <GameCard g={g} isSelected={isSelected} hasPrivateServer={hasPrivateServer}
                thumb={thumbs[g.placeId]}
                isPinned={true}
                onTogglePin={() => onTogglePin(g)}
                onSelect={() => onSelectGame(g.placeId)}
                onContextMenu={(e) => onGameContextMenu(e, g)}
                onDelete={() => onDeleteGame(g.placeId, g.name)}
                onQuickLaunch={() => onQuickLaunch(g.placeId)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
