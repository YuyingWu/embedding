"use client";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new TextStreamChatTransport({
      api: process.env.NODE_ENV === "development" ? "http://localhost:8787/chat" : "/chat",
    }),
  });

  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-zinc-900 selection:bg-zinc-200 dark:bg-[#0A0A0A] dark:text-zinc-100 dark:selection:bg-zinc-800">
      <header className="sticky top-0 z-10 flex items-center justify-center border-b border-zinc-200 bg-[#FAFAFA]/80 px-6 py-4 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0A0A0A]/80">
        <h1 className="text-sm font-medium tracking-widest uppercase text-zinc-500 dark:text-zinc-400">
          Cloudflare RAG
        </h1>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-8">
        <div className="flex-1 space-y-8 pb-24">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-4 text-center opacity-0 animate-[fadeIn_1s_ease-out_forwards]">
              <div className="h-12 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              <p className="text-lg font-light text-zinc-500 dark:text-zinc-400">
                Ask anything about the documentation.
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"
                  } animate-[slideUp_0.3s_ease-out_forwards] opacity-0`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed ${m.role === "user"
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
                    }`}
                >
                  {m.parts
                    .filter((p): p is { type: "text"; text: string } => p.type === "text")
                    .map((p, i) => <span key={i}>{p.text}</span>)}
                </div>
              </div>
            ))
          )}
          {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <div className="flex w-full justify-start animate-[slideUp_0.3s_ease-out_forwards] opacity-0">
              <div className="max-w-[85%] rounded-2xl bg-white px-5 py-3.5 text-[15px] leading-relaxed shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                <div className="flex space-x-1.5">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]"></div>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]"></div>
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#FAFAFA] via-[#FAFAFA] to-transparent pb-6 pt-10 dark:from-[#0A0A0A] dark:via-[#0A0A0A]">
        <div className="mx-auto w-full max-w-2xl px-6">
          <form
            onSubmit={(e) => { e.preventDefault(); const text = input.trim(); if (!text || isLoading) return; sendMessage({ text }); setInput(""); }}
            className="relative flex items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-zinc-900 dark:bg-zinc-900 dark:ring-zinc-800 dark:focus-within:ring-zinc-100"
          >
            <input
              className="w-full bg-transparent py-4 pl-6 pr-12 text-[15px] outline-none placeholder:text-zinc-400"
              value={input}
              placeholder="Type your message..."
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-zinc-400 dark:text-zinc-500">
            AI can make mistakes. Consider verifying important information.
          </div>
        </div>
      </div>
    </div>
  );
}
