"use client";
import { MessageCircle } from "lucide-react";

export function askAva(message?: string) {
  window.dispatchEvent(new CustomEvent("dc:chat", { detail: { message, open: true } }));
}

export default function AskAva({ message, label, className = "btn-primary" }: { message?: string; label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => askAva(message)}>
      <MessageCircle size={16} /> {label}
    </button>
  );
}
