export default function OnlineLobby({
  t,
  firebaseReady,
  authUser,
  playerName,
  onPlayerNameChange,
  roomCodeInput,
  onRoomCodeInput,
  onGuestSignIn,
  onGoogleSignIn,
  onCreateRoom,
  onJoinRoom,
  statusMessage,
  isCreatingRoom,
  isJoiningRoom,
  historyEntries,
}) {
  return (
    <section className="lobby-card">
      <h2>{t("onlineMultiplayer")}</h2>
      {!firebaseReady ? <p className="muted">{t("firebaseMissing")}</p> : null}
      <p>
        {authUser
          ? t("signedInAs", { name: playerName || authUser.displayName || "Guest" })
          : t("signInToContinue")}
      </p>
      <div className="lobby-actions">
        <button type="button" className="primary-button" onClick={onGuestSignIn} disabled={!firebaseReady}>
          {t("guestLogin")}
        </button>
        <button type="button" className="secondary-button" onClick={onGoogleSignIn} disabled={!firebaseReady}>
          {t("googleLogin")}
        </button>
      </div>
      {authUser ? (
        <div className="lobby-field">
          <label htmlFor="username">{t("username")}</label>
          <input
            id="username"
            value={playerName}
            onChange={(event) => onPlayerNameChange(event.target.value)}
            placeholder={t("usernamePlaceholder")}
            maxLength={24}
          />
        </div>
      ) : null}
      <div className="lobby-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onCreateRoom}
          disabled={!authUser || !firebaseReady || isCreatingRoom || !playerName.trim()}
        >
          {isCreatingRoom ? t("creatingRoom") : t("createRoom")}
        </button>
        <input
          value={roomCodeInput}
          onChange={(event) => onRoomCodeInput(event.target.value.toUpperCase())}
          placeholder={t("roomCodePlaceholder")}
          maxLength={6}
          aria-label={t("roomCode")}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={onJoinRoom}
          disabled={!authUser || !firebaseReady || isJoiningRoom || !playerName.trim()}
        >
          {isJoiningRoom ? t("joiningRoom") : t("joinRoom")}
        </button>
      </div>
      {statusMessage ? <p className="muted">{statusMessage}</p> : null}
      {authUser ? (
        <div className="history-panel">
          <h3>{t("historyTitle")}</h3>
          {historyEntries.length ? (
            <div className="history-list">
              {historyEntries.map((entry) => (
                <div key={entry.id} className="history-item">
                  <p>{entry.opponentName}</p>
                  <p className="muted">{entry.resultLabel}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("historyEmpty")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
