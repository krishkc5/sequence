import { Card } from "../types";
import { cardLabel, isRed, suitSymbols } from "../game/cards";

interface CardViewProps {
  card: Card | null;
  hidden?: boolean;
  selected?: boolean;
  compact?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: () => void;
}

export function CardView({
  card,
  hidden = false,
  selected = false,
  compact = false,
  draggable = false,
  onClick,
  onDragStart
}: CardViewProps) {
  const classNames = (...values: Array<string | false | undefined>) =>
    values.filter(Boolean).join(" ");

  if (hidden || !card) {
    return (
      <button
        className={classNames("card", "card-back", compact && "card-compact", selected && "selected")}
        type="button"
        onClick={onClick}
      >
        <span className="back-mark">S</span>
      </button>
    );
  }

  const red = isRed(card);
  const suit = card.suit ? suitSymbols[card.suit] : "★";

  return (
    <button
      className={classNames(
        "card",
        red ? "red" : "black",
        compact && "card-compact",
        selected && "selected"
      )}
      type="button"
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      title={cardLabel(card)}
    >
      <span className="corner">{card.rank === "JOKER" ? "J" : card.rank}</span>
      <span className="pip">{suit}</span>
      <span className="corner bottom">{card.rank === "JOKER" ? "J" : card.rank}</span>
    </button>
  );
}
