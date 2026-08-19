import { FC } from "react";
import { GameCard, RecentGame } from "../pages/Home";
import { SectionHeader } from "./SectionHeader";

export const PinnedGamesSection: FC<{
  pinnedGames: string[];
  recentGames: RecentGame[];
  launchPlaceId: string;
  thumbs: Record<string, string>;
  onTogglePin: (placeId: string) => void;
  onSelectGame: (placeId: string) => void;
  onGameContextMenu: (e: React.MouseEvent, g: RecentGame) => void;
  onDeleteGame: (placeId: string, name: string) => void;
  onQuickLaunch: (placeId: string) => void;
  first?: boolean;
}> = ({ pinnedGames, recentGames, launchPlaceId, thumbs, onTogglePin, onSelectGame, onGameContextMenu, onDeleteGame, onQuickLaunch, first }) => {
  const pinned = recentGames.filter(g => pinnedGames.includes(g.placeId));
  if (pinnedGames.length === 0 || pinned.length === 0) return null;
  return (
    <div style={first ? undefined : { marginTop: 24, borderTop: "1px solid var(--g05)", paddingTop: 24 }}>
      <SectionHeader dotColor="#FBBF24" dotShadow="0 0 6px rgba(251,191,36,0.4)" title="Pinned Games" style={{ marginBottom: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
        {pinned.slice(0, 6).map(g => {
          const isSelected = launchPlaceId === g.placeId;
          const hasPrivateServer = !!g.privateServer;
          return (
            <GameCard key={g.placeId} g={g} isSelected={isSelected} hasPrivateServer={hasPrivateServer}
              thumb={thumbs[g.placeId]}
              isPinned={true}
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
