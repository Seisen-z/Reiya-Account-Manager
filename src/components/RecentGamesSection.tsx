import { FC, useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { GameCard, RecentGame } from "../pages/Home";
import { SectionHeader } from "./SectionHeader";

export const RecentGamesSection: FC<{
  recentGames: RecentGame[];
  launchPlaceId: string;
  thumbs: Record<string, string>;
  pinnedGames: string[];
  onTogglePin: (g: RecentGame) => void;
  onSelectGame: (placeId: string) => void;
  onGameContextMenu: (e: React.MouseEvent, g: RecentGame) => void;
  onDeleteGame: (placeId: string, name: string) => void;
  onQuickLaunch: (placeId: string) => void;
  gameSearch: string;
  setGameSearch: (v: string) => void;
  onSetPlaceIdFromSearch: (id: string) => void;
  first?: boolean;
}> = ({
  recentGames, launchPlaceId, thumbs, pinnedGames, onTogglePin, onSelectGame,
  onGameContextMenu, onDeleteGame, onQuickLaunch, gameSearch, setGameSearch,
  onSetPlaceIdFromSearch,
}) => {
  const { t } = useLanguage();
  const gamesPerPage = 18;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(recentGames.length / gamesPerPage));

  useEffect(() => {
    setPage(current => Math.min(current, pageCount - 1));
  }, [pageCount]);

  if (recentGames.length === 0) return null;

  const visibleGames = recentGames.slice(page * gamesPerPage, (page + 1) * gamesPerPage);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <SectionHeader
        dotColor="#FCD34D"
        dotShadow="0 0 6px rgba(252,211,77,0.35)"
        title={`${t("recently_played")} (${recentGames.length})`}
        style={{ marginBottom: 10 }}
        trailing={
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <input
              value={gameSearch}
              onChange={e => setGameSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const match = gameSearch.match(/\d{6,}/);
                  if (match) {
                    onSetPlaceIdFromSearch(match[0]);
                  }
                  e.stopPropagation();
                }
              }}
              placeholder="Place ID or URL…"
              className="field glass-input"
              style={{ width: 110, height: 22, fontSize: 9.5, padding: "0 7px" }}
            />
            {pageCount > 1 && (
              <>
                <span style={{ color: "var(--muted)", fontSize: 9.5 }}>{page + 1}/{pageCount}</span>
                <button className="btn btn-ghost" aria-label="Previous recent games page" disabled={page === 0}
                  onClick={() => setPage(current => Math.max(0, current - 1))}
                  style={{ width: 24, height: 22, padding: 0, opacity: page === 0 ? 0.4 : 1 }}>{"<"}</button>
                <button className="btn btn-ghost" aria-label="Next recent games page" disabled={page === pageCount - 1}
                  onClick={() => setPage(current => Math.min(pageCount - 1, current + 1))}
                  style={{ width: 24, height: 22, padding: 0, opacity: page === pageCount - 1 ? 0.4 : 1 }}>{">"}</button>
              </>
            )}
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
        {visibleGames.map(g => {
          const isSelected = launchPlaceId === g.placeId;
          const hasPrivateServer = !!g.privateServer;
          return (
            <GameCard key={g.placeId} g={g} isSelected={isSelected} hasPrivateServer={hasPrivateServer}
              thumb={thumbs[g.placeId]}
              isPinned={pinnedGames.includes(g.placeId)}
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
