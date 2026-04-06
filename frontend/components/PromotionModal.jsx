const OPTIONS = ["queen", "rook", "bishop", "knight"];

export default function PromotionModal({ open, color, onChoose }) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>Choose Promotion</h2>
        <p>{color} pawn reached the end of the board.</p>
        <div className="promotion-grid">
          {OPTIONS.map((option) => (
            <button key={option} type="button" className="primary-button" onClick={() => onChoose(option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
