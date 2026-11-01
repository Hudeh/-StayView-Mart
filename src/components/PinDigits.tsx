"use client";

import { KeyboardEvent, ClipboardEvent, useEffect, useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  hasError?: boolean;
  resetKey: number;
  onEdit?: () => void;
  onComplete: (pin: string) => void;
};

export function PinDigits({ disabled, hasError, resetKey, onEdit, onComplete }: Props) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setDigits(["", "", "", ""]);
    refs.current[0]?.focus();
  }, [resetKey]);

  function change(index: number, value: string) {
    const nextChar = value.slice(-1);
    if (nextChar && !/^\d$/.test(nextChar)) return;
    const next = [...digits];
    next[index] = nextChar;
    setDigits(next);
    onEdit?.();
    if (nextChar && index < 3) refs.current[index + 1]?.focus();
    if (index === 3 && nextChar) onComplete(next.join(""));
  }

  function keyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  }

  function paste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (!/^\d{4}$/.test(pasted)) return;
    setDigits(pasted.split(""));
    refs.current[3]?.focus();
    onComplete(pasted);
  }

  return (
    <div className="pin-row">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          className={hasError ? "pin-box bad" : "pin-box"}
          value={digit}
          onChange={(event) => change(index, event.target.value)}
          onKeyDown={(event) => keyDown(index, event)}
          onPaste={index === 0 ? paste : undefined}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          aria-label={`PIN digit ${index + 1}`}
          maxLength={1}
        />
      ))}
    </div>
  );
}
