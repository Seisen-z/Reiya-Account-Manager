import { FC, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "./Toast";
import { HomeModal, FieldLabel, ErrorMsg, Toggle, Account } from "../pages/Home";

function MiniAvatar({ name, avatarUrl, size }: { name: string; avatarUrl: string; size: number }) {
  const [err, setErr] = useState(false);
  if (avatarUrl && !err) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%", background: "var(--g06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 800, color: "var(--t2)",
      }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

export const AccountConfigSidebarModal: FC<{
  account: Account | null;
  onClose: () => void;
  onRefresh: () => void;
  onRemoveAccount?: (userId: number, username: string) => void;
}> = ({ account, onClose, onRefresh, onRemoveAccount }) => {
  const { t } = useLanguage();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"general" | "games" | "notes" | "utilities" | "security">("general");

  // General & Games Form state
  const [displayName, setDisplayName] = useState("");
  const [group, setGroup] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);

  const [defaultPlaceId, setDefaultPlaceId] = useState("");
  const [defaultGameName, setDefaultGameName] = useState("");
  const [favoriteGames, setFavoriteGames] = useState("");
  const [safeLaunch, setSafeLaunch] = useState(false);
  const [autoRejoin, setAutoRejoin] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Utilities state
  const [utilNewDisplayName, setUtilNewDisplayName] = useState("");
  const [utilCurrentPassword, setUtilCurrentPassword] = useState("");
  const [utilNewPassword, setUtilNewPassword] = useState("");
  const [utilTargetUser, setUtilTargetUser] = useState("");
  const [utilStatus, setUtilStatus] = useState("");
  const [utilIsError, setUtilIsError] = useState(false);
  const [utilLoading, setUtilLoading] = useState(false);

  // Security & Cookie state
  const [cookieValue, setCookieValue] = useState("");
  const [showCookie, setShowCookie] = useState(false);
  const [cookieLoading, setCookieLoading] = useState(false);

  useEffect(() => {
    if (account) {
      setDisplayName(account.display_name || "");
      setGroup(account.group || "");
      setIsFavorite(!!account.is_favorite);
      setDefaultPlaceId(account.default_place_id || "");
      setDefaultGameName(account.default_game_name || "");
      setFavoriteGames(localStorage.getItem("reiya_fav_games_" + account.user_id) || "");
      setSafeLaunch(!!account.safe_launch_enabled);
      setAutoRejoin(!!account.auto_rejoin_enabled);
      setCooldown(account.launch_cooldown_seconds ?? 0);
      setNotes(account.notes || "");
      setTags((account.tags || []).join(", "));
      setErrorMsg("");
      setShowCookie(false);
      setCookieValue("");
    }
  }, [account]);

  if (!account) return null;

  const isValid = account.cookie_status === "Valid";
  const statusColor = isValid ? "var(--green)" : "var(--red)";

  const handleSaveGeneralAndGames = async () => {
    setSaving(true);
    setErrorMsg("");
    try {
      localStorage.setItem("reiya_fav_games_" + account.user_id, favoriteGames.trim());
      const tagsList = tags.split(",").map(s => s.trim()).filter(Boolean);
      await invoke("edit_account", {
        userId: account.user_id,
        displayName: displayName.trim() || null,
        notes: notes.trim(),
        tags: tagsList,
        defaultPlaceId: defaultPlaceId.trim(),
        safeLaunchEnabled: safeLaunch,
        autoRejoinEnabled: autoRejoin,
        launchCooldownSeconds: cooldown,
      });

      if (group !== (account.group || "")) {
        await invoke("set_account_group", { userId: account.user_id, group: group.trim() || null });
      }

      if (isFavorite !== !!account.is_favorite) {
        await invoke("toggle_favorite", { userId: account.user_id });
      }

      toast.success("Account settings updated successfully");
      onRefresh();
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setSaving(false);
    }
  };

  const getCookie = async (): Promise<string> => {
    return await invoke<string>("get_account_cookie", { userId: account.user_id });
  };

  const handleFetchCookie = async () => {
    setCookieLoading(true);
    try {
      const ck = await getCookie();
      setCookieValue(ck);
      setShowCookie(true);
    } catch (e) {
      toast.error("Failed to decrypt cookie: " + e);
    } finally {
      setCookieLoading(false);
    }
  };

  const handleCopyCookie = async () => {
    try {
      const ck = cookieValue || await getCookie();
      await navigator.clipboard.writeText(ck);
      toast.success(t("cookie_copied"));
    } catch (e) {
      toast.error("Failed to copy cookie: " + e);
    }
  };

  const handleExportConfig = async () => {
    try {
      const cfg = {
        Username: account.username,
        UserId: account.user_id,
        Tags: tags.split(",").map(s => s.trim()).filter(Boolean),
        Notes: notes,
        DefaultPlaceId: defaultPlaceId,
        DefaultGameName: defaultGameName,
        IsFavorite: isFavorite,
        SafeLaunchEnabled: safeLaunch,
        AutoRejoinEnabled: autoRejoin,
        LaunchCooldownSeconds: cooldown,
      };
      await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
      toast.success(t("config_copied"));
    } catch (e) {
      toast.error("Export failed: " + e);
    }
  };

  const handleImportConfig = async () => {
    try {
      const clipText = await readText();
      if (!clipText) { toast.error(t("clipboard_empty")); return; }
      const parsed = JSON.parse(clipText);
      if (typeof parsed !== "object" || parsed === null) { toast.error(t("invalid_json_format")); return; }
      if (parsed.DisplayName) setDisplayName(parsed.DisplayName);
      if (parsed.Notes) setNotes(parsed.Notes);
      if (Array.isArray(parsed.Tags)) setTags(parsed.Tags.join(", "));
      if (parsed.DefaultPlaceId) setDefaultPlaceId(parsed.DefaultPlaceId);
      if (parsed.SafeLaunchEnabled !== undefined) setSafeLaunch(Boolean(parsed.SafeLaunchEnabled));
      if (parsed.AutoRejoinEnabled !== undefined) setAutoRejoin(Boolean(parsed.AutoRejoinEnabled));
      if (parsed.LaunchCooldownSeconds !== undefined) setCooldown(Number(parsed.LaunchCooldownSeconds));
      toast.success(t("config_imported"));
    } catch (e) {
      toast.error("Import failed: " + e);
    }
  };

  // Utilities actions
  const handleSetRobloxDisplayName = async () => {
    if (!utilNewDisplayName.trim()) return;
    setUtilLoading(true); setUtilStatus(""); setUtilIsError(false);
    try {
      const ck = await getCookie();
      const res = await invoke<string>("set_display_name", { cookie: ck, newDisplayName: utilNewDisplayName.trim() });
      setUtilStatus(res);
      setUtilNewDisplayName("");
      onRefresh();
    } catch (e) {
      setUtilStatus(String(e)); setUtilIsError(true);
    } finally { setUtilLoading(false); }
  };

  const handleChangePassword = async () => {
    if (!utilCurrentPassword || !utilNewPassword) return;
    setUtilLoading(true); setUtilStatus(""); setUtilIsError(false);
    try {
      const ck = await getCookie();
      const res = await invoke<string>("change_password", { cookie: ck, currentPassword: utilCurrentPassword, newPassword: utilNewPassword });
      setUtilStatus(res);
      setUtilCurrentPassword(""); setUtilNewPassword("");
      onRefresh();
    } catch (e) {
      setUtilStatus(String(e)); setUtilIsError(true);
    } finally { setUtilLoading(false); }
  };

  const handleSignOutAll = async () => {
    setUtilLoading(true); setUtilStatus(""); setUtilIsError(false);
    try {
      const ck = await getCookie();
      const res = await invoke<string>("sign_out_all_sessions", { cookie: ck });
      setUtilStatus(res);
    } catch (e) {
      setUtilStatus(String(e)); setUtilIsError(true);
    } finally { setUtilLoading(false); }
  };

  const handleSendFriend = async () => {
    if (!utilTargetUser.trim()) return;
    setUtilLoading(true); setUtilStatus(""); setUtilIsError(false);
    try {
      const ck = await getCookie();
      const res = await invoke<string>("send_friend_request", { cookie: ck, targetUsername: utilTargetUser.trim() });
      setUtilStatus(res);
      setUtilTargetUser("");
    } catch (e) {
      setUtilStatus(String(e)); setUtilIsError(true);
    } finally { setUtilLoading(false); }
  };

  const handleBlockUser = async () => {
    if (!utilTargetUser.trim()) return;
    setUtilLoading(true); setUtilStatus(""); setUtilIsError(false);
    try {
      const ck = await getCookie();
      const res = await invoke<string>("block_user", { cookie: ck, targetUsername: utilTargetUser.trim() });
      setUtilStatus(res);
      setUtilTargetUser("");
    } catch (e) {
      setUtilStatus(String(e)); setUtilIsError(true);
    } finally { setUtilLoading(false); }
  };

  const addedDateStr = (account as any).added_at
    ? new Date((account as any).added_at).toLocaleDateString()
    : "Saved";

  return (
    <HomeModal title={`Account Settings — @${account.username}`} onClose={onClose} wide>
      <div style={{ display: "flex", height: 480, margin: "-12px -16px", borderRadius: 14, overflow: "hidden", background: "var(--g02)" }}>
        {/* LEFT SIDEBAR TABS */}
        <div style={{ width: 190, borderRight: "1px solid var(--g06)", background: "var(--panel-bg)", padding: "14px 10px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {/* Account Profile Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", marginBottom: 10, borderBottom: "1px solid var(--g05)" }}>
            <MiniAvatar name={account.username} avatarUrl={account.avatar_url} size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {account.display_name || account.username}
              </div>
              <div style={{ fontSize: 9.5, color: statusColor, fontWeight: 700 }}>
                {account.cookie_status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          {[
            { id: "general", label: "General & Profile", icon: "👤" },
            { id: "games", label: "Games & Launch", icon: "🎮" },
            { id: "notes", label: "Notes & Tags", icon: "📝" },
            { id: "utilities", label: "Account Utilities", icon: "⚙️" },
            { id: "security", label: "Security & Cookie", icon: "🔒" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "8px 10px", borderRadius: 8, border: "none",
                background: activeTab === tab.id ? "var(--g06)" : "transparent",
                color: activeTab === tab.id ? "#FFFFFF" : "var(--t3)",
                fontSize: 11, fontWeight: activeTab === tab.id ? 800 : 600,
                cursor: "pointer", textAlign: "left", transition: "all .12s",
              }}
            >
              <span style={{ fontSize: 13 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}

          {/* Remove Account Button at Bottom */}
          {onRemoveAccount && (
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px solid var(--g05)" }}>
              <button
                onClick={() => {
                  onClose();
                  onRemoveAccount(account.user_id, account.username);
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,0.25)",
                  background: "rgba(248,113,113,0.08)", color: "var(--red)",
                  fontSize: 10.5, fontWeight: 800, cursor: "pointer", transition: "all .12s",
                }}
              >
                <span>🗑️</span> Remove Account
              </button>
            </div>
          )}
        </div>

        {/* RIGHT CONTENT CONFIGURATION PANE */}
        <div style={{ flex: 1, padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {errorMsg && <ErrorMsg msg={errorMsg} />}

          {/* TAB 1: GENERAL & PROFILE */}
          {activeTab === "general" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--t1)", letterSpacing: "-0.2px" }}>GENERAL PROFILE SETTINGS</span>

              <div>
                <FieldLabel>{t("display_name_label")}</FieldLabel>
                <input
                  className="field glass-input"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder={t("leave_empty_username_desc")}
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel>Group / Category</FieldLabel>
                <input
                  className="field glass-input"
                  value={group}
                  onChange={e => setGroup(e.target.value)}
                  placeholder="e.g. Main, Farming, Alts..."
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div style={{ padding: "10px 14px", background: "var(--g03)", borderRadius: 10, border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
                  <span style={{ color: "var(--t3)" }}>Roblox User ID:</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{account.user_id}</span>
                </div>
                <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
                  <span style={{ color: "var(--t3)" }}>Added Date:</span>
                  <span>{addedDateStr}</span>
                </div>
                <div style={{ fontSize: 11, display: "flex", justifyContent: "space-between", color: "var(--t2)" }}>
                  <span style={{ color: "var(--t3)" }}>Cookie Health:</span>
                  <span style={{ color: statusColor, fontWeight: 800 }}>{account.cookie_status}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                <Toggle label="Favorite / Pin" value={isFavorite} onChange={setIsFavorite} />
              </div>
            </div>
          )}

          {/* TAB 2: GAMES & LAUNCH */}
          {activeTab === "games" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#A78BFA", letterSpacing: "-0.2px" }}>GAME LAUNCH CONFIGURATION</span>

              <div>
                <FieldLabel>{t("default_place_id_label")}</FieldLabel>
                <input
                  className="field glass-input"
                  value={defaultPlaceId}
                  onChange={e => setDefaultPlaceId(e.target.value)}
                  placeholder={t("roblox_game_place_id_desc")}
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel>Default Game Name</FieldLabel>
                <input
                  className="field glass-input"
                  value={defaultGameName}
                  onChange={e => setDefaultGameName(e.target.value)}
                  placeholder="e.g. Anime Expedition, The Forge..."
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel>Favorite Games (Place IDs)</FieldLabel>
                <input
                  className="field glass-input"
                  value={favoriteGames}
                  onChange={e => setFavoriteGames(e.target.value)}
                  placeholder="e.g. 7882829745, 123456789"
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
                <div style={{ fontSize: 9.5, color: "var(--t3)", marginTop: 4 }}>
                  Enter Place IDs separated by commas. Game thumbnails will be displayed on the account card.
                </div>
              </div>

              <div>
                <FieldLabel>{t("launch_cooldown_label")}</FieldLabel>
                <input
                  type="number"
                  className="field glass-input"
                  value={cooldown}
                  onChange={e => setCooldown(Number(e.target.value))}
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
                <Toggle label={t("safe_launch")} value={safeLaunch} onChange={setSafeLaunch} />
                <Toggle label={t("auto_rejoin")} value={autoRejoin} onChange={setAutoRejoin} />
              </div>
            </div>
          )}

          {/* TAB 3: NOTES & TAGS */}
          {activeTab === "notes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#60A5FA", letterSpacing: "-0.2px" }}>NOTES & CUSTOM TAGS</span>

              <div>
                <FieldLabel>{t("tags_label")}</FieldLabel>
                <input
                  className="field glass-input"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder={t("tags_placeholder")}
                  style={{ width: "100%", height: 34, fontSize: 11.5, outline: "none" }}
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel>{t("description_notes_label")}</FieldLabel>
                <textarea
                  className="field glass-input"
                  rows={5}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={t("notes_placeholder")}
                  style={{ width: "100%", fontSize: 11.5, outline: "none", resize: "vertical" }}
                  disabled={saving}
                />
              </div>
            </div>
          )}

          {/* TAB 4: ACCOUNT UTILITIES */}
          {activeTab === "utilities" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--amber)", letterSpacing: "-0.2px" }}>ROBLOX ACCOUNT UTILITIES</span>

              {utilStatus && (
                <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: utilIsError ? "rgba(248,113,113,0.12)" : "rgba(52,211,153,0.12)", color: utilIsError ? "var(--red)" : "var(--green)", border: `1px solid ${utilIsError ? "rgba(248,113,113,0.25)" : "rgba(52,211,153,0.25)"}` }}>
                  {utilStatus}
                </div>
              )}

              {/* Set Display Name */}
              <div>
                <FieldLabel>Change Roblox Display Name</FieldLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="field glass-input"
                    value={utilNewDisplayName}
                    onChange={e => setUtilNewDisplayName(e.target.value)}
                    placeholder="New display name"
                    style={{ flex: 1, height: 32, fontSize: 11, outline: "none" }}
                    disabled={utilLoading}
                  />
                  <button onClick={handleSetRobloxDisplayName} disabled={utilLoading || !utilNewDisplayName.trim()} className="btn" style={{ padding: "0 12px", fontSize: 10.5, fontWeight: 800 }}>
                    Update
                  </button>
                </div>
              </div>

              {/* Password Change */}
              <div>
                <FieldLabel>Change Roblox Password</FieldLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="password"
                    className="field glass-input"
                    value={utilCurrentPassword}
                    onChange={e => setUtilCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    style={{ width: "100%", height: 32, fontSize: 11, outline: "none" }}
                    disabled={utilLoading}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="password"
                      className="field glass-input"
                      value={utilNewPassword}
                      onChange={e => setUtilNewPassword(e.target.value)}
                      placeholder="New password"
                      style={{ flex: 1, height: 32, fontSize: 11, outline: "none" }}
                      disabled={utilLoading}
                    />
                    <button onClick={handleChangePassword} disabled={utilLoading || !utilCurrentPassword || !utilNewPassword} className="btn" style={{ padding: "0 12px", fontSize: 10.5, fontWeight: 800 }}>
                      Change
                    </button>
                  </div>
                </div>
              </div>

              {/* Friends & Block */}
              <div>
                <FieldLabel>Social Actions (Friend / Block)</FieldLabel>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="field glass-input"
                    value={utilTargetUser}
                    onChange={e => setUtilTargetUser(e.target.value)}
                    placeholder="Target username"
                    style={{ flex: 1, height: 32, fontSize: 11, outline: "none" }}
                    disabled={utilLoading}
                  />
                  <button onClick={handleSendFriend} disabled={utilLoading || !utilTargetUser.trim()} className="btn btn-ghost" style={{ padding: "0 10px", fontSize: 10.5 }}>
                    Friend
                  </button>
                  <button onClick={handleBlockUser} disabled={utilLoading || !utilTargetUser.trim()} className="btn btn-ghost" style={{ padding: "0 10px", fontSize: 10.5, color: "var(--red)" }}>
                    Block
                  </button>
                </div>
              </div>

              {/* Sign Out All Sessions */}
              <div style={{ marginTop: 4 }}>
                <button onClick={handleSignOutAll} disabled={utilLoading} className="btn btn-ghost" style={{ width: "100%", padding: "7px 0", fontSize: 11, color: "var(--amber)" }}>
                  Sign Out All Other Sessions
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: SECURITY & COOKIE */}
          {activeTab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 900, color: "var(--red)", letterSpacing: "-0.2px" }}>SECURITY & COOKIE MANAGEMENT</span>

              <div>
                <FieldLabel>Roblox Cookie (.ROBLOSECURITY)</FieldLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {showCookie ? (
                    <textarea
                      readOnly
                      rows={3}
                      value={cookieValue}
                      style={{ width: "100%", fontSize: 10, fontFamily: "monospace", padding: 8, borderRadius: 8, background: "var(--g03)", border: "1px solid var(--g07)", color: "var(--t2)", outline: "none", resize: "none" }}
                    />
                  ) : (
                    <div style={{ padding: "10px 14px", background: "rgba(248,113,113,0.06)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)", fontSize: 11, color: "var(--t3)" }}>
                      ⚠️ Roblox cookies grant full access to your account. Keep them secure.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    {!showCookie ? (
                      <button onClick={handleFetchCookie} disabled={cookieLoading} className="btn btn-ghost" style={{ flex: 1, fontSize: 10.5 }}>
                        {cookieLoading ? "Decrypting..." : "Reveal Cookie"}
                      </button>
                    ) : (
                      <button onClick={() => setShowCookie(false)} className="btn btn-ghost" style={{ flex: 1, fontSize: 10.5 }}>
                        Hide Cookie
                      </button>
                    )}
                    <button onClick={handleCopyCookie} className="btn" style={{ flex: 1, fontSize: 10.5, fontWeight: 800 }}>
                      Copy Cookie
                    </button>
                  </div>
                </div>
              </div>

              {/* Export / Import Config */}
              <div style={{ padding: "12px 14px", background: "var(--g03)", borderRadius: 10, border: "1px solid var(--g05)", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)" }}>EXPORT & IMPORT CONFIG</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleExportConfig} className="btn btn-ghost" style={{ flex: 1, fontSize: 10.5 }}>
                    Copy Config JSON
                  </button>
                  <button onClick={handleImportConfig} className="btn btn-ghost" style={{ flex: 1, fontSize: 10.5 }}>
                    Paste Config JSON
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Save Action Bar for editable tabs */}
          {(activeTab === "general" || activeTab === "games" || activeTab === "notes") && (
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--g06)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} disabled={saving} className="btn btn-ghost" style={{ padding: "0 16px", height: 34, fontSize: 11 }}>
                Cancel
              </button>
              <button onClick={handleSaveGeneralAndGames} disabled={saving} className="btn" style={{ padding: "0 22px", height: 34, background: "#FFFFFF", color: "#000", fontWeight: 800, fontSize: 11 }}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          )}
        </div>
      </div>
    </HomeModal>
  );
};
