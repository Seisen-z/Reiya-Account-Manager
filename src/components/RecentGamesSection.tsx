import { FC } from "react";
import { useLanguage } from "../context/LanguageContext";
import { GameCard, RecentGame } from "../pages/Home";
import { SectionHeader } from "./SectionHeader";

export const RecentGamesSection: FC<{
  recentGames: RecentGame[];
  launchPlaceId: string;
  thumbs: Record<string, string>;
  pinnedGames: string[];
  onTogglePin: (placeId: string) => void;
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
  onSetPlaceIdFromSearch, first,
}) => {
  const { t } = useLanguage();
  if (recentGames.length === 0) return null;
  return (
    <div style={first ? undefined : { marginTop: 24, borderTop: "1px solid var(--g05)", paddingTop: 24 }}>
      <SectionHeader
        dotColor="#FCD34D"
        dotShadow="0 0 6px rgba(252,211,77,0.35)"
        title={t("recently_played")}
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
              style={{ width: 130, height: 22, fontSize: 9.5, padding: "0 7px" }}
            />
            <span style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 600 }}>{t("right_click_to_set_server")}</span>
          </div>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {recentGames.slice(0, 12).map(g => {
          const isSelected = launchPlaceId === g.placeId;
          const hasPrivateServer = !!g.privateServer;
          return (
            <GameCard key={g.placeId} g={g} isSelected={isSelected} hasPrivateServer={hasPrivateServer}
              thumb={thumbs[g.placeId]}
              isPinned={pinnedGames.includes(g.placeId)}
              onTogglePin={() => onTogglePin(g.placeId)}
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
