const OPTIONS = ["queen", "rook", "bishop", "knight"];

export default function PromotionModal({ open, color, onChoose, t }) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <h2>{t("choosePromotion")}</h2>
        <p>{t("promotionHint", { color: t(color) })}</p>
        <div className="promotion-grid">
          {OPTIONS.map((option) => (
            <button key={option} type="button" className="primary-button" onClick={() => onChoose(option)}>
              {t(option)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
