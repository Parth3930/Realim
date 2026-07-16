import React, { useState, useRef, useEffect } from 'react';
import { useBoardStore } from '../../lib/store';
import { MessageSquare, X, Send } from 'lucide-react';
import { nanoid } from 'nanoid';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatProps {
    broadcast: (action: any) => void;
}

export function Chat({ broadcast }: ChatProps) {
    const store = useBoardStore();
    const [isOpen, setIsOpen] = useState(false);
    const [text, setText] = useState('');
    const [unread, setUnread] = useState(0);
    const lastSeenCount = useRef(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setUnread(0);
            lastSeenCount.current = store.messages.length;
        } else {
            const newCount = store.messages.length - lastSeenCount.current;
            if (newCount > 0) setUnread(newCount);
        }
    }, [store.messages.length, isOpen]);

    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [store.messages, isOpen]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        const msg = {
            id: nanoid(),
            sender: store.username,
            text: text.trim(),
            timestamp: Date.now()
        };
        store.addMessage(msg);
        broadcast({ type: 'CHAT_MESSAGE', payload: msg });
        setText('');
    };

    return (
        <>
            {/* Toggle button */}
            <button
                onClick={() => setIsOpen(o => !o)}
                className={cn(
                    "absolute top-24 right-4 sm:right-6 z-50 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-all border-2 touch-manipulation",
                    isOpen
                        ? "bg-[#F5C842] border-[#0A0A0A] text-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A]"
                        : "bg-white border-[#0A0A0A] text-[#0A0A0A]/60 hover:text-[#0A0A0A] shadow-[3px_3px_0_#0A0A0A] hover:shadow-[2px_2px_0_#0A0A0A] hover:translate-x-[1px] hover:translate-y-[1px]"
                )}
            >
                <MessageSquare size={17} />
                {unread > 0 && !isOpen && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#E8553A] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Chat window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute top-40 right-4 sm:right-6 w-72 sm:w-80 h-[360px] max-h-[calc(100vh-12rem)] z-50 flex flex-col rounded-2xl overflow-hidden bg-white border-2 border-[#0A0A0A] shadow-[5px_5px_0_#0A0A0A]"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b-2 border-[#0A0A0A] flex items-center justify-between flex-shrink-0 bg-[#0A0A0A]">
                            <h3 className="font-black text-sm uppercase tracking-widest text-white flex items-center gap-2">
                                <MessageSquare size={13} className="text-[#F5C842]" />
                                Room Chat
                            </h3>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#F5EDDA] [scrollbar-width:thin]">
                            {store.messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-[#0A0A0A]/30 text-xs gap-2">
                                    <MessageSquare size={24} />
                                    <p className="font-bold uppercase tracking-wide">No messages yet. Say hello!</p>
                                </div>
                            ) : (
                                store.messages.map((msg, idx) => {
                                    const isMe = msg.sender === store.username;
                                    const showName = !isMe && (idx === 0 || store.messages[idx - 1].sender !== msg.sender);
                                    return (
                                        <div key={msg.id} className={cn("flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
                                            {showName && (
                                                <span className="text-[10px] font-black text-[#0A0A0A]/40 uppercase tracking-wider ml-1">{msg.sender}</span>
                                            )}
                                            <div className={cn(
                                                "px-3 py-1.5 rounded-xl text-sm max-w-[85%] break-words leading-relaxed font-medium border-2",
                                                isMe
                                                    ? "bg-[#F5C842] text-[#0A0A0A] border-[#0A0A0A] shadow-[2px_2px_0_#0A0A0A] rounded-br-sm"
                                                    : "bg-white text-[#0A0A0A] border-[#0A0A0A]/20 rounded-bl-sm"
                                            )}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t-2 border-[#0A0A0A] flex-shrink-0 bg-white">
                            <form onSubmit={handleSend} className="flex gap-2">
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Message..."
                                    className="flex-1 bg-[#F5EDDA] border-2 border-[#0A0A0A] rounded-xl px-3 py-2 text-sm text-[#0A0A0A] font-medium focus:outline-none focus:border-[#E8553A] transition-colors placeholder:text-[#0A0A0A]/30"
                                />
                                <button
                                    type="submit"
                                    disabled={!text.trim()}
                                    className="p-2 bg-[#0A0A0A] hover:bg-[#E8553A] disabled:opacity-30 rounded-xl text-white transition-colors flex items-center justify-center border-2 border-[#0A0A0A]"
                                >
                                    <Send size={14} />
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
