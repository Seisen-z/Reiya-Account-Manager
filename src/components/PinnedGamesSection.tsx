import { FC, useEffect, useState } from "react";
import { GameCard, RecentGame } from "../pages/Home";
import { SectionHeader } from "./SectionHeader";

export const PinnedGamesSection: FC<{
  pinnedGames: RecentGame[];
  launchPlaceId: string;
  thumbs: Record<string, string>;
  onTogglePin: (g: RecentGame) => void;
  onSelectGame: (placeId: string) => void;
  onGameContextMenu: (e: React.MouseEvent, g: RecentGame) => void;
  onDeleteGame: (placeId: string, name: string) => void;
  onQuickLaunch: (placeId: string) => void;
  first?: boolean;
}> = ({ pinnedGames, launchPlaceId, thumbs, onTogglePin, onSelectGame, onGameContextMenu, onDeleteGame, onQuickLaunch }) => {
  const gamesPerPage = 18;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(pinnedGames.length / gamesPerPage));

  useEffect(() => {
    setPage(current => Math.min(current, pageCount - 1));
  }, [pageCount]);

  if (pinnedGames.length === 0) return null;

  const visibleGames = pinnedGames.slice(page * gamesPerPage, (page + 1) * gamesPerPage);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader
        dotColor="#FBBF24"
        dotShadow="0 0 6px rgba(251,191,36,0.4)"
        title={`Pinned Games (${pinnedGames.length})`}
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
        {visibleGames.map(g => {
          const isSelected = launchPlaceId === g.placeId;
          const hasPrivateServer = !!g.privateServer;
          return (
            <GameCard key={g.placeId} g={g} isSelected={isSelected} hasPrivateServer={hasPrivateServer}
              thumb={g.iconUrl || thumbs[g.placeId]}
              isPinned={true}
              onTogglePin={() => onTogglePin(g)}
              onSelect={() => onSelectGame(g.placeId)}
              onContextMenu={(e) => onGameContextMenu(e, g)}
              onDelete={() => onDeleteGame(g.placeId, g.name)}
              onQuickLaunch={() => onQuickLaunch(g.placeId)}
            />
          );
        })}
      </div>
    </div>
  );
};
