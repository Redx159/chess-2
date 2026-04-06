export default function OnlineLobby({
  firebaseReady,
  authUser,
  roomCodeInput,
  onRoomCodeInput,
  onGuestSignIn,
  onGoogleSignIn,
  onCreateRoom,
  onJoinRoom,
  statusMessage,
  isCreatingRoom,
  isJoiningRoom,
}) {
  return (
    <section className="lobby-card">
      <h2>Online Multiplayer</h2>
      {!firebaseReady ? (
        <p className="muted">
          Add Firebase keys to `.env` to enable authentication, room creation, and live sync.
        </p>
      ) : null}
      <p>{authUser ? `Signed in as ${authUser.displayName || "Guest"}` : "Sign in to create or join rooms."}</p>
      <div className="lobby-actions">
        <button type="button" className="primary-button" onClick={onGuestSignIn} disabled={!firebaseReady}>
          Guest Login
        </button>
        <button type="button" className="secondary-button" onClick={onGoogleSignIn} disabled={!firebaseReady}>
          Google Login
        </button>
      </div>
      <div className="lobby-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onCreateRoom}
          disabled={!authUser || !firebaseReady || isCreatingRoom}
        >
          {isCreatingRoom ? "Creating..." : "Create Room"}
        </button>
        <input
          value={roomCodeInput}
          onChange={(event) => onRoomCodeInput(event.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={6}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={onJoinRoom}
          disabled={!authUser || !firebaseReady || isJoiningRoom}
        >
          {isJoiningRoom ? "Joining..." : "Join Room"}
        </button>
      </div>
      {statusMessage ? <p className="muted">{statusMessage}</p> : null}
    </section>
  );
}
