import { DragEvent, MouseEvent } from "react";
import { Card } from "../types";
import { cardLabel, isRed, suitSymbols } from "../game/cards";

interface CardViewProps {
  card: Card | null;
  hidden?: boolean;
  selected?: boolean;
  compact?: boolean;
  draggable?: boolean;
  overlapped?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: DragEvent<HTMLButtonElement>) => void;
}

export function CardView({
  card,
  hidden = false,
  selected = false,
  compact = false,
  draggable = false,
  overlapped = false,
  onClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: CardViewProps) {
  const classNames = (...values: Array<string | false | undefined>) =>
    values.filter(Boolean).join(" ");

  if (hidden || !card) {
    return (
      <button
        className={classNames(
          "card",
          "card-back",
          compact && "card-compact",
          overlapped && "card-overlapped",
          selected && "selected"
        )}
        type="button"
        draggable={draggable}
        onClick={onClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
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
        overlapped && "card-overlapped",
        selected && "selected"
      )}
      type="button"
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={cardLabel(card)}
    >
      <span className="corner">{card.rank === "JOKER" ? "🤡" : card.rank}</span>
      <span className="pip">{card.rank === "JOKER" ? "🎪" : suit}</span>
      <span className="corner bottom">{card.rank === "JOKER" ? "🤡" : card.rank}</span>
    </button>
  );
}
