import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { Card } from "../types";
import { cardLabel, isRed, suitSymbols } from "../game/cards";

interface CardViewProps {
  card: Card | null;
  hidden?: boolean;
  selected?: boolean;
  recent?: boolean;
  compact?: boolean;
  draggable?: boolean;
  overlapped?: boolean;
  motionId?: string;
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
  recent = false,
  compact = false,
  draggable = false,
  overlapped = false,
  motionId,
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
  const cornerLabel = card.rank === "JOKER" ? "👑" : `${card.rank}${suit}`;
  const motionStyle: CSSProperties | undefined = motionId
    ? ({ viewTransitionName: `card-${motionId.replace(/[^a-zA-Z0-9_-]/g, "")}` } as CSSProperties)
    : undefined;

  return (
    <button
      className={classNames(
        "card",
        red ? "red" : "black",
        compact && "card-compact",
        overlapped && "card-overlapped",
        selected && "selected",
        recent && "recent-draw"
      )}
      type="button"
      style={motionStyle}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={cardLabel(card)}
    >
      <span className="corner">{cornerLabel}</span>
      <span className="pip">{card.rank === "JOKER" ? "👑" : suit}</span>
      <span className="corner bottom">{cornerLabel}</span>
    </button>
  );
}
